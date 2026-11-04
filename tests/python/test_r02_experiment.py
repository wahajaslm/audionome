import json

import numpy as np

from musicdna.config import Config
from musicdna.corpus.feature_store import FeatureStore
from musicdna.corpus.manifest import CorpusEntry, CorpusManifest
from musicdna.experiments.r02 import R02Experiment

GRID = Config.load(overrides=['windows.window_sec=10', 'windows.hop_sec=10'])


def build(tmp_path, songs: list[str]) -> FeatureStore:
    """Preference planted in intonation feature 1 (distance from the equal-tempered grid)."""
    store = FeatureStore(GRID, tmp_path)
    rng = np.random.default_rng(2)
    for song in songs:
        intonation = rng.standard_normal((20, 8))
        intonation[:10, 1] += 3.0
        store.save(song, 'intonation', intonation)
        store.save(song, 'vocal', rng.standard_normal((20, 9)))
        store.save(song, 'loudness', rng.random((20, 1)))
        store.save_json(song, 'tonic', {'used': {'midi': 57.0, 'hz': 220.0, 'source': 'annotated'},
                                         'detected': {'midi': 57.1, 'hz': 221.3, 'confidence': 0.6},
                                         'annotated_hz': 220.0})
    return store


def test_r02_finds_intonation_signal_and_reports_tonic_error(tmp_path) -> None:
    songs = ['s1', 's2', 's3', 's4']
    corpus = CorpusManifest(1, '', {}, [CorpusEntry(video_id=s, title='', song=s, artists=f'Singer {s}',
                                                    duration_sec=200, url='') for s in songs])
    pairs = [{'corpus_video_id': s, 'preferred': [i * 10.0, i * 10.0 + 10], 'passed_over': [j * 10.0, j * 10.0 + 10],
              'weight': 1.0, 'strength': 'weak'} for s in songs for i in range(0, 10, 3) for j in range(10, 20, 3)]
    report = R02Experiment(build(tmp_path, songs), corpus).run(pairs)
    assert report['status'] == 'evaluated'
    assert report['systems']['I_intonation']['held_out_song']['song_macro_accuracy'] > 0.9
    assert next(iter(report['systems']['I_intonation']['feature_directions'])) == 'et_deviation_mean_abs_cents'
    assert report['systems']['B_mert_intonation'] == {'status': 'features_missing', 'blocks': ['mert']}
    assert report['comparisons']['I_intonation vs baseline_louder']['verdict'] == 'better'
    assert report['tonic']['annotated_songs'] == 4
    assert report['tonic']['median_detection_error_cents'] == 10.0  # 57.1 vs 57.0 MIDI
    json.dumps(report)  # report must be serialisable
