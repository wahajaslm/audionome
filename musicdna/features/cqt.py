"""Fine-pitch spectrograms (CQT, 20-cent rows) of the mix and each stem, for the moment model's CNN.

One array per song is stored; two views are cut from it when the model loads a window:

    tonic view    60 rows per octave, shifted so the song's tonic (Sa) always lands on the same row.
                  A komal re (about 90-112 cents above Sa) then sits on the same rows in every song,
                  whatever key it is sung in. This is the "Eastern" input.
    western view  the same picture anchored to the song's equal-tempered grid (A = 440 Hz after the
                  overall tuning correction), pooled to one row per semitone. Microtones are averaged
                  away, as in a standard chroma/mel front end. This is the "Western" input.

Stored grid: 420 rows starting half an octave below C2, so either view can take 360 rows (6 octaves)
after shifting by up to half an octave. Example: tonic 37 cents above D (D = 2 semitones = 10 rows
above C, plus 2 rows for 37 cents) -> tonic offset 12 rows -> tonic view = rows 42..401.
"""
from __future__ import annotations
from dataclasses import asdict, dataclass

import numpy as np
import librosa

CHANNELS = ('mix', 'vocals', 'drums', 'other')
BINS_PER_OCTAVE = 60                 # 20 cents per row
VIEW_BINS = 360                      # 6 octaves per view
MARGIN_BINS = BINS_PER_OCTAVE // 2   # half an octave of room either side for the tonic shift
STORED_BINS = VIEW_BINS + 2 * MARGIN_BINS
HOP = 2048                           # 128 ms at 16 kHz: pitch detail matters here, time detail less
TOP_DB = 80.0
MIN_TONIC_CONFIDENCE = 0.05          # below this the vocal tonic is not trusted (e.g. instrumental house)


@dataclass
class CqtMeta:
    tuning: float          # song tuning, fraction of a semitone (librosa.estimate_tuning)
    tonic_offset: int      # rows from the tuned C to the tonic, -30..29
    tonic_source: str      # 'vocal' (intonation stage) or 'spectrum' (strongest pitch class of the mix)
    sample_rate: int
    hop: int = HOP

    def to_dict(self) -> dict:
        return asdict(self)


def grid_fmin(tuning: float) -> float:
    """Lowest stored row: half an octave below the tuned C2."""
    return float(librosa.note_to_hz('C2') * 2 ** (tuning / 12) / 2 ** 0.5)


def offset_from_hz(tonic_hz: float, tuning: float) -> int:
    """Rows from the tuned C to the tonic's pitch class, folded into -30..29."""
    c_tuned = librosa.note_to_hz('C2') * 2 ** (tuning / 12)
    rows = int(round(BINS_PER_OCTAVE * np.log2(tonic_hz / c_tuned))) % BINS_PER_OCTAVE
    return rows - BINS_PER_OCTAVE if rows >= MARGIN_BINS else rows


def song_cqt(signals: dict[str, np.ndarray], sr: int, tonic_hz: float | None,
             tonic_confidence: float = 0.0) -> tuple[np.ndarray, CqtMeta]:
    """(4, 420, frames) float16 in 0-1 (dB scaled per channel), plus how it was anchored."""
    tuning = float(librosa.estimate_tuning(y=signals['mix'], sr=sr))
    fmin = grid_fmin(tuning)
    layers = []
    for name in CHANNELS:
        power = np.abs(librosa.cqt(signals[name], sr=sr, hop_length=HOP, fmin=fmin, n_bins=STORED_BINS,
                                   bins_per_octave=BINS_PER_OCTAVE))
        db = librosa.amplitude_to_db(power, ref=float(power.max()) or 1.0, top_db=TOP_DB)
        layers.append((db + TOP_DB) / TOP_DB)
    frames = min(layer.shape[1] for layer in layers)
    stacked = np.stack([layer[:, :frames] for layer in layers]).astype(np.float16)
    if tonic_hz and np.isfinite(tonic_hz) and tonic_confidence >= MIN_TONIC_CONFIDENCE:
        offset, source = offset_from_hz(tonic_hz, tuning), 'vocal'
    else:
        # Strongest pitch class of the mix (20-cent resolution), e.g. the drone or the key centre.
        folded = stacked[0, MARGIN_BINS:MARGIN_BINS + VIEW_BINS].astype(np.float32).mean(axis=1)
        folded = folded.reshape(-1, BINS_PER_OCTAVE).sum(axis=0)
        rows = int(np.argmax(folded))
        offset, source = (rows - BINS_PER_OCTAVE if rows >= MARGIN_BINS else rows), 'spectrum'
    return stacked, CqtMeta(tuning, offset, source, sr)


def tonic_view(stored: np.ndarray, tonic_offset: int) -> np.ndarray:
    """(channels, 360, frames): rows from the tonic upward, 20 cents each."""
    start = MARGIN_BINS + tonic_offset
    return stored[:, start:start + VIEW_BINS]


def western_view(stored: np.ndarray) -> np.ndarray:
    """(channels, 72, frames): the equal-tempered grid from C2, one row per semitone (5 rows averaged)."""
    grid = stored[:, MARGIN_BINS:MARGIN_BINS + VIEW_BINS].astype(np.float32)
    # Rows 0-4 of each semitone are 0, 20, 40, 60, 80 cents above it; centre the pooling on the note
    # (-40..+40 cents) so an in-tune note and its slight bends fall in one row.
    padded = np.pad(grid, ((0, 0), (2, 0), (0, 0)), mode='edge')[:, :VIEW_BINS]
    channels, _, frames = padded.shape
    return padded.reshape(channels, VIEW_BINS // 5, 5, frames).mean(axis=2)
