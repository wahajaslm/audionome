"""Tonic-aligned and Western CQT views (no network)."""
import numpy as np
import librosa
from musicdna.features.cqt import BINS_PER_OCTAVE, VIEW_BINS, offset_from_hz, song_cqt, tonic_view, western_view

SR = 16000


def tone(hz, seconds=4.0):
    t = np.arange(int(seconds * SR)) / SR
    return (0.3 * np.sin(2 * np.pi * hz * t)).astype(np.float32)


def signals(hz):
    x = tone(hz)
    return {'mix': x, 'vocals': x, 'drums': np.zeros_like(x), 'other': x}


def test_tonic_lands_on_the_same_row_in_any_key():
    rows = []
    for tonic in (146.83, 196.0 * 2 ** (0.37 / 12)):  # D3, and G3 + 37 cents
        stored, meta = song_cqt(signals(tonic), SR, tonic, tonic_confidence=1.0)
        view = tonic_view(stored, meta.tonic_offset).astype(np.float32)
        rows.append(int(np.argmax(view[0].mean(axis=1))) % BINS_PER_OCTAVE)
        assert view.shape[1] == VIEW_BINS
    assert rows[0] == rows[1] == 0


def test_quarter_tone_visible_in_tonic_view_but_pooled_away_in_western_view():
    tonic = 146.83
    in_tune, quarter = (song_cqt(signals(tonic * 2 ** (c / 1200)), SR, tonic, 1.0) for c in (200, 250))
    peak = lambda s: int(np.argmax(tonic_view(*s[:1], s[1].tonic_offset)[0].astype(np.float32).mean(axis=1)))
    assert abs(peak(quarter) - peak(in_tune)) in (2, 3)          # 50 cents = 2.5 rows apart
    assert western_view(in_tune[0]).shape[1] == VIEW_BINS // 5


def test_offset_folds_into_half_octave_either_side():
    c = librosa.note_to_hz('C3')
    assert offset_from_hz(c, 0.0) == 0
    assert offset_from_hz(c * 2 ** (11 / 12), 0.0) == -5           # B is one semitone below C
    assert offset_from_hz(c * 2 ** (2 / 12), 0.0) == 10            # D
