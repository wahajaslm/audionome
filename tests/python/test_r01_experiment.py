import numpy as np

from musicdna.config import Config

from musicdna.corpus.manifest import CorpusEntry, CorpusManifest
from musicdna.corpus.feature_store import FeatureStore
from musicdna.experiments.r01 import PairRow, R01Experiment


def entry(video_id: str, artists: str) -> CorpusEntry:
    return CorpusEntry(video_id=video_id, title='', song=video_id, artists=artists, duration_sec=200, url='')


def build_store(tmp_path, songs: list[str]) -> FeatureStore:
    """Preference is planted in vocal feature 5 (sustain); loudness is unrelated noise."""
    store = FeatureStore(Config.load(overrides=['windows.window_sec=10', 'windows.hop_sec=10']), tmp_path)
    rng = np.random.default_rng(1)
    for song in songs:
        vocal = rng.standard_normal((20, 9))
        vocal[:10, 5] += 3.0
        store.save(song, 'vocal', vocal)
        store.save(song, 'spatial', rng.standard_normal((20, 7)))
        store.save(song, 'loudness', rng.random((20, 1)))
    return store


def pairs_for(songs: list[str]) -> list[dict]:
    return [{'corpus_video_id': s, 'preferred': [i * 10.0, i * 10.0 + 10], 'passed_over': [j * 10.0, j * 10.0 + 10],
             'weight': 1.0, 'strength': 'weak'} for s in songs for i in range(0, 10, 3) for j in range(10, 20, 3)]


def test_vocal_ranker_finds_planted_signal_on_held_out_songs(tmp_path) -> None:
    songs = ['s1', 's2', 's3', 's4', 's5', 's6']  # a verdict needs ranker.min_songs_for_verdict songs
    corpus = CorpusManifest(1, '', {}, [entry(s, f'Artist {s}') for s in songs])
    report = R01Experiment(build_store(tmp_path, songs), corpus).run(pairs_for(songs))
    assert report['status'] == 'evaluated'
    vocal = report['systems']['vocal_only']['held_out_song']
    assert vocal['song_macro_accuracy'] > 0.9
    assert next(iter(report['systems']['vocal_only']['feature_directions'])) == 'longest_sustain_sec'
    assert report['systems']['A_clap'] == {'status': 'features_missing', 'blocks': ['clap']}
    assert report['comparisons']['vocal_only vs baseline_louder']['verdict'] == 'better'


def test_too_few_pairs_reports_insufficient_data(tmp_path) -> None:
    corpus = CorpusManifest(1, '', {}, [entry('s1', 'A')])
    report = R01Experiment(build_store(tmp_path, ['s1']), corpus).run(pairs_for(['s1'])[:3])
    assert report['status'] == 'insufficient_data'


def test_primary_artist_groups_collaborations() -> None:
    assert PairRow.primary_artist('Abida Parveen & Rahat Fateh Ali Khan') == 'abida parveen'
    assert PairRow.primary_artist('Ali Sethi x Shae Gill') == 'ali sethi'
    assert PairRow.primary_artist('Ali Pervez Mehdi ft. Meesha Shafi') == 'ali pervez mehdi'


def test_no_verdict_from_too_few_songs() -> None:
    """Three songs that all lean slightly the same way: the bootstrap interval excludes 0, but that
    happens by chance a quarter of the time, so no 'better' / 'worse' is claimed."""
    from musicdna.experiments.r01 import SongStatistics
    result = SongStatistics().compare({'a': 0.52, 'b': 0.51, 'c': 0.53}, {'a': 0.5, 'b': 0.5, 'c': 0.5})
    assert result['verdict'].startswith('too few songs') and result['mean_difference'] == 0.02
