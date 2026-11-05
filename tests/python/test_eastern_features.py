"""Eastern ensemble features on synthetic sounds (no network, no Demucs)."""
import numpy as np
from musicdna.features.eastern import EASTERN_FEATURES, EasternFeatureExtractor, sethares_roughness

SR, MIX_SR = 16000, 22050
COL = {name: i for i, name in enumerate(EASTERN_FEATURES)}


def tone(hz, seconds, sr, partials=4):
    t = np.arange(int(seconds * sr)) / sr
    return sum(np.sin(2 * np.pi * hz * k * t) / k for k in range(1, partials + 1)).astype(np.float32) * 0.2


def run(other, drums=None, vocals=None, seconds=24.0):
    n = int(seconds * SR)
    drums = np.zeros(n, np.float32) if drums is None else drums
    vocals = np.zeros(n, np.float32) if vocals is None else vocals
    mix = tone(220, seconds, MIX_SR)
    return EasternFeatureExtractor().song(mix, MIX_SR, {'vocals': vocals, 'drums': drums, 'other': other}, SR,
                                          [(0.0, 12.0), (12.0, 24.0)])


def test_semitone_is_rougher_than_octave():
    assert sethares_roughness(np.array([440.0, 466.2]), np.ones(2)) > 5 * sethares_roughness(np.array([440.0, 880.0]), np.ones(2))


def test_quarter_tone_melody_reads_as_offgrid():
    # Western melody on semitones vs. the same melody with half its notes 50 cents sharp.
    notes = [220 * 2 ** (k / 12) for k in (0, 2, 4, 5, 7, 9, 11, 12)]
    western = np.concatenate([tone(f, 3.0, SR) for f in notes])
    shifted = np.concatenate([tone(f * (2 ** (0.5 / 12) if i % 2 else 1), 3.0, SR) for i, f in enumerate(notes)])
    on, off = run(western)[:, COL['instrument_offgrid']].mean(), run(shifted)[:, COL['instrument_offgrid']].mean()
    assert off > on + 0.15, (on, off)


def test_drum_onsets_and_solo():
    n = int(24 * SR)
    clicks = np.zeros(n, np.float32)
    clicks[::SR // 4] = 1.0  # 4 hits per second
    table = run(tone(330, 24, SR), drums=clicks)
    assert 3.0 < table[0, COL['percussion_onset_rate']] < 5.0
    assert table[0, COL['instrument_solo']] > 0.9   # instrument plays, voice silent


def test_build_up_has_positive_slope_and_gain():
    seconds = 24.0
    t = np.arange(int(seconds * MIX_SR)) / MIX_SR
    rising = (np.sin(2 * np.pi * 220 * t) * np.linspace(0.05, 0.8, len(t))).astype(np.float32)
    n = int(seconds * SR)
    table = EasternFeatureExtractor().song(rising, MIX_SR, {s: np.zeros(n, np.float32) + 1e-4 for s in ('vocals', 'drums', 'other')},
                                           SR, [(0.0, 12.0), (12.0, 24.0)])
    assert table[0, COL['energy_slope']] > 0 and table[1, COL['energy_gain']] > 0
    assert table[0, COL['energy_gain']] == 0  # first window has no previous one
