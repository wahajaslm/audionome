"""Base model targets: YouTube "Most replayed" curves turned into one value per feature window.

A curve has ~100 segments of equal length; a window's replay is the time-weighted mean of the
segments it overlaps. Windows that start inside the opening are dropped (every view starts there).
Replay also falls as viewers leave, so `PositionPrior` learns the average curve by relative position
from training songs, and `residual` is what is left: replay that position alone does not explain.

Example: a window at 40% of a song with replay 0.80, where training songs average 0.62 at 40%,
has residual +0.18 (replayed more than its position predicts).
"""
from __future__ import annotations
from dataclasses import dataclass

import numpy as np

from musicdna.corpus.genre_mix import OPENING_SEC

POSITION_BINS = 10


def window_replay(curve: list[list[float]], windows: list[tuple[float, float]]) -> np.ndarray:
    """Time-weighted mean replay per window; NaN for windows the curve does not cover."""
    values = np.full(len(windows), np.nan)
    for i, (start, end) in enumerate(windows):
        weight = total = 0.0
        for seg_start, seg_end, value in curve:
            overlap = min(end, seg_end) - max(start, seg_start)
            if overlap > 0:
                weight += overlap
                total += overlap * value
        if weight > 0:
            values[i] = total / weight
    return values


@dataclass
class SongTargets:
    """Kept windows of one song: their index in the feature arrays, relative position and replay."""
    video_id: str
    index: np.ndarray      # rows of the song's feature arrays
    position: np.ndarray   # window centre / song length, 0-1
    replay: np.ndarray

    @classmethod
    def build(cls, video_id: str, curve: list[list[float]], windows: list[tuple[float, float]],
              duration_sec: float) -> SongTargets:
        replay = window_replay(curve, windows)
        starts = np.array([s for s, _ in windows])
        centres = np.array([(s + e) / 2 for s, e in windows])
        keep = (starts >= OPENING_SEC) & ~np.isnan(replay)
        return cls(video_id, np.flatnonzero(keep), centres[keep] / duration_sec, replay[keep])


class PositionPrior:
    """Average replay by relative position (10 bins), fitted on training songs only.

    Each song's replay is centred on its own mean first, so songs with generally high curves do
    not dominate the shape.
    """

    def __init__(self) -> None:
        self.bin_means = np.zeros(POSITION_BINS)

    @staticmethod
    def bins(position: np.ndarray) -> np.ndarray:
        return np.clip((position * POSITION_BINS).astype(int), 0, POSITION_BINS - 1)

    def fit(self, songs: list[SongTargets]) -> PositionPrior:
        sums, counts = np.zeros(POSITION_BINS), np.zeros(POSITION_BINS)
        for song in songs:
            np.add.at(sums, self.bins(song.position), song.replay - song.replay.mean())
            np.add.at(counts, self.bins(song.position), 1)
        self.bin_means = np.divide(sums, counts, out=np.zeros(POSITION_BINS), where=counts > 0)
        return self

    def predict(self, song: SongTargets) -> np.ndarray:
        return self.bin_means[self.bins(song.position)]

    def residual(self, song: SongTargets) -> np.ndarray:
        return song.replay - song.replay.mean() - self.predict(song)
