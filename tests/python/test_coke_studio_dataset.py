from musicdna.corpus.coke_studio import CokeStudioCatalog


def test_parses_every_title_format() -> None:
    cases = {
        'Garaj Baras | Rahat Fateh Ali Khan & Ali Azmat | Season 1 | Coke Studio Pakistan | @RohailHyattMusic':
            (1, 'Garaj Baras', 'Rahat Fateh Ali Khan & Ali Azmat'),
        'Coke Studio Season 9| Afreen Afreen| Rahat Fateh Ali Khan & Momina Mustehsan':
            (9, 'Afreen Afreen', 'Rahat Fateh Ali Khan & Momina Mustehsan'),
        'Coke Studio 2020 | Gal Sunn | Ali Pervez Mehdi ft. Meesha Shafi':
            (13, 'Gal Sunn', 'Ali Pervez Mehdi ft. Meesha Shafi'),
        'Coke Studio | Season 14 | Pasoori | Ali Sethi x Shae Gill':
            (14, 'Pasoori', 'Ali Sethi x Shae Gill'),
        'Jhol | Coke Studio Pakistan | Season 15 | Maanu x Annural Khalid':
            (15, 'Jhol', 'Maanu x Annural Khalid'),
        'Coke Studio Season 11| Piya Ghar Aaya| Fareed Ayaz| Abu Muhammad Qawwal and Brothers':
            (11, 'Piya Ghar Aaya', 'Fareed Ayaz & Abu Muhammad Qawwal and Brothers'),
        'Coke Studio 2020 | Na Tutteya Ve | Season Opener':
            (13, 'Na Tutteya Ve', ''),
    }
    for title, (season, song, artists) in cases.items():
        assert CokeStudioCatalog.parse_season(title) == season
        assert CokeStudioCatalog.parse_song_and_artists(title) == (song, artists)


def test_excludes_non_song_uploads() -> None:
    assert CokeStudioCatalog.is_song_performance('Coke Studio Season 7| Tum Naraaz Ho| Sajjad Ali', 365)
    assert not CokeStudioCatalog.is_song_performance('Coke Studio Season 7| BTS| Tum Naraaz Ho| Sajjad Ali', 365)
    assert not CokeStudioCatalog.is_song_performance('Magical Journey of Jhol | Coke Studio Pakistan', 400)
    assert not CokeStudioCatalog.is_song_performance('Coke Studio Pakistan | Season 15 | 04.07.24', 20)
    assert not CokeStudioCatalog.is_song_performance('Qasam | Coke Studio Nu.WAV | Shae Gill', None)


def test_selects_top_views_per_season_without_duplicate_songs() -> None:
    videos = [
        {'id': 'a', 'title': 'Coke Studio Season 9| Song A| X', 'duration': 300, 'view_count': 10},
        {'id': 'b', 'title': 'Coke Studio Season 9| Song B| Y', 'duration': 300, 'view_count': 30},
        {'id': 'c', 'title': 'Coke Studio Season 9| Song B| Y', 'duration': 310, 'view_count': 5},
        {'id': 'd', 'title': 'Coke Studio Season 9| Song C| Z', 'duration': 300, 'view_count': 20},
    ]
    selected = CokeStudioCatalog.select({'coke_studio_pakistan': videos}, per_season=2)
    assert [entry.video_id for entry in selected] == ['b', 'd']
    assert all(entry.era == 'middle' and entry.year == 2016 for entry in selected)


def test_era_boundaries() -> None:
    assert [CokeStudioCatalog.era_for_season(s) for s in (1, 6, 7, 10, 11, 15)] == [
        'classic', 'classic', 'middle', 'middle', 'modern', 'modern']


def test_generic_code_can_read_a_coke_studio_manifest(tmp_path) -> None:
    from musicdna.corpus.coke_studio import CokeStudioManifest
    from musicdna.corpus.manifest import CorpusManifest
    videos = [{'id': 'a', 'title': 'Coke Studio Season 9| Song A| X', 'duration': 300, 'view_count': 10}]
    path = tmp_path / 'manifest.json'
    CokeStudioManifest(1, '', {}, CokeStudioCatalog.select({'coke_studio_pakistan': videos}, per_season=1)).save(path)
    generic = CorpusManifest.load(path).entries[0]
    specific = CokeStudioManifest.load(path).entries[0]
    assert (generic.song, generic.label) == ('Song A', 'Song A')
    assert (specific.season, specific.era, specific.label) == (9, 'middle', 'S 9 Song A')
