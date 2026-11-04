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


def _ratio(side: np.ndarray, mid: np.ndarray) -> float:
    total = float(mid.sum() + side.sum())
    return float(side.sum()) / total if total > 0 else 0.0


def describe_window(stereo: np.ndarray, sample_rate: int, spatial: SpatialConfig = DEFAULT.spatial) -> SpatialDescriptors:
    """`stereo` is shape (2, n). Band widths use the 3 bands set by `spatial.band_edges_hz`."""
    left, right = stereo[0].astype(np.float64), stereo[1].astype(np.float64)
    mid, side = (left + right) / 2.0, (left - right) / 2.0
    energy_left, energy_right = float(np.sum(left ** 2)), float(np.sum(right ** 2))
    if energy_left + energy_right <= 1e-12:
        return SpatialDescriptors(0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 0.0)
    correlation = float(np.corrcoef(left, right)[0, 1]) if np.std(left) > 0 and np.std(right) > 0 else 1.0

    n_fft = spatial.n_fft
    hop = n_fft // 2
    frames = max(1, (len(mid) - n_fft) // hop + 1)
    window = np.hanning(n_fft)
    def power(signal: np.ndarray) -> np.ndarray:
        padded = np.pad(signal, (0, max(0, n_fft - len(signal))))
        stacked = np.stack([padded[i * hop: i * hop + n_fft] * window for i in range(frames)])
        return np.abs(np.fft.rfft(stacked, axis=1)) ** 2
    mid_power, side_power = power(mid), power(side)
    frequencies = np.fft.rfftfreq(n_fft, d=1.0 / sample_rate)

    edges = spatial.band_edges_hz
    if len(edges) != 4:
        raise ValueError('spatial.band_edges_hz needs exactly 4 edges: low | mid | high')
    bands = list(zip(edges[:-1], edges[1:]))
    band_widths = []
    for low, high in bands:
        band = (frequencies >= low) & (frequencies < high)
        band_widths.append(_ratio(side_power[:, band], mid_power[:, band]))
    frame_mid, frame_side = mid_power.sum(axis=1), side_power.sum(axis=1)
    frame_width = frame_side / np.maximum(frame_mid + frame_side, 1e-12)

    return SpatialDescriptors(
        width=_ratio(side_power, mid_power),
        correlation=correlation,
        balance=(energy_right - energy_left) / (energy_right + energy_left),
        low_width=band_widths[0],
        mid_width=band_widths[1],
        high_width=band_widths[2],
        width_variation=float(np.std(frame_width)),
    )
