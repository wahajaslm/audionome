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
