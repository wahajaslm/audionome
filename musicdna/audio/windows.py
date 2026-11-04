"""The one analysis window grid. Every feature, listening signal and experiment uses it."""
from __future__ import annotations

from musicdna.config import WindowConfig


def window_grid(duration_sec: float, windows: WindowConfig) -> list[tuple[float, float]]:
    """Windows start every `hop_sec` and last `window_sec`, clipped to the recording.

    Tail windows shorter than `min_window_sec` are dropped. Window i always starts at i * hop_sec,
    so a start time maps back to its row with `window_index`.
    """
    grid: list[tuple[float, float]] = []
    index = 0
    while (start := index * windows.hop_sec) < duration_sec:
        end = min(duration_sec, start + windows.window_sec)
        if end - start < windows.min_window_sec:
            break
        grid.append((round(start, 6), round(end, 6)))
        index += 1
    return grid


def window_index(start_sec: float, windows: WindowConfig) -> int:
    return int(round(start_sec / windows.hop_sec))


def overlap(a_start: float, a_end: float, b_start: float, b_end: float) -> float:
    return max(0.0, min(a_end, b_end) - max(a_start, b_start))
