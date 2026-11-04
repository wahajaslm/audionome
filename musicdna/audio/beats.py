"""Track-level beat and downbeat tracking with Beat This! (ISMIR 2024, MIT code and weights).

Falls back to librosa beat tracking when beat-this is not installed or its checkpoint cannot load.
The checkpoint (~77 MB) is downloaded once to the torch hub cache and loaded with weights_only=True.
"""
from __future__ import annotations
import logging
from typing import Any
import librosa
import numpy as np

BEAT_THIS_CHECKPOINT: str = 'final0'
LOGGER = logging.getLogger(__name__)


class BeatTracker:
    """Produces a beat grid (seconds) for a whole recording."""

    def __init__(self, checkpoint: str = BEAT_THIS_CHECKPOINT) -> None:
        self.checkpoint = checkpoint
        self._model: Any = None
        self._unavailable = False

    def _load(self) -> Any:
        if self._model is None and not self._unavailable:
            try:
                from beat_this.inference import Audio2Beats
                self._model = Audio2Beats(checkpoint_path=self.checkpoint, device='cpu', dbn=False)
            except Exception as exc:  # missing package, offline, or bad checkpoint
                LOGGER.warning('Beat This! unavailable, using librosa beat tracking: %s', exc)
                self._unavailable = True
        return self._model

    def track(self, audio_waveform: np.ndarray, sample_rate: int) -> dict[str, Any]:
        """Returns beats, downbeats, global tempo and which tracker produced them."""
        model = self._load()
        if model is not None:
            beats, downbeats = model(np.asarray(audio_waveform, dtype=np.float32), sample_rate)
            tracker = f'beat-this:{self.checkpoint}'
        else:
            _, beat_frames = librosa.beat.beat_track(y=audio_waveform, sr=sample_rate, hop_length=512)
            beats = librosa.frames_to_time(beat_frames, sr=sample_rate, hop_length=512)
            downbeats = np.array([])
            tracker = 'librosa-beat-track'
        beats = np.asarray(beats, dtype=np.float64)
        return {
            'beatTracker': tracker,
            'tempoBpm': tempo_from_beats(beats),
            'beats': [round(float(b), 3) for b in beats],
            'downbeats': [round(float(b), 3) for b in np.asarray(downbeats, dtype=np.float64)],
        }


def tempo_from_beats(beat_times: np.ndarray | list[float]) -> float | None:
    """Median inter-beat interval as BPM, or None with fewer than three beats."""
    beats = np.asarray(beat_times, dtype=np.float64)
    if beats.size < 3:
        return None
    interval = float(np.median(np.diff(beats)))
    return round(60.0 / interval, 1) if interval > 0 else None


_DEFAULT_BEAT_TRACKER = BeatTracker()

__all__ = ['BEAT_THIS_CHECKPOINT', 'BeatTracker', 'tempo_from_beats', '_DEFAULT_BEAT_TRACKER']
