from musicdna.audio.windows import WindowGrid
from musicdna.config import DEFAULT, Config
from musicdna.preference.implicit_pairs import ImplicitPairBuilder

TEN_SECOND = Config.load(overrides=['windows.window_sec=10', 'windows.hop_sec=10'])


def event(kind: str, origin: str = 'user', **fields: float) -> dict:
    return {'trackId': 't1', 'sessionId': 's1', 'kind': kind, 'origin': origin, 'at': 0, 'positionSec': 0, **fields}


def profile(**extra: list) -> dict:
    return {
        'tracks': [{'id': 't1', 'title': 'Chaap Tilak - Abida Parveen', 'durationSec': 60}],
        'moments': [], 'ratings': [], 'events': [event('listen_span', 'player', fromSec=0, toSec=60)], **extra,
    }


def test_saved_moment_pairs_with_windows_heard_without_action() -> None:
    pairs = ImplicitPairBuilder(TEN_SECOND).build_pairs(profile(moments=[{'trackId': 't1', 'startSec': 20, 'endSec': 30}]))
    assert {p.preferred for p in pairs} == {(20.0, 30.0)}
    assert len(pairs) == 5
    assert all(p.passed_over_evidence == ['heard_without_action'] and p.strength == 'weak' for p in pairs)


def test_unheard_windows_are_never_negatives() -> None:
    data = profile(moments=[{'trackId': 't1', 'startSec': 0, 'endSec': 10}])
    data['events'] = [event('listen_span', 'player', fromSec=0, toSec=20)]
    pairs = ImplicitPairBuilder(TEN_SECOND).build_pairs(data)
    assert [p.passed_over for p in pairs] == [(10.0, 20.0)]


def test_skip_out_of_window_makes_a_strong_pair_with_a_saved_moment() -> None:
    data = profile(moments=[{'trackId': 't1', 'startSec': 0, 'endSec': 10}],
                   events=[event('listen_span', 'player', fromSec=0, toSec=45), event('skip', positionSec=42)])
    strong = [p for p in ImplicitPairBuilder(TEN_SECOND).build_pairs(data) if p.strength == 'strong']
    assert [p.passed_over for p in strong] == [(40.0, 50.0)]


def test_rewind_counts_but_automatic_loop_cycles_do_not() -> None:
    data = profile()
    data['events'] += [event('seek', fromSec=38, toSec=31), event('loop_cycle', 'player', momentStartSec=0, momentEndSec=10)]
    windows = ImplicitPairBuilder(TEN_SECOND).label_windows(data)['t1']
    assert windows[3].positive() == {'rewound_into': 1.0}
    assert windows[0].positive() == {}


def test_conflicting_window_is_left_out() -> None:
    data = profile(moments=[{'trackId': 't1', 'startSec': 0, 'endSec': 10}],
                   ratings=[{'trackId': 't1', 'startSec': 0, 'endSec': 10, 'value': 'dislike'}])
    assert ImplicitPairBuilder(TEN_SECOND).build_pairs(data) == []


def test_overlapping_windows_are_never_paired() -> None:
    assert (DEFAULT.windows.window_sec, DEFAULT.windows.hop_sec) == (12.0, 6.0)
    pairs = ImplicitPairBuilder(DEFAULT).build_pairs(profile(moments=[{'trackId': 't1', 'startSec': 24, 'endSec': 36}]))
    assert pairs
    assert all(WindowGrid.overlap(*p.preferred, *p.passed_over) == 0 for p in pairs)


def test_window_grid_follows_config() -> None:
    assert WindowGrid(DEFAULT.windows).windows(30) == [(0, 12), (6, 18), (12, 24), (18, 30), (24, 30)]
    assert WindowGrid(TEN_SECOND.windows).windows(25) == [(0, 10), (10, 20), (20, 25)]


def test_matches_imported_track_to_corpus_song() -> None:
    songs = {'Chaap Tilak': 'v1', 'Tilak': 'v2'}
    assert ImplicitPairBuilder.match_song('Chaap-Tilak-Sab-Cheeni-Abida-Parveen', songs) == 'v1'
    assert ImplicitPairBuilder.match_song('Pasoori', songs) is None


def test_file_hash_links_the_exact_corpus_file_and_overrides_the_title() -> None:
    songs, files = {'Chaap Tilak': 'v1'}, {'abc': 'v9'}
    moment = [{'trackId': 't1', 'startSec': 20, 'endSec': 30}]
    exact = profile(moments=moment)
    exact['tracks'][0].update(title='7SDrjwtfKMk', sha256='abc')  # corpus file imported by its file name
    assert {(p.corpus_video_id, p.linked_by) for p in ImplicitPairBuilder(TEN_SECOND).build_pairs(exact, songs, files)} == {('v9', 'file_hash')}
    other_file = profile(moments=moment)
    other_file['tracks'][0]['sha256'] = 'not-in-corpus'  # same title, different audio file: not linked
    assert {p.corpus_video_id for p in ImplicitPairBuilder(TEN_SECOND).build_pairs(other_file, songs, files)} == {None}
    old_export = profile(moments=moment)  # exported before the player stored hashes: title fallback
    assert {(p.corpus_video_id, p.linked_by) for p in ImplicitPairBuilder(TEN_SECOND).build_pairs(old_export, songs, files)} == {('v1', 'title')}


def test_safari_clock_is_shifted_onto_the_corpus_timeline() -> None:
    """Safari skips ~48 ms of AAC padding, so its times run that much behind the corpus decode.
    A forward seek Safari logged from 113.96 s really left at 114.01 s: window 114-126 s, not 102-114 s."""
    builder = ImplicitPairBuilder(DEFAULT)
    safari = {'tracks': [{'id': 't1', 'title': 'x', 'durationSec': 465.9771, 'sha256': 'abc'}],
              'moments': [{'trackId': 't1', 'startSec': 239.9526, 'endSec': 251.9526}], 'ratings': [],
              'events': [event('seek', fromSec=113.96, toSec=130)]}
    pairs = builder.build_pairs(safari, {}, {'abc': 'v1'}, {'v1': 466.0245})
    assert {p.time_shift_sec for p in pairs} == {0.047}
    assert {p.passed_over for p in pairs} == {(108.0, 120.0), (114.0, 126.0)}
    assert {p.preferred for p in pairs} >= {(240.0, 252.0)}
    chrome = {**safari, 'tracks': [{**safari['tracks'][0], 'durationSec': 466.02449}]}  # float noise, no shift
    assert {p.time_shift_sec for p in builder.build_pairs(chrome, {}, {'abc': 'v1'}, {'v1': 466.0245})} == {0.0}
    assert builder.player_offset({'durationSec': 180}, 466.0245) == 0.0  # import fallback duration: not measured


def test_practice_loops_and_slowed_events_are_not_evidence() -> None:
    """PRACTICE FIX: same rule as src/core/practice.ts. A 3-cycle loop counts; a 6-cycle loop
    or a slowed one does not, from its loop_enabled on."""
    from musicdna.preference.signals import PRACTICE_MIN_CYCLES, listening_only

    def episode(at: int, cycles: int, session: str, **extra: object) -> list[dict]:
        base = {'trackId': 'a', 'sessionId': session, 'momentStartSec': 70.0, 'momentEndSec': 78.0}
        return ([{**base, 'kind': 'loop_enabled', 'origin': 'user', 'at': at, **extra}]
                + [{**base, 'kind': 'loop_cycle', 'origin': 'player', 'at': at + 1 + i, **extra} for i in range(cycles)]
                + [{**base, 'kind': 'loop_disabled', 'origin': 'user', 'at': at + cycles + 1}])

    short, long = episode(100, 3, 'S1'), episode(200, PRACTICE_MIN_CYCLES, 'S1')
    slowed = episode(300, 1, 'S2', mode='practice', rate=0.75)
    dismiss = {'trackId': 'a', 'sessionId': 'S2', 'kind': 'dismiss_candidate', 'origin': 'user', 'at': 400, 'mode': 'practice'}
    kept = listening_only([*short, *long, *slowed, dismiss])
    assert kept == [*short, dismiss]
