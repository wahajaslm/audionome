"""The one analysis window grid. Every feature, listening signal and experiment uses it."""
from __future__ import annotations

from musicdna.config import DEFAULT, WindowConfig


class WindowGrid:
    """Windows start every `hop_sec` and last `window_sec`, clipped to the recording.

    Tail windows shorter than `min_window_sec` are dropped. Window i always starts at i * hop_sec,
    so a start time maps back to its row with `index`.
    """

    def __init__(self, settings: WindowConfig = DEFAULT.windows) -> None:
        self.settings = settings

    def windows(self, duration_sec: float) -> list[tuple[float, float]]:
        grid: list[tuple[float, float]] = []
        index = 0
        while (start := index * self.settings.hop_sec) < duration_sec:
            end = min(duration_sec, start + self.settings.window_sec)
            if end - start < self.settings.min_window_sec:
                break
            grid.append((round(start, 6), round(end, 6)))
            index += 1
        return grid

    def index(self, start_sec: float) -> int:
        return int(round(start_sec / self.settings.hop_sec))

    @staticmethod
    def overlap(a_start: float, a_end: float, b_start: float, b_end: float) -> float:
        return max(0.0, min(a_end, b_end) - max(a_start, b_start))
