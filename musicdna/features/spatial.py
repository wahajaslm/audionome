"""Stereo image descriptors: how wide, how centred, and how correlated a passage sounds.

Mid/side decomposition per frequency band separates a wide ambient mix (reverb, doubled
instruments, chorus) from a narrow, centred one (solo vocal, mono sources).
"""
from __future__ import annotations
from dataclasses import astuple, dataclass

import numpy as np

from musicdna.config import DEFAULT, SpatialConfig


@dataclass
class SpatialDescriptors:
    width: float              # side / (mid + side) energy, 0 = mono, 0.5 = fully decorrelated
    correlation: float        # Pearson correlation of left and right, 1 = mono, <0 = phasey
    balance: float            # (R - L) / (R + L) energy, -1 left .. +1 right
    low_width: float          # bands from SpatialConfig.band_edges_hz
    mid_width: float
    high_width: float
    width_variation: float    # std of frame-level width, i.e. how much the image moves

    NAMES = ('width', 'correlation', 'balance', 'low_width', 'mid_width', 'high_width', 'width_variation')

    def to_vector(self) -> np.ndarray:
        return np.array(astuple(self), dtype=np.float64)


class SpatialAnalyzer:
    """Mid/side stereo descriptors per window, configured by `SpatialConfig`."""

    def __init__(self, settings: SpatialConfig = DEFAULT.spatial) -> None:
        if len(settings.band_edges_hz) != 4:
            raise ValueError('spatial.band_edges_hz needs exactly 4 edges: low | mid | high')
        self.settings = settings

    def describe(self, stereo: np.ndarray, sample_rate: int) -> SpatialDescriptors:
        """`stereo` is shape (2, n)."""
        left, right = stereo[0].astype(np.float64), stereo[1].astype(np.float64)
        mid, side = (left + right) / 2.0, (left - right) / 2.0
        energy_left, energy_right = float(np.sum(left ** 2)), float(np.sum(right ** 2))
        if energy_left + energy_right <= 1e-12:
            return SpatialDescriptors(0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 0.0)
        correlation = float(np.corrcoef(left, right)[0, 1]) if np.std(left) > 0 and np.std(right) > 0 else 1.0

        mid_power, side_power = self._power(mid), self._power(side)
        frequencies = np.fft.rfftfreq(self.settings.n_fft, d=1.0 / sample_rate)
        edges = self.settings.band_edges_hz
        band_widths = [self._side_share(side_power[:, band], mid_power[:, band])
                       for band in ((frequencies >= low) & (frequencies < high) for low, high in zip(edges[:-1], edges[1:]))]
        frame_width = side_power.sum(axis=1) / np.maximum(mid_power.sum(axis=1) + side_power.sum(axis=1), 1e-12)

        return SpatialDescriptors(
            width=self._side_share(side_power, mid_power),
            correlation=correlation,
            balance=(energy_right - energy_left) / (energy_right + energy_left),
            low_width=band_widths[0],
            mid_width=band_widths[1],
            high_width=band_widths[2],
            width_variation=float(np.std(frame_width)),
        )

    def _power(self, signal: np.ndarray) -> np.ndarray:
        """Power spectrogram with half-overlapping Hann frames, shape (frames, bins)."""
        n_fft = self.settings.n_fft
        hop = n_fft // 2
        frames = max(1, (len(signal) - n_fft) // hop + 1)
        padded = np.pad(signal, (0, max(0, n_fft - len(signal))))
        window = np.hanning(n_fft)
        stacked = np.stack([padded[i * hop: i * hop + n_fft] * window for i in range(frames)])
        return np.abs(np.fft.rfft(stacked, axis=1)) ** 2

    @staticmethod
    def _side_share(side: np.ndarray, mid: np.ndarray) -> float:
        total = float(mid.sum() + side.sum())
        return float(side.sum()) / total if total > 0 else 0.0
