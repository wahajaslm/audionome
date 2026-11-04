"""The one audio decoder: ffmpeg to float32, so every format (WAV, MP3, M4A, WebM, Opus) loads the same way."""
from __future__ import annotations
import subprocess
from pathlib import Path

import numpy as np


def load_audio(path: str | Path, sample_rate: int, mono: bool = True,
               offset_sec: float = 0.0, duration_sec: float | None = None) -> np.ndarray:
    """Returns shape (n,) when mono, (2, n) when stereo, resampled to `sample_rate`."""
    channels = 1 if mono else 2
    command = ['ffmpeg', '-nostdin', '-v', 'error']
    if offset_sec > 0:
        command += ['-ss', str(offset_sec)]
    command += ['-i', str(path)]
    if duration_sec is not None:
        command += ['-t', str(duration_sec)]
    command += ['-f', 'f32le', '-ac', str(channels), '-ar', str(sample_rate), '-']
    samples = np.frombuffer(subprocess.run(command, check=True, capture_output=True).stdout, dtype=np.float32)
    if samples.size == 0:
        raise ValueError(f'ffmpeg decoded no audio from {path}')
    return samples.copy() if mono else samples.reshape(-1, 2).T.copy()
