from musicdna.audio.windows import overlap, window_grid
from musicdna.config import DEFAULT, load_config
from musicdna.preference.implicit_pairs import ImplicitPairBuilder, match_song

TEN_SECOND = load_config(overrides=['windows.window_sec=10', 'windows.hop_sec=10'])


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
    assert all(overlap(*p.preferred, *p.passed_over) == 0 for p in pairs)


def test_window_grid_follows_config() -> None:
    assert window_grid(30, DEFAULT.windows) == [(0, 12), (6, 18), (12, 24), (18, 30), (24, 30)]
    assert window_grid(25, TEN_SECOND.windows) == [(0, 10), (10, 20), (20, 25)]


def test_matches_imported_track_to_corpus_song() -> None:
    songs = {'Chaap Tilak': 'v1', 'Tilak': 'v2'}
    assert match_song('Chaap-Tilak-Sab-Cheeni-Abida-Parveen', songs) == 'v1'
    assert match_song('Pasoori', songs) is None
