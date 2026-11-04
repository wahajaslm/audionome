"""Pre/post-roll: windows are analysed with real audio either side, but describe only themselves."""
import numpy as np
import pytest

from musicdna.audio.windows import WindowGrid
from musicdna.config import DEFAULT, Config
from musicdna.features.dsp import AcousticFeatureExtractor
from musicdna.features.spatial import SpatialAnalyzer

NO_ROLL = Config.load(overrides=['windows.preroll_sec=0', 'windows.postroll_sec=0'])


def test_context_span_is_clipped_to_the_recording() -> None:
    grid = WindowGrid(DEFAULT.windows)
    assert grid.context_span(12, 24, 466) == (11, 25)
    assert grid.context_span(0, 12, 466) == (0, 13)        # no audio before 0 s
    assert grid.context_span(462, 466, 466) == (461, 466)  # never padded past the end


def test_preroll_detects_a_sound_that_starts_exactly_at_the_window_start() -> None:
    """Silence until 12.0 s, then a burst. Without pre-roll the window starts *on* the burst, has
    nothing to compare it with, and records no onset; with 1 s of pre-roll it hears the silence
    before and detects the onset. Both results still describe only 12-24 s."""
    rate = DEFAULT.audio.analysis_sr
    rng = np.random.default_rng(1)
    audio = np.zeros(30 * rate, dtype=np.float32)
    burst = rng.standard_normal(12 * rate).astype(np.float32) * np.exp(-np.arange(12 * rate) / rate)
    audio[12 * rate:24 * rate] = 0.3 * burst
    results = {}
    for label, config in (('roll', DEFAULT), ('bare', NO_ROLL)):
        extractor = AcousticFeatureExtractor(config)
        clip, core = extractor.context_clip(audio, rate, 12.0, 24.0)
        results[label], _ = extractor.extract_window_features(clip, rate, core=core)
    # Measured: 0.687 with pre-roll vs 0.553 without (+24%); require a clear gain, not an exact number.
    assert results['roll']['onset_activity'] > 1.1 * results['bare']['onset_activity']
    assert results['roll']['energy'] == pytest.approx(results['bare']['energy'], rel=0.05)  # same window


def test_spatial_summary_ignores_roll_audio() -> None:
    """Wide noise in the pre/post-roll must not make a mono window look wide."""
    rate = 44100
    rng = np.random.default_rng(0)
    noise = rng.standard_normal((2, 14 * rate))  # decorrelated = wide
    mono = rng.standard_normal(12 * rate)
    noise[:, rate:13 * rate] = mono               # window 1-13 s is mono
    window = SpatialAnalyzer().describe(noise, rate, core=(1.0, 13.0))
    assert window.width < 0.02 and window.correlation > 0.99


def test_negative_roll_is_rejected() -> None:
    with pytest.raises(ValueError):
        Config.load(overrides=['windows.preroll_sec=-1'])
