"""Replay curves -> per-window targets and the position prior (no network)."""
import numpy as np
from musicdna.experiments.replay_targets import PositionPrior, SongTargets, window_replay


def test_window_replay_is_time_weighted():
    curve = [[0.0, 10.0, 0.2], [10.0, 20.0, 1.0]]
    # 5-15 s overlaps 5 s of each segment -> 0.6; 30-40 s is past the curve -> NaN.
    values = window_replay(curve, [(5.0, 15.0), (10.0, 20.0), (30.0, 40.0)])
    assert np.allclose(values[:2], [0.6, 1.0]) and np.isnan(values[2])


def test_opening_windows_are_dropped_and_prior_removes_position():
    curve = [[float(s), float(s + 6), 1.0 - s / 120] for s in range(0, 120, 6)]  # pure drop-off
    windows = [(float(s), float(s + 12)) for s in range(0, 108, 6)]
    song = SongTargets.build('a', curve, windows, duration_sec=120.0)
    assert song.index[0] == 3  # windows starting at 0, 6, 12 s are inside the 15 s opening
    # A curve that is only drop-off has (almost) nothing left once position is removed.
    residual = PositionPrior().fit([song]).residual(song)
    assert np.abs(residual).max() < 0.05
