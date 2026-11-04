import numpy as np

from musicdna.config import DEFAULT, Config
from musicdna.features.spatial import SpatialAnalyzer
from musicdna.features.vocal import VocalPitchAnalyzer

RATE = DEFAULT.vocal.sample_rate
PITCH = VocalPitchAnalyzer()
SPATIAL = SpatialAnalyzer()


def sung_tone(seconds: float, start_midi: float, glide_st_per_sec: float, vibrato_hz: float, extent_st: float) -> np.ndarray:
    t = np.arange(int(seconds * RATE)) / RATE
    midi = start_midi + glide_st_per_sec * t + (extent_st / 2) * np.sin(2 * np.pi * vibrato_hz * t)
    phase = 2 * np.pi * np.cumsum(440.0 * 2 ** ((midi - 69) / 12)) / RATE
    return (0.3 * np.sin(phase) + 0.1 * np.sin(2 * phase)).astype(np.float32)


def test_vocal_descriptors_recover_glide_and_vibrato() -> None:
    contour = PITCH.track(sung_tone(4.0, 60, glide_st_per_sec=1.0, vibrato_hz=6.0, extent_st=0.8), RATE)
    d = PITCH.describe(contour, 0.0, 4.0)
    assert d.voiced_fraction > 0.9
    assert 0.7 < d.glide_st_per_sec < 1.3
    assert 5.0 < d.vibrato_rate_hz < 7.0
    assert 0.4 < d.vibrato_extent_st < 1.2
    assert d.longest_sustain_sec > 3.5


def test_silence_gives_zero_vocal_descriptors() -> None:
    contour = PITCH.track(np.zeros(2 * RATE, dtype=np.float32), RATE)
    assert not PITCH.describe(contour, 0.0, 2.0).to_vector().any()


def test_spatial_mono_wide_and_panned() -> None:
    rng = np.random.default_rng(0)
    noise = rng.standard_normal(44100)
    mono = SPATIAL.describe(np.stack([noise, noise]), 44100)
    assert mono.width < 1e-6 and mono.correlation > 0.999
    wide = SPATIAL.describe(np.stack([noise, rng.standard_normal(44100)]), 44100)
    assert 0.4 < wide.width < 0.6 and abs(wide.correlation) < 0.05
    left = SPATIAL.describe(np.stack([noise, 0.0 * noise]), 44100)
    assert left.balance == -1.0


def test_vibrato_band_is_a_config_parameter() -> None:
    contour = PITCH.track(sung_tone(4.0, 60, glide_st_per_sec=0.0, vibrato_hz=6.0, extent_st=0.8), RATE)
    narrow = Config.load(overrides=['vocal.vibrato_min_hz=7', 'vocal.vibrato_max_hz=8.5']).vocal
    assert VocalPitchAnalyzer(narrow).describe(contour, 0.0, 4.0).vibrato_rate_hz == 0.0


def test_spatial_bands_are_a_config_parameter() -> None:
    rng = np.random.default_rng(0)
    low = np.sin(2 * np.pi * 100 * np.arange(44100) / 44100)
    stereo = np.stack([low + 0.01 * rng.standard_normal(44100), low])
    default = SPATIAL.describe(stereo, 44100)
    moved = SpatialAnalyzer(Config.load(overrides=['spatial.band_edges_hz=20,50,4000,16000']).spatial).describe(stereo, 44100)
    assert default.low_width < 0.01 and moved.low_width != default.low_width
