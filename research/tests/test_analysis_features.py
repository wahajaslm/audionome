import numpy as np

from research import spatial_features, vocal_pitch

RATE = vocal_pitch.PITCH_SAMPLE_RATE


def sung_tone(seconds: float, start_midi: float, glide_st_per_sec: float, vibrato_hz: float, extent_st: float) -> np.ndarray:
    t = np.arange(int(seconds * RATE)) / RATE
    midi = start_midi + glide_st_per_sec * t + (extent_st / 2) * np.sin(2 * np.pi * vibrato_hz * t)
    phase = 2 * np.pi * np.cumsum(440.0 * 2 ** ((midi - 69) / 12)) / RATE
    return (0.3 * np.sin(phase) + 0.1 * np.sin(2 * phase)).astype(np.float32)


def test_vocal_descriptors_recover_glide_and_vibrato() -> None:
    contour = vocal_pitch.track_pitch(sung_tone(4.0, 60, glide_st_per_sec=1.0, vibrato_hz=6.0, extent_st=0.8))
    d = vocal_pitch.describe_window(contour, 0.0, 4.0)
    assert d.voiced_fraction > 0.9
    assert 0.7 < d.glide_st_per_sec < 1.3
    assert 5.0 < d.vibrato_rate_hz < 7.0
    assert 0.4 < d.vibrato_extent_st < 1.2
    assert d.longest_sustain_sec > 3.5


def test_silence_gives_zero_vocal_descriptors() -> None:
    contour = vocal_pitch.track_pitch(np.zeros(2 * RATE, dtype=np.float32))
    assert not vocal_pitch.describe_window(contour, 0.0, 2.0).to_vector().any()


def test_spatial_mono_wide_and_panned() -> None:
    rng = np.random.default_rng(0)
    noise = rng.standard_normal(44100)
    mono = spatial_features.describe_window(np.stack([noise, noise]), 44100)
    assert mono.width < 1e-6 and mono.correlation > 0.999
    wide = spatial_features.describe_window(np.stack([noise, rng.standard_normal(44100)]), 44100)
    assert 0.4 < wide.width < 0.6 and abs(wide.correlation) < 0.05
    left = spatial_features.describe_window(np.stack([noise, 0.0 * noise]), 44100)
    assert left.balance == -1.0
