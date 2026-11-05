"""Genre mix corpus: song filter and popularity tiers (no network)."""
from musicdna.corpus.genre_mix import GenreMixEntry, assign_tiers, is_single_song, split_title


def song(vid: str, views: int, likes: int) -> GenreMixEntry:
    return GenreMixEntry(video_id=vid, title=vid, song=vid, artists='', duration_sec=200, url='', genre='pop',
                         region='western', tier='', channel='', view_count=views, like_count=likes, query='')


def test_tiers_are_distinct_and_follow_views_and_like_ratio():
    pool = [song('hit', 10_000_000, 100_000), song('big', 5_000_000, 40_000), song('mid', 200_000, 2_000),
            song('mid2', 150_000, 1_000), song('gem', 9_000, 470), song('meh', 32_000, 140), song('tiny', 300, 200)]
    tiers = {e.video_id: e.tier for e in assign_tiers(pool, per_tier=1)}
    # 6 songs over 1,000 views: median 175,000 -> 'mid' (200k) and 'mid2' (150k) tie; the first wins.
    assert tiers == {'hit': 'top', 'gem': 'underrated', 'meh': 'low', 'mid': 'middle'}
    # 'tiny' has the best ratio but too few views to count.
    assert 'tiny' not in tiers


def test_single_song_filter_drops_mixes_and_keeps_original_mix():
    assert is_single_song('Artist - Track (Original Mix)', 420)
    assert not is_single_song('Deep House Mix 2025', 400)
    assert not is_single_song('Best of Bollywood Jukebox', 300)
    assert not is_single_song('Some song', 6000)


def test_split_title():
    assert split_title('Band - Song (Official Audio)', 'Chan') == ('Song', 'Band')
    assert split_title('Song name', 'Chan') == ('Song name', 'Chan')


def test_registry_gives_each_corpus_its_own_folders(tmp_path):
    from musicdna.corpus.registry import CORPORA, get_corpus
    assert set(CORPORA) >= {'coke_studio', 'genre_mix'}
    genre = get_corpus('genre_mix')
    store = genre.feature_store()
    assert store.audio_directory == genre.directory / 'audio'
    assert store.root == genre.directory / 'features'
    assert store.tonic_annotations == genre.directory / 'tonic_annotations.json'
    # The feature store reads audio from its corpus's folder, not Coke Studio's.
    from musicdna.corpus.manifest import CorpusManifest
    entry = song('abc', 1, 0)
    entry.audio_file = 'abc.m4a'
    assert CorpusManifest.audio_path(entry, store.audio_directory) == genre.directory / 'audio' / 'abc.m4a'


def test_replay_curve_reads_heatmap_and_survives_manifest_round_trip(tmp_path):
    from musicdna.corpus.genre_mix import GenreMixManifest, replay_curve
    info = {'heatmap': [{'start_time': 0.0, 'end_time': 2.774, 'value': 0.73302},
                        {'start_time': 55.4, 'end_time': 58.17, 'value': 1.0}]}
    assert replay_curve(info) == [[0.0, 2.77, 0.733], [55.4, 58.17, 1.0]]
    # Videos with too few views have no graph: None, not an empty curve.
    assert replay_curve({'heatmap': None}) is None and replay_curve({}) is None
    entry = song('abc', 1_000_000, 10_000)
    entry.replay_curve = replay_curve(info)
    path = tmp_path / 'manifest.json'
    GenreMixManifest(manifest_version=1, created_at='', selection={}, entries=[entry]).save(path)
    assert GenreMixManifest.load(path).entries[0].replay_curve == [[0.0, 2.77, 0.733], [55.4, 58.17, 1.0]]


def test_confirmation_set_never_reuses_a_main_set_song(monkeypatch):
    from musicdna.corpus.genre_mix import GenreMixCatalog, GenreMixManifest, title_key
    assert title_key('Pasoori (Official Video)') == title_key('PASOORI | Official video') == 'pasoori'
    used = song('a', 9_000_000, 90_000)
    used.title = 'Pasoori (Official Video)'
    reupload = song('b', 8_000_000, 80_000)
    reupload.title = 'PASOORI | Official video'   # same song, other upload: excluded by title
    fresh = song('c', 7_000_000, 70_000)
    catalog = GenreMixCatalog.__new__(GenreMixCatalog)
    monkeypatch.setattr(catalog, 'genre_pool', lambda name: [used, reupload, fresh], raising=False)
    main = GenreMixManifest(manifest_version=1, created_at='', selection={}, entries=[used])
    chosen = catalog.build_manifest(per_tier=1, genres=['pop'], exclude=main)
    assert [e.video_id for e in chosen.entries] == ['c']
