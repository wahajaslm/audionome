"""The one reading of listening behaviour: events, moments and ratings -> evidence per window.

Used by preference pairs (`implicit_pairs`), the behaviour aggregator and insight synthesizer
(`evaluation`) through `ListeningEvidenceCollector`. Windows come from `WindowGrid`; rules and
weights from `SignalConfig`. Only user actions count as evidence; automatic loop repeats are recorded but are
never preference on their own. Practice (slowed playback, long-running loops) is not evidence at all:
see `listening_only`, the same rule as the player's src/core/practice.ts.
"""
from __future__ import annotations
from dataclasses import dataclass, field
from typing import Any, Iterable

from musicdna.audio.windows import WindowGrid
from musicdna.config import DEFAULT, Config, SignalConfig


@dataclass
class WindowEvidence:
    track_id: str
    start_sec: float
    end_sec: float
    heard_sec: float = 0.0
    listen_passes: int = 0
    rewound_into: int = 0      # user rewinds whose replayed span covers this window
    loop_starts: int = 0       # user enabled a loop covering this window
    loop_cycles: int = 0       # automatic repeats of a loop the user enabled in that session
    seek_arrivals: int = 0     # forward seeks that landed here
    left_early: int = 0        # skips or forward seeks away from inside this window
    volume_changes: int = 0
    saved_moment: bool = False
    liked: bool = False
    disliked: bool = False
    sessions: set[str] = field(default_factory=set)

    @property
    def active(self) -> bool:
        return bool(self.heard_sec or self.rewound_into or self.loop_starts or self.seek_arrivals
                    or self.left_early or self.volume_changes or self.saved_moment or self.liked or self.disliked)

    def positive(self) -> dict[str, float]:
        signals = {'saved_moment': float(self.saved_moment), 'liked': float(self.liked),
                   'loop_started': float(self.loop_starts > 0), 'rewound_into': float(self.rewound_into)}
        return {name: value for name, value in signals.items() if value}

    def negative(self, signals: SignalConfig = DEFAULT.signals) -> dict[str, float]:
        heard_only = not self.positive() and self.heard_sec >= signals.heard_fraction * (self.end_sec - self.start_sec)
        found = {'disliked': float(self.disliked), 'left_early': float(self.left_early),
                 'heard_without_action': float(heard_only)}
        return {name: value for name, value in found.items() if value}

    def positive_score(self, signals: SignalConfig = DEFAULT.signals) -> float:
        """Explicit actions outweigh implicit ones; repeated rewinds add up to a cap."""
        return (signals.weight_saved_moment * self.saved_moment + signals.weight_liked * self.liked
                + signals.weight_loop_started * (self.loop_starts > 0)
                + signals.weight_rewound_into * min(self.rewound_into, signals.max_rewind_count))

    def negative_score(self, signals: SignalConfig = DEFAULT.signals) -> float:
        weights = {'disliked': signals.weight_disliked, 'left_early': signals.weight_left_early,
                   'heard_without_action': signals.weight_heard_without_action}
        return sum(weights[name] for name in self.negative(signals))

    def attention_score(self, signals: SignalConfig = DEFAULT.signals) -> float:
        """Implicit evidence only (no saves or ratings), for ranking unlabelled windows."""
        return (signals.weight_loop_started * (self.loop_starts > 0)
                + signals.weight_rewound_into * min(self.rewound_into, signals.max_rewind_count)
                + signals.weight_repeat_session * max(0, len(self.sessions) - 1)
                + signals.weight_seek_arrival * self.seek_arrivals
                - signals.weight_left_early * self.left_early)


# A favourite chorus is looped a few times; drill runs longer. Same value as src/core/practice.ts.
PRACTICE_MIN_CYCLES = 6


def listening_only(events: Iterable[dict[str, Any]]) -> list[dict[str, Any]]:
    """Events without practice, mirroring the player's `splitPractice`.

    PRACTICE FIX - drilling a passage (slowed down, or looping it 6+ times) used to count as
    taste. Example: one loop of 1:10-1:18 for 20 cycles at 0.75x -> before: 1 loop start and
    20 loop cycles of evidence on that window; now: none of those events are evidence.

    A loop episode runs from a user's loop_enabled to loop_disabled, track_change or the next
    loop_enabled in the same session and track; its loop cycles and the listen spans inside the
    loop belong to it. The whole episode is practice when it reached PRACTICE_MIN_CYCLES cycles
    or any of its events was logged with mode 'practice'. Other events are practice only when
    tagged so. A dismiss_candidate is the listener's answer, never practice.
    """
    ordered = sorted(events, key=lambda e: e.get('at', 0))
    open_eps: dict[tuple[str, str], dict[str, Any]] = {}
    episodes: list[dict[str, Any]] = []
    in_episode: set[int] = set()

    def close(key: tuple[str, str]) -> None:
        if key in open_eps:
            episodes.append(open_eps.pop(key))

    def near(x: Any, y: float) -> bool:
        return x is not None and abs(float(x) - y) < 0.5

    for e in ordered:
        key = (str(e.get('sessionId', 'default')), str(e.get('trackId', '')))
        ep = open_eps.get(key)
        kind = e.get('kind')
        if (kind == 'loop_enabled' and e.get('origin', 'user') == 'user'
                and e.get('momentStartSec') is not None and e.get('momentEndSec') is not None):
            close(key)
            ep = {'a': float(e['momentStartSec']), 'b': float(e['momentEndSec']), 'cycles': 0, 'events': [e]}
            open_eps[key] = ep
            in_episode.add(id(e))
        elif ep is None:
            continue
        elif kind == 'loop_cycle' and near(e.get('momentStartSec'), ep['a']):
            ep['cycles'] += 1
            ep['events'].append(e)
            in_episode.add(id(e))
        elif (kind == 'listen_span' and e.get('fromSec') is not None and e.get('toSec') is not None
              and float(e['fromSec']) >= ep['a'] - 0.5 and float(e['toSec']) <= ep['b'] + 0.5):
            ep['events'].append(e)
            in_episode.add(id(e))
        elif kind in ('loop_disabled', 'track_change'):
            if kind == 'loop_disabled':
                ep['events'].append(e)
                in_episode.add(id(e))
            close(key)
    for key in list(open_eps):
        close(key)

    practice = {id(e) for ep in episodes
                if ep['cycles'] >= PRACTICE_MIN_CYCLES or any(x.get('mode') == 'practice' for x in ep['events'])
                for e in ep['events']}
    return [e for e in ordered if e.get('kind') == 'dismiss_candidate'
            or (id(e) not in practice and (id(e) in in_episode or e.get('mode') != 'practice'))]


class ListeningEvidenceCollector:
    """Turns events, saved moments and ratings into `WindowEvidence` on the shared grid."""

    def __init__(self, config: Config = DEFAULT) -> None:
        self.config = config
        self.grid = WindowGrid(config.windows)

    @staticmethod
    def durations_from_events(events: Iterable[dict[str, Any]], padding_sec: float) -> dict[str, float]:
        """Track lengths implied by the furthest position any event reached (when real durations are unknown)."""
        durations: dict[str, float] = {}
        for event in events:
            track = event.get('trackId')
            if not track:
                continue
            reach = max(float(event.get(k) or 0.0) for k in ('positionSec', 'fromSec', 'toSec', 'momentEndSec'))
            durations[track] = max(durations.get(track, 0.0), reach + padding_sec)
        return durations

    def collect(
        self,
        durations: dict[str, float],
        events: Iterable[dict[str, Any]] = (),
        moments: Iterable[dict[str, Any]] = (),
        ratings: Iterable[dict[str, Any]] = (),
    ) -> dict[str, list[WindowEvidence]]:
        """Evidence for every grid window of every track in `durations`."""
        by_track = {track: [WindowEvidence(track, start, end) for start, end in self.grid.windows(duration)]
                    for track, duration in durations.items() if duration > 0}
        for moment in moments:
            for window in self._covered(by_track.get(moment['trackId'], []), float(moment['startSec']), float(moment['endSec'])):
                window.saved_moment = True
        for rating in ratings:
            for window in self._covered(by_track.get(rating['trackId'], []), float(rating['startSec']), float(rating['endSec'])):
                if rating['value'] == 'like':
                    window.liked = True
                else:
                    window.disliked = True
        loop_sessions: set[tuple[str, str]] = set()
        for event in listening_only(events):
            windows = by_track.get(event.get('trackId', ''))
            if windows:
                self._apply_event(event, windows, loop_sessions)
        return by_track

    def _apply_event(self, event: dict[str, Any], windows: list[WindowEvidence], loop_sessions: set[tuple[str, str]]) -> None:
        signals = self.config.signals
        kind, by_user = event.get('kind'), event.get('origin', 'user') == 'user'
        session = str(event.get('sessionId', 'default'))
        from_sec, to_sec = float(event.get('fromSec') or 0.0), float(event.get('toSec') or 0.0)
        moment_span = (float(event.get('momentStartSec') or 0.0), float(event.get('momentEndSec') or 0.0))
        if kind == 'listen_span':
            for window in windows:
                heard = self.grid.overlap(window.start_sec, window.end_sec, from_sec, to_sec)
                if heard > 0:
                    window.heard_sec += heard
                    window.listen_passes += 1
                    window.sessions.add(session)
        elif kind == 'seek' and by_user:
            if from_sec - to_sec >= signals.rewind_min_sec:
                for window in self._covered(windows, to_sec, from_sec):
                    window.rewound_into += 1
                    window.sessions.add(session)
            elif to_sec - from_sec >= signals.forward_seek_min_sec:
                for window in self._containing(windows, from_sec):
                    window.left_early += 1
                for window in self._containing(windows, to_sec):
                    window.seek_arrivals += 1
                    window.sessions.add(session)
        elif kind == 'skip' and by_user:
            for window in self._containing(windows, float(event.get('positionSec') or 0.0)):
                window.left_early += 1
        elif kind == 'volume' and by_user:
            for window in self._containing(windows, float(event.get('positionSec') or 0.0)):
                window.volume_changes += 1
        elif kind == 'loop_enabled' and by_user:
            loop_sessions.add((event['trackId'], session))
            for window in self._covered(windows, *moment_span):
                window.loop_starts += 1
                window.sessions.add(session)
        elif kind == 'loop_cycle' and (event['trackId'], session) in loop_sessions:
            for window in self._covered(windows, *moment_span):
                window.loop_cycles += 1

    def _covered(self, windows: list[WindowEvidence], start: float, end: float) -> list[WindowEvidence]:
        """Windows a span covers enough of: the threshold scales with the shorter of window and span."""
        fraction = self.config.signals.min_overlap_fraction
        return [w for w in windows if self.grid.overlap(w.start_sec, w.end_sec, start, end)
                >= fraction * min(w.end_sec - w.start_sec, max(end - start, 1e-9))]

    @staticmethod
    def _containing(windows: list[WindowEvidence], position: float) -> list[WindowEvidence]:
        return [w for w in windows if w.start_sec <= position < w.end_sec]
