"""Player timeline: chords on the beat, repeats, parts, curves, and the background job tiers."""
import json
import time
from pathlib import Path

import numpy as np
import soundfile as sf

from musicdna.features import timeline as tl
from musicdna.service.timeline_jobs import TimelineJobs

SR = tl.SR


def chord_tone(names: list[str], beat_sec: float, sr: int = SR) -> np.ndarray:
    """Triads as summed sines, one per beat. Example: ['C', 'C', 'G', 'G']."""
    roots = {'C': 60, 'D': 62, 'F': 65, 'G': 67, 'A': 69}
    out = []
    for name in names:
        minor = name.endswith('m')
        r = roots[name.rstrip('m')]
        notes = [r, r + (3 if minor else 4), r + 7, r - 12]
        t = np.arange(int(beat_sec * sr)) / sr
        out.append(sum(np.sin(2 * np.pi * 440 * 2 ** ((n - 69) / 12) * t) for n in notes) / 4)
    return np.concatenate(out).astype(np.float32)


def test_beat_chords_follow_the_beats_and_merge_repeats() -> None:
    names = ['C'] * 4 + ['G'] * 4 + ['Am'] * 4 + ['F'] * 4
    y = chord_tone(names, 0.5)
    beats = np.arange(1, len(names)) * 0.5
    blocks = tl.beat_chords(tl.beat_chroma(y, SR, beats), beats, len(y) / SR)
    assert [b['c'] for b in blocks] == ['C', 'G', 'Am', 'F']
    assert abs(blocks[1]['a'] - 2.0) < 1e-6 and abs(blocks[1]['b'] - 4.0) < 1e-6, 'starts and ends on beats'
    assert all(0 < b['conf'] <= 1 for b in blocks)


def test_chord_repeats_find_the_same_pattern_later() -> None:
    loop = ['C', 'G', 'Am', 'F'] * 4                    # 16 beats
    other = ['D', 'A', 'D', 'A'] * 4
    names = loop + other * 3 + loop + other             # the loop comes back 32 s later
    y = chord_tone(names, 0.5)
    beats = np.arange(1, len(names)) * 0.5
    reps = tl.chord_repeats(tl.beat_chroma(y, SR, beats), beats, min_gap_sec=20)
    assert any(abs(r['at'] - 0.5) < 0.6 and abs(r['same_as'] - 32.5) < 1.1 for r in reps), reps


def test_loudness_curves_share_the_mix_scale() -> None:
    quiet, loud = 0.05 * np.random.default_rng(0).standard_normal(SR * 2), 0.5 * np.random.default_rng(1).standard_normal(SR * 2)
    mix = np.concatenate([quiet, loud]).astype(np.float32)
    curve, stems = tl.loudness_curves(mix, SR, {'drums': mix * 0.5})
    assert len(curve) == 4 * tl.FPS + 1
    assert curve[5] < 0.3 and curve[30] > 0.9
    assert stems['drums'][30] < curve[30], 'a quieter stem reads lower on the same scale'


def test_song_parts_cover_the_song_and_start_with_a() -> None:
    names = (['C', 'G'] * 8) + (['D', 'A'] * 8) + (['C', 'G'] * 8)
    y = chord_tone(names, 0.5)
    beats = np.arange(1, len(names)) * 0.5
    mix, _ = tl.loudness_curves(y, SR)
    parts = tl.song_parts(y, SR, beats, mix, len(y) / SR, n_boundaries=4, n_labels=2)
    assert parts[0]['a'] == 0 and abs(parts[-1]['b'] - len(y) / SR) < 1e-3
    assert parts[0]['label'] == 'A'
    assert all(p['b'] > p['a'] for p in parts)


class FakeBeats:
    def track(self, y: np.ndarray, sr: int) -> dict:
        beats = list(np.arange(0.5, len(y) / sr, 0.5))
        return {'beats': beats, 'downbeats': beats[::4], 'tempoBpm': 120.0, 'beatTracker': 'fake'}


class FakeStems:
    """Stands in for Demucs: 'separates' by copying the mix, and records the saves."""
    def __init__(self, root: Path) -> None:
        self.root, self.saved = root, []

    def has_demucs_stems(self, track_id: str) -> bool:
        return False

    def separate_demucs(self, y: np.ndarray, sr: int, model_name: str = '') -> dict:
        time.sleep(0.3)  # a poll lands while the stems are "being made"
        return {n: y * 0.5 for n in tl.STEM_NAMES}

    def save_stems_to_cache(self, track_id: str, stems: dict, sr: int, source: str = 'mir') -> dict:
        self.saved.append(source)
        return {}


def test_jobs_save_quick_then_full_and_never_report_done_before_the_file(tmp_path: Path) -> None:
    audio = tmp_path / 'song.wav'
    sf.write(audio, chord_tone(['C', 'G', 'Am', 'F'] * 6, 0.5), SR)
    stems = FakeStems(tmp_path)
    jobs = TimelineJobs(tmp_path, lambda tid: audio if tid == 'song' else None, stems, beat_tracker=FakeBeats())
    assert jobs.get('song') is None
    jobs.request('song')
    seen_quick = False
    deadline = time.time() + 120
    while time.time() < deadline:
        data = jobs.get('song')
        st = data['status'] if data else {}
        assert 'running' not in st
        if st.get('quick') == 'done':
            assert data.get('chords'), 'quick marked done only once its chords are on disk'
            seen_quick = True
        if st.get('full') == 'done':
            assert data.get('stems') and data.get('melody'), 'full marked done only once the stems are on disk'
            break
        time.sleep(0.05)
    else:
        raise AssertionError('timeline job did not finish')
    assert seen_quick
    assert stems.saved == ['demucs']
    saved = json.loads((tmp_path / 'timeline' / 'song.json').read_text())
    assert saved['chordSource'] == 'bass+other' and saved['status']['full'] == 'done'
    assert jobs.request('song') == saved['status'], 'a complete timeline is not run again'


def test_jobs_wait_for_the_upload_instead_of_failing(tmp_path: Path) -> None:
    audio = tmp_path / 'late.wav'
    found = {'ok': False}
    jobs = TimelineJobs(tmp_path, lambda tid: audio if found['ok'] else None, FakeStems(tmp_path),
                        beat_tracker=FakeBeats(), audio_wait_sec=0.3)
    jobs.request('late')
    deadline = time.time() + 10
    while time.time() < deadline and (jobs.get('late') or {}).get('status', {}).get('stage') != 'Waiting for the audio upload':
        time.sleep(0.05)
    time.sleep(0.6)
    st = jobs.get('late')
    assert st is None or st['status'].get('quick') in (None, 'waiting'), 'no audio yet is not an error'
    sf.write(audio, chord_tone(['C', 'G', 'Am', 'F'] * 6, 0.5), SR)
    found['ok'] = True
    jobs.request('late')   # what POST /api/audio/cache does when the upload lands
    deadline = time.time() + 120
    while time.time() < deadline and (jobs.get('late') or {}).get('status', {}).get('full') != 'done':
        time.sleep(0.1)
    assert jobs.get('late')['status']['full'] == 'done'


def test_an_empty_upload_never_replaces_the_cached_song(tmp_path: Path, monkeypatch) -> None:
    from fastapi.testclient import TestClient
    import musicdna.service.app as app_module
    import musicdna.service.service as service_module
    monkeypatch.setattr(service_module, 'AUDIO_CACHE_DIR', tmp_path)
    monkeypatch.setattr(app_module.TIMELINE_JOBS, 'request', lambda *a, **k: {})
    service = app_module._DEFAULT_SERVICE
    good = tmp_path / 'song.m4a'
    good.write_bytes(b'x' * 4096)
    client = TestClient(app_module.app)
    r = client.post('/api/audio/cache', data={'track_id': 'song', 'track_title': 'Song'}, files={'file': ('audio.m4a', b'', 'audio/mp4')})
    assert r.status_code == 400
    assert good.read_bytes() == b'x' * 4096, 'the good copy is kept'
    r = client.post('/api/audio/cache', data={'track_id': 'song'}, files={'file': ('audio.wav', b'RIFF' + b'y' * 100, 'audio/wav')})
    assert r.status_code == 200
    assert not good.exists() and (tmp_path / 'song.wav').stat().st_size == 104, 'a real upload replaces it'
    (tmp_path / 'other.m4a').write_bytes(b'')
    assert service.find_cached_audio('other') is None, 'a 0-byte file is not audio'
