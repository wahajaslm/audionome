"""FCPE vocal tracker on a synthetic sung note (no corpus needed)."""
import numpy as np
from musicdna.config import DEFAULT
from musicdna.features.vocal import VocalPitchAnalyzer


def test_fcpe_tracks_a_steady_note_on_the_pyin_frame_grid():
    sr = DEFAULT.vocal.sample_rate
    t = np.arange(3 * sr) / sr
    note = (0.3 * sum(np.sin(2 * np.pi * 220 * k * t) / k for k in (1, 2, 3))).astype(np.float32)  # A3 = MIDI 57
    analyzer = VocalPitchAnalyzer(DEFAULT.vocal)
    f0, voiced, probability = analyzer._fcpe(note)
    assert len(f0) == 1 + len(note) // DEFAULT.vocal.hop
    assert voiced.mean() > 0.8
    assert abs(np.nanmedian(12 * np.log2(f0[voiced] / 440) + 69) - 57) < 0.1
