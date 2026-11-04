"""The one vocal pitch analysis: glides, sustain, vibrato, and ornamentation from a vocal stem.

Runs pYIN on a separated vocal stem (on a full mix it tracks the bass instead) and summarizes the
pitch contour of each window in semitones, so values compare across singers with different ranges.
All parameters come from `VocalConfig`.
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
    def from_semitones(cls, semitones: np.ndarray, vocal: VocalConfig = DEFAULT.vocal) -> PitchContour:
        rate = vocal.sample_rate / vocal.hop
        return cls(np.arange(len(semitones)) / rate, np.asarray(semitones, dtype=np.float64), rate)


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

    def to_vector(self) -> np.ndarray:
        return np.array(astuple(self), dtype=np.float64)

    def to_dict(self) -> dict[str, float]:
        return {key: round(float(value), 4) for key, value in asdict(self).items()}


def track_pitch(vocals: np.ndarray, sample_rate: int, vocal: VocalConfig = DEFAULT.vocal) -> PitchContour:
    """pYIN contour of a mono vocal stem."""
    if sample_rate != vocal.sample_rate:
        vocals = librosa.resample(np.asarray(vocals, dtype=np.float32), orig_sr=sample_rate, target_sr=vocal.sample_rate)
    f0, voiced, _ = librosa.pyin(vocals, fmin=vocal.fmin_hz, fmax=vocal.fmax_hz, sr=vocal.sample_rate,
                                 frame_length=1024, hop_length=vocal.hop)
    semitones = np.where(voiced, librosa.hz_to_midi(np.nan_to_num(f0, nan=1.0)), np.nan)
    return PitchContour.from_semitones(semitones, vocal)


def _voiced_runs(semitones: np.ndarray, min_frames: int) -> list[np.ndarray]:
    voiced = ~np.isnan(semitones)
    edges = np.flatnonzero(np.diff(np.concatenate([[0], voiced.astype(int), [0]])))
    return [semitones[start:end] for start, end in zip(edges[::2], edges[1::2]) if end - start >= min_frames]


def _vibrato(run: np.ndarray, frame_rate: float, vocal: VocalConfig) -> tuple[float, float]:
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
    in_band = vocal.vibrato_min_hz <= frequencies[peak] <= vocal.vibrato_max_hz
    if not in_band or spectrum[peak] < 2.0 * np.median(spectrum[1:] + 1e-9):
        return 0.0, 0.0
    return float(frequencies[peak]), float(2.0 * np.std(wobble))


def describe_window(contour: PitchContour, start_sec: float, end_sec: float,
                    vocal: VocalConfig = DEFAULT.vocal) -> VocalDescriptors:
    mask = (contour.times >= start_sec) & (contour.times < end_sec)
    semitones, times = contour.semitones[mask], contour.times[mask]
    voiced = ~np.isnan(semitones)
    duration = max(end_sec - start_sec, 1e-6)
    if voiced.sum() < 10:
        return VocalDescriptors(float(voiced.mean()) if voiced.size else 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0)

    rate = contour.frame_rate
    pitched = semitones[voiced]
    glide = float(np.polyfit(times[voiced], pitched, 1)[0])
    # Mean, not median: pYIN pitch is quantized to 0.1 st, so the median step is almost always 0.
    steps = np.abs(np.diff(semitones))
    steps = steps[np.isfinite(steps) & (steps < vocal.max_step_st)]
    velocity = float(steps.mean() * rate) if steps.size else 0.0

    longest = max((len(run) for run in _voiced_runs(semitones, 1)), default=0) / rate
    vibratos = [(_vibrato(run, rate, vocal), len(run)) for run in _voiced_runs(semitones, int(vocal.min_run_sec * rate))]
    weight = sum(n for (r, _), n in vibratos if r > 0)
    vibrato_rate = sum(r * n for (r, _), n in vibratos if r > 0) / weight if weight else 0.0
    vibrato_extent = sum(e * n for (r, e), n in vibratos if r > 0) / weight if weight else 0.0

    # Ornaments: short, prominent pitch turns (murki, kan) in either direction.
    max_width = max(1, int(vocal.ornament_max_width_sec * rate))
    turns = 0
    for run in _voiced_runs(semitones, 5):
        for signal in (run, -run):
            peaks, _ = find_peaks(signal, prominence=vocal.ornament_prominence_st, width=(1, max_width))
            turns += len(peaks)

    return VocalDescriptors(
        voiced_fraction=float(voiced.mean()),
        median_pitch_st=float(np.median(pitched)),
        pitch_range_st=float(np.percentile(pitched, 95) - np.percentile(pitched, 5)),
        glide_st_per_sec=glide,
        pitch_velocity_st_per_sec=velocity,
        longest_sustain_sec=float(longest),
        vibrato_rate_hz=float(vibrato_rate),
        vibrato_extent_st=float(vibrato_extent),
        ornament_rate_per_sec=turns / duration,
    )
