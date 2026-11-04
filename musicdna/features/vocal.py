"""Fine-grained vocal pitch descriptors for R01: glides, sustain, vibrato, and ornamentation.

Runs pYIN on a separated vocal stem (on a full mix it tracks the bass instead) and summarizes the
pitch contour of each window in semitones, so values compare across singers with different ranges.
"""
from __future__ import annotations
from dataclasses import astuple, dataclass

import librosa
import numpy as np
from scipy.signal import find_peaks

PITCH_SAMPLE_RATE = 16000
PITCH_HOP = 160  # 10 ms frames
PITCH_FMIN_HZ = 70.0
PITCH_FMAX_HZ = 1100.0
VIBRATO_BAND_HZ = (4.0, 8.5)
MIN_RUN_SEC = 0.5
ORNAMENT_PROMINENCE_ST = 0.75
ORNAMENT_MAX_WIDTH_SEC = 0.3


@dataclass
class PitchContour:
    times: np.ndarray
    semitones: np.ndarray  # MIDI note numbers; NaN where unvoiced

    @property
    def frame_rate(self) -> float:
        return PITCH_SAMPLE_RATE / PITCH_HOP


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


def track_pitch(vocals: np.ndarray) -> PitchContour:
    """pYIN contour of a mono vocal stem sampled at PITCH_SAMPLE_RATE."""
    f0, voiced, _ = librosa.pyin(vocals, fmin=PITCH_FMIN_HZ, fmax=PITCH_FMAX_HZ, sr=PITCH_SAMPLE_RATE,
                                 frame_length=1024, hop_length=PITCH_HOP)
    semitones = np.where(voiced, librosa.hz_to_midi(np.nan_to_num(f0, nan=1.0)), np.nan)
    return PitchContour(librosa.times_like(f0, sr=PITCH_SAMPLE_RATE, hop_length=PITCH_HOP), semitones)


def _voiced_runs(semitones: np.ndarray, min_frames: int) -> list[np.ndarray]:
    voiced = ~np.isnan(semitones)
    edges = np.flatnonzero(np.diff(np.concatenate([[0], voiced.astype(int), [0]])))
    return [semitones[start:end] for start, end in zip(edges[::2], edges[1::2]) if end - start >= min_frames]


def _vibrato(run: np.ndarray, frame_rate: float) -> tuple[float, float]:
    """Dominant 4-8.5 Hz oscillation after removing the slow melodic line."""
    smoothing = max(3, int(0.25 * frame_rate) | 1)
    trend = np.convolve(run, np.ones(smoothing) / smoothing, mode='same')
    wobble = (run - trend)[smoothing // 2: len(run) - smoothing // 2]
    if wobble.size < int(frame_rate * 0.4):
        return 0.0, 0.0
    spectrum = np.abs(np.fft.rfft(wobble * np.hanning(wobble.size)))
    frequencies = np.fft.rfftfreq(wobble.size, d=1.0 / frame_rate)
    band = (frequencies >= VIBRATO_BAND_HZ[0]) & (frequencies <= VIBRATO_BAND_HZ[1])
    if not band.any() or spectrum[band].max() < 2.0 * np.median(spectrum[1:] + 1e-9):
        return 0.0, 0.0
    return float(frequencies[band][np.argmax(spectrum[band])]), float(2.0 * np.std(wobble))


def describe_window(contour: PitchContour, start_sec: float, end_sec: float) -> VocalDescriptors:
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
    # Steps over 1 st are note changes or octave errors, not continuous movement.
    steps = np.abs(np.diff(semitones))
    steps = steps[np.isfinite(steps) & (steps < 1.0)]
    velocity = float(steps.mean() * rate) if steps.size else 0.0

    runs = _voiced_runs(semitones, int(MIN_RUN_SEC * rate))
    longest = max((len(run) for run in _voiced_runs(semitones, 1)), default=0) / rate
    vibratos = [(_vibrato(run, rate), len(run)) for run in runs]
    weight = sum(n for (r, _), n in vibratos if r > 0)
    vibrato_rate = sum(r * n for (r, _), n in vibratos if r > 0) / weight if weight else 0.0
    vibrato_extent = sum(e * n for (r, e), n in vibratos if r > 0) / weight if weight else 0.0

    # Ornaments: short, prominent pitch turns (murki, kan) in either direction.
    max_width = int(ORNAMENT_MAX_WIDTH_SEC * rate)
    turns = 0
    for run in _voiced_runs(semitones, 5):
        for signal in (run, -run):
            peaks, _ = find_peaks(signal, prominence=ORNAMENT_PROMINENCE_ST, width=(1, max_width))
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
