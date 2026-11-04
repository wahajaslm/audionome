"""The one vocal pitch analysis: glides, sustain, vibrato, and ornamentation from a vocal stem.

Runs pYIN on a separated vocal stem (on a full mix it tracks the bass instead) and summarizes the
pitch contour of each window in semitones, so values compare across singers with different ranges.
"""
from __future__ import annotations
from dataclasses import asdict, astuple, dataclass

import librosa
import numpy as np
from scipy.signal import find_peaks

from musicdna.config import DEFAULT, VocalConfig


@dataclass
class PitchContour:
    times: np.ndarray
    semitones: np.ndarray  # MIDI note numbers; NaN where unvoiced
    frame_rate: float

    @classmethod
    def from_semitones(cls, semitones: np.ndarray, settings: VocalConfig = DEFAULT.vocal) -> PitchContour:
        rate = settings.sample_rate / settings.hop
        return cls(np.arange(len(semitones)) / rate, np.asarray(semitones, dtype=np.float64), rate)

    def span(self, start_sec: float, end_sec: float) -> tuple[np.ndarray, np.ndarray]:
        mask = (self.times >= start_sec) & (self.times < end_sec)
        return self.times[mask], self.semitones[mask]


@dataclass
class VocalDescriptors:
    voiced_fraction: float
    median_pitch_st: float
    pitch_range_st: float
    glide_st_per_sec: float
    pitch_velocity_st_per_sec: float
    longest_sustain_sec: float
    vibrato_rate_hz: float
    vibrato_extent_st: float
    ornament_rate_per_sec: float

    NAMES = ('voiced_fraction', 'median_pitch_st', 'pitch_range_st', 'glide_st_per_sec',
             'pitch_velocity_st_per_sec', 'longest_sustain_sec', 'vibrato_rate_hz',
             'vibrato_extent_st', 'ornament_rate_per_sec')

    @classmethod
    def silent(cls, voiced_fraction: float = 0.0) -> VocalDescriptors:
        return cls(voiced_fraction, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0)

    def to_vector(self) -> np.ndarray:
        return np.array(astuple(self), dtype=np.float64)

    def to_dict(self) -> dict[str, float]:
        return {key: round(float(value), 4) for key, value in asdict(self).items()}


class VocalPitchAnalyzer:
    """pYIN pitch tracking and per-window pitch-contour descriptors, configured by `VocalConfig`."""

    def __init__(self, settings: VocalConfig = DEFAULT.vocal) -> None:
        self.settings = settings

    def track(self, vocals: np.ndarray, sample_rate: int) -> PitchContour:
        """pYIN contour of a mono vocal stem."""
        s = self.settings
        if sample_rate != s.sample_rate:
            vocals = librosa.resample(np.asarray(vocals, dtype=np.float32), orig_sr=sample_rate, target_sr=s.sample_rate)
        f0, voiced, _ = librosa.pyin(vocals, fmin=s.fmin_hz, fmax=s.fmax_hz, sr=s.sample_rate,
                                     frame_length=1024, hop_length=s.hop)
        semitones = np.where(voiced, librosa.hz_to_midi(np.nan_to_num(f0, nan=1.0)), np.nan)
        return PitchContour.from_semitones(semitones, s)

    def describe(self, contour: PitchContour, start_sec: float, end_sec: float) -> VocalDescriptors:
        times, semitones = contour.span(start_sec, end_sec)
        voiced = ~np.isnan(semitones)
        if voiced.sum() < 10:
            return VocalDescriptors.silent(float(voiced.mean()) if voiced.size else 0.0)
        pitched = semitones[voiced]
        vibrato_rate, vibrato_extent = self._vibrato(semitones, contour.frame_rate)
        return VocalDescriptors(
            voiced_fraction=float(voiced.mean()),
            median_pitch_st=float(np.median(pitched)),
            pitch_range_st=float(np.percentile(pitched, 95) - np.percentile(pitched, 5)),
            glide_st_per_sec=float(np.polyfit(times[voiced], pitched, 1)[0]),
            pitch_velocity_st_per_sec=self._velocity(semitones, contour.frame_rate),
            longest_sustain_sec=max((len(run) for run in self._voiced_runs(semitones, 1)), default=0) / contour.frame_rate,
            vibrato_rate_hz=vibrato_rate,
            vibrato_extent_st=vibrato_extent,
            ornament_rate_per_sec=self._ornament_count(semitones, contour.frame_rate) / max(end_sec - start_sec, 1e-6),
        )

    def _velocity(self, semitones: np.ndarray, frame_rate: float) -> float:
        # Mean, not median: pYIN pitch is quantized to 0.1 st, so the median step is almost always 0.
        steps = np.abs(np.diff(semitones))
        steps = steps[np.isfinite(steps) & (steps < self.settings.max_step_st)]
        return float(steps.mean() * frame_rate) if steps.size else 0.0

    def _vibrato(self, semitones: np.ndarray, frame_rate: float) -> tuple[float, float]:
        """Run-length-weighted vibrato rate and extent over voiced runs long enough to show one."""
        found = [(self._run_vibrato(run, frame_rate), len(run))
                 for run in self._voiced_runs(semitones, int(self.settings.min_run_sec * frame_rate))]
        weight = sum(n for (rate, _), n in found if rate > 0)
        if not weight:
            return 0.0, 0.0
        return (sum(rate * n for (rate, _), n in found if rate > 0) / weight,
                sum(extent * n for (rate, extent), n in found if rate > 0) / weight)

    def _run_vibrato(self, run: np.ndarray, frame_rate: float) -> tuple[float, float]:
        """Dominant oscillation in the vibrato band after removing the slow melodic line."""
        smoothing = max(3, int(0.25 * frame_rate) | 1)
        trend = np.convolve(run, np.ones(smoothing) / smoothing, mode='same')
        wobble = (run - trend)[smoothing // 2: len(run) - smoothing // 2]
        if wobble.size < int(frame_rate * 0.4):
            return 0.0, 0.0
        spectrum = np.abs(np.fft.rfft(wobble * np.hanning(wobble.size)))
        frequencies = np.fft.rfftfreq(wobble.size, d=1.0 / frame_rate)
        # The strongest wobble anywhere in 1.5-15 Hz must itself sit inside the vibrato band; checking only
        # inside the band would accept leakage from a stronger oscillation just outside it.
        search = (frequencies >= 1.5) & (frequencies <= 15.0)
        if not search.any():
            return 0.0, 0.0
        peak = int(np.flatnonzero(search)[np.argmax(spectrum[search])])
        in_band = self.settings.vibrato_min_hz <= frequencies[peak] <= self.settings.vibrato_max_hz
        if not in_band or spectrum[peak] < 2.0 * np.median(spectrum[1:] + 1e-9):
            return 0.0, 0.0
        return float(frequencies[peak]), float(2.0 * np.std(wobble))

    def _ornament_count(self, semitones: np.ndarray, frame_rate: float) -> int:
        """Short, prominent pitch turns (murki, kan) in either direction."""
        max_width = max(1, int(self.settings.ornament_max_width_sec * frame_rate))
        turns = 0
        for run in self._voiced_runs(semitones, 5):
            for signal in (run, -run):
                peaks, _ = find_peaks(signal, prominence=self.settings.ornament_prominence_st, width=(1, max_width))
                turns += len(peaks)
        return turns

    @staticmethod
    def _voiced_runs(semitones: np.ndarray, min_frames: int) -> list[np.ndarray]:
        voiced = ~np.isnan(semitones)
        edges = np.flatnonzero(np.diff(np.concatenate([[0], voiced.astype(int), [0]])))
        return [semitones[start:end] for start, end in zip(edges[::2], edges[1::2]) if end - start >= min_frames]
