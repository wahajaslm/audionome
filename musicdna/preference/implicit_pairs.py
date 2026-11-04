"""Within-song preference pairs derived from normal listening, with no A-vs-B prompts.

Each song is cut into fixed windows. A window is *preferred* when the listener saved it, liked it,
looped it, or rewound into it. A window is *passed over* when it was heard through with no such
action, skipped out of, or disliked. Windows never heard are excluded: silence is not a negative.
Every preferred window is paired with every passed-over window of the same song, so a model must
tell moments apart inside one recording rather than learn which artists the listener plays.

    python -m musicdna.preference.implicit_pairs music-dna-profile.json --out research-output/pairs.json
"""
from __future__ import annotations
import argparse
import json
import re
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any

WINDOW_SEC = 10.0
MIN_OVERLAP_FRACTION = 0.5
HEARD_FRACTION = 0.8
REWIND_MIN_SEC = 4.0
FORWARD_SEEK_MIN_SEC = 5.0

# Explicit actions outweigh implicit ones; automatic loop cycles are never evidence.
POSITIVE_WEIGHTS = {'saved_moment': 3.0, 'liked': 2.0, 'loop_started': 2.0, 'rewound_into': 1.0}
NEGATIVE_WEIGHTS = {'disliked': 3.0, 'left_early': 1.5, 'heard_without_action': 1.0}
MAX_REWIND_COUNT = 3


@dataclass
class Window:
    track_id: str
    start_sec: float
    end_sec: float
    heard_sec: float = 0.0
    positive: dict[str, float] = field(default_factory=dict)
    negative: dict[str, float] = field(default_factory=dict)

    def add(self, side: dict[str, float], signal: str, count: float = 1.0) -> None:
        side[signal] = side.get(signal, 0.0) + count

    @property
    def positive_score(self) -> float:
        # Repeated rewinds add up to a cap; any other signal counts once.
        return sum(POSITIVE_WEIGHTS[s] * (min(c, MAX_REWIND_COUNT) if s == 'rewound_into' else 1.0)
                   for s, c in self.positive.items())

    @property
    def negative_score(self) -> float:
        return sum(NEGATIVE_WEIGHTS[s] for s, c in self.negative.items() if c > 0)


@dataclass
class PreferencePair:
    track_id: str
    track_title: str
    corpus_video_id: str | None
    preferred: tuple[float, float]
    passed_over: tuple[float, float]
    preferred_evidence: list[str]
    passed_over_evidence: list[str]
    weight: float
    strength: str


def overlap(a_start: float, a_end: float, b_start: float, b_end: float) -> float:
    return max(0.0, min(a_end, b_end) - max(a_start, b_start))


class ImplicitPairBuilder:
    """Turns a music-dna-profile-v1 export into within-song preference pairs."""

    def __init__(self, window_sec: float = WINDOW_SEC) -> None:
        self.window_sec = window_sec

    def windows_for(self, track_id: str, duration_sec: float) -> list[Window]:
        count = max(1, int(duration_sec // self.window_sec))
        return [Window(track_id, i * self.window_sec, (i + 1) * self.window_sec) for i in range(count)]

    def _mark_span(self, windows: list[Window], start: float, end: float, side: str, signal: str) -> None:
        for window in windows:
            if overlap(window.start_sec, window.end_sec, start, end) >= MIN_OVERLAP_FRACTION * self.window_sec:
                window.add(getattr(window, side), signal)

    def _window_at(self, windows: list[Window], position: float) -> Window | None:
        for window in windows:
            if window.start_sec <= position < window.end_sec:
                return window
        return None

    def label_windows(self, profile: dict[str, Any]) -> dict[str, list[Window]]:
        tracks = {t['id']: t for t in profile.get('tracks', [])}
        by_track = {tid: self.windows_for(tid, float(t.get('durationSec') or 0)) for tid, t in tracks.items()}

        for moment in profile.get('moments', []):
            if moment['trackId'] in by_track:
                self._mark_span(by_track[moment['trackId']], moment['startSec'], moment['endSec'], 'positive', 'saved_moment')
        for rating in profile.get('ratings', []):
            if rating['trackId'] in by_track:
                side, signal = ('positive', 'liked') if rating['value'] == 'like' else ('negative', 'disliked')
                self._mark_span(by_track[rating['trackId']], rating['startSec'], rating['endSec'], side, signal)

        for event in sorted(profile.get('events', []), key=lambda e: e.get('at', 0)):
            windows = by_track.get(event.get('trackId', ''))
            if not windows:
                continue
            kind, by_user = event.get('kind'), event.get('origin') == 'user'
            if kind == 'listen_span':
                for window in windows:
                    window.heard_sec += overlap(window.start_sec, window.end_sec,
                                                float(event.get('fromSec', 0)), float(event.get('toSec', 0)))
            elif kind == 'loop_enabled' and by_user:
                self._mark_span(windows, float(event.get('momentStartSec', 0)), float(event.get('momentEndSec', 0)),
                                'positive', 'loop_started')
            elif kind == 'seek' and by_user:
                from_sec, to_sec = float(event.get('fromSec', 0)), float(event.get('toSec', 0))
                if from_sec - to_sec >= REWIND_MIN_SEC:
                    self._mark_span(windows, to_sec, from_sec, 'positive', 'rewound_into')
                elif to_sec - from_sec >= FORWARD_SEEK_MIN_SEC and (window := self._window_at(windows, from_sec)):
                    window.add(window.negative, 'left_early')
            elif kind == 'skip' and by_user and (window := self._window_at(windows, float(event.get('positionSec', 0)))):
                window.add(window.negative, 'left_early')

        for windows in by_track.values():
            for window in windows:
                if not window.positive and window.heard_sec >= HEARD_FRACTION * self.window_sec:
                    window.add(window.negative, 'heard_without_action')
        return by_track

    def build_pairs(self, profile: dict[str, Any], songs: dict[str, str] | None = None) -> list[PreferencePair]:
        """`songs` maps a known song name to its corpus id, to link imported tracks to the corpus."""
        titles = {t['id']: str(t.get('title') or '') for t in profile.get('tracks', [])}
        pairs: list[PreferencePair] = []
        for track_id, windows in self.label_windows(profile).items():
            # A window with both kinds of evidence is ambiguous and left out.
            preferred = [w for w in windows if w.positive and not w.negative]
            passed_over = [w for w in windows if w.negative and not w.positive]
            video_id = match_song(titles[track_id], songs) if songs else None
            for good in preferred:
                for bad in passed_over:
                    explicit = bool({'saved_moment', 'liked'} & good.positive.keys()) and \
                        bool({'disliked', 'left_early'} & bad.negative.keys())
                    pairs.append(PreferencePair(
                        track_id=track_id, track_title=titles[track_id], corpus_video_id=video_id,
                        preferred=(good.start_sec, good.end_sec), passed_over=(bad.start_sec, bad.end_sec),
                        preferred_evidence=sorted(good.positive), passed_over_evidence=sorted(bad.negative),
                        weight=round(min(good.positive_score, bad.negative_score), 3),
                        strength='strong' if explicit else 'weak',
                    ))
        return pairs


def _normalize(text: str) -> str:
    return re.sub(r'[^a-z0-9]+', ' ', text.lower()).strip()


def match_song(track_title: str, songs: dict[str, str]) -> str | None:
    """Id of the longest known song name that appears in the track title, if any."""
    title = f' {_normalize(track_title)} '
    matches = [song for song in songs if f' {_normalize(song)} ' in title]
    return songs[max(matches, key=len)] if matches else None


def main() -> None:
    parser = argparse.ArgumentParser(description='Build within-song preference pairs from a profile export')
    parser.add_argument('profile', type=Path, help='music-dna-profile.json exported from the player')
    parser.add_argument('--out', type=Path, default=Path('research-output/preference_pairs.json'))
    parser.add_argument('--window-sec', type=float, default=WINDOW_SEC)
    arguments = parser.parse_args()

    profile = json.loads(arguments.profile.read_text(encoding='utf8'))
    # Unlinked to the corpus; musicdna.experiments.pipeline links pairs to corpus songs.
    pairs = ImplicitPairBuilder(arguments.window_sec).build_pairs(profile)
    arguments.out.parent.mkdir(parents=True, exist_ok=True)
    arguments.out.write_text(json.dumps([asdict(p) for p in pairs], indent=2, ensure_ascii=False) + '\n', encoding='utf8')

    songs = {p.track_id for p in pairs}
    strong = sum(p.strength == 'strong' for p in pairs)
    print(f'{len(pairs)} pairs ({strong} strong) across {len(songs)} songs -> {arguments.out}')


if __name__ == '__main__':
    main()
