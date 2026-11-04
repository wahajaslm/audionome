"""Within-song preference pairs derived from normal listening, with no A-vs-B prompts.

Evidence per window comes from `preference.signals`. A window is *preferred* when it has positive
evidence (saved, liked, looped, rewound into) and no negative; *passed over* when it has negative
evidence (disliked, skipped out of, heard through without action) and no positive. Windows never
heard are excluded: silence is not a negative. Every preferred window is paired with every
non-overlapping passed-over window of the same song, so a model must tell moments apart inside
one recording rather than learn which artists the listener plays.

    python -m musicdna.preference.implicit_pairs music-dna-profile.json --set windows.window_sec=10
"""
from __future__ import annotations
import argparse
import json
import re
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any

from musicdna.audio.windows import WindowGrid
from musicdna.config import DEFAULT, Config
from musicdna.preference.signals import ListeningEvidenceCollector, WindowEvidence

EXPLICIT_POSITIVE = {'saved_moment', 'liked'}
EXPLICIT_NEGATIVE = {'disliked', 'left_early'}


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
    linked_by: str | None = None  # 'file_hash' (the exact corpus file), 'title', or None (not a corpus song)
    time_shift_sec: float = 0.0   # added to the player's times to match the corpus decode (see player_offset)


class ImplicitPairBuilder:
    """Turns a music-dna-profile-v1 export into within-song preference pairs."""

    def __init__(self, config: Config = DEFAULT) -> None:
        self.config = config
        self.collector = ListeningEvidenceCollector(config)

    def label_windows(self, profile: dict[str, Any]) -> dict[str, list[WindowEvidence]]:
        durations = {t['id']: float(t.get('durationSec') or 0) for t in profile.get('tracks', [])}
        return self.collector.collect(durations, profile.get('events', []), profile.get('moments', []),
                                      profile.get('ratings', []))

    def build_pairs(self, profile: dict[str, Any], songs: dict[str, str] | None = None,
                    files: dict[str, str] | None = None,
                    corpus_durations: dict[str, float] | None = None) -> list[PreferencePair]:
        """Links imported tracks to corpus songs: `files` maps a corpus file's sha256 to its id, `songs` a song name.

        The file hash wins, because only the exact corpus file guarantees pair windows land on the audio
        the features were computed from. Example: importing data/coke_studio/audio/7rLxN41avhY.m4a gives a
        track titled '7rLxN41avhY'; no song name matches it, but its sha256 does (-> Garaj Baras).
        A track with a hash that is *not* in the corpus (e.g. a re-encoded 'Garaj Baras.mp3') is not linked
        by title either: its audio may be offset or trimmed against the corpus file.

        `corpus_durations` (corpus id -> decoded length in seconds) turns on the player delay
        compensation for file-hash links; see `player_offset`.
        """
        signals = self.config.signals
        tracks = {t['id']: t for t in profile.get('tracks', [])}
        titles = {track_id: str(t.get('title') or '') for track_id, t in tracks.items()}
        links = {track_id: self.link(t, songs or {}, files or {}) for track_id, t in tracks.items()}
        shifts = {track_id: self.player_offset(tracks[track_id], (corpus_durations or {}).get(video_id))
                  for track_id, (video_id, linked_by) in links.items() if linked_by == 'file_hash'}
        pairs: list[PreferencePair] = []
        for track_id, windows in self.label_windows(self.shifted(profile, shifts)).items():
            # A window with both kinds of evidence is ambiguous and left out.
            preferred = [w for w in windows if w.positive() and not w.negative(signals)]
            passed_over = [w for w in windows if w.negative(signals) and not w.positive()]
            video_id, linked_by = links.get(track_id, (None, None))
            for good in preferred:
                for bad in passed_over:
                    if WindowGrid.overlap(good.start_sec, good.end_sec, bad.start_sec, bad.end_sec) > 0:
                        continue  # overlapping windows share audio; the pair would compare a passage with itself
                    explicit = bool(EXPLICIT_POSITIVE & good.positive().keys()) and \
                        bool(EXPLICIT_NEGATIVE & bad.negative(signals).keys())
                    pairs.append(PreferencePair(
                        track_id=track_id, track_title=titles[track_id], corpus_video_id=video_id,
                        preferred=(good.start_sec, good.end_sec), passed_over=(bad.start_sec, bad.end_sec),
                        preferred_evidence=sorted(good.positive()), passed_over_evidence=sorted(bad.negative(signals)),
                        weight=round(min(good.positive_score(signals), bad.negative_score(signals)), 3),
                        strength='strong' if explicit else 'weak', linked_by=linked_by,
                        time_shift_sec=round(shifts.get(track_id, 0.0), 4),
                    ))
        return pairs

    def player_offset(self, track: dict[str, Any], corpus_duration: float | None) -> float:
        """Seconds to add to the player's times so they match the corpus (ffmpeg) decode of the same file.

        DELAY FIX: Safari's <audio> element skips the AAC encoder padding (2112 samples, ~48 ms) at the
        start of an M4A; ffmpeg keeps it. So Safari's media clock runs ~48 ms behind the corpus timeline,
        and its reported duration is that much shorter. Chromium matches ffmpeg exactly (gap 0).
        Example: Garaj Baras is 466.0245 s in ffmpeg, 465.9771 s in WebKit -> shift +0.047 s, so a moment
        Safari saved at 119.953 s is placed at 120.000 s in the corpus features.
        The gap is only trusted when it is positive and at most signals.max_player_offset_sec; anything
        else (a rounded or guessed duration, e.g. the 180 s import fallback) means no shift.
        """
        player_duration = float(track.get('durationSec') or 0.0)
        if not corpus_duration or not player_duration:
            return 0.0
        # Whole milliseconds: the two durations differ by float noise even when the clocks agree.
        # Example: Chromium 466.02449 s vs ffmpeg 466.0245 s -> 0.00001 s, which as a shift moved a
        # moment at 120 s to 120.00001 s and pushed window 114-126 s just under the 50% overlap rule.
        gap = round(corpus_duration - player_duration, 3)
        return gap if 0.0 < gap <= self.config.signals.max_player_offset_sec else 0.0

    @staticmethod
    def shifted(profile: dict[str, Any], shifts: dict[str, float]) -> dict[str, Any]:
        """A copy of the profile with each track's event, moment and rating times moved by its shift,
        and its duration lengthened to match (so the window grid matches the corpus grid)."""
        if not any(shifts.values()):
            return profile
        move = lambda item, keys: {**item, **{k: float(item[k]) + shifts.get(item.get('trackId'), 0.0)  # noqa: E731
                                              for k in keys if item.get(k) is not None}}
        return {
            **profile,
            'tracks': [{**t, 'durationSec': float(t.get('durationSec') or 0.0) + shifts.get(t['id'], 0.0)}
                       for t in profile.get('tracks', [])],
            'events': [move(e, ('positionSec', 'fromSec', 'toSec', 'momentStartSec', 'momentEndSec'))
                       for e in profile.get('events', [])],
            'moments': [move(m, ('startSec', 'endSec')) for m in profile.get('moments', [])],
            'ratings': [move(r, ('startSec', 'endSec')) for r in profile.get('ratings', [])],
        }

    @classmethod
    def link(cls, track: dict[str, Any], songs: dict[str, str], files: dict[str, str]) -> tuple[str | None, str | None]:
        """(corpus id, how it was linked). Title matching is only a fallback for tracks exported before
        the player stored file hashes."""
        digest = track.get('sha256')
        if digest:
            return (files[digest], 'file_hash') if digest in files else (None, None)
        video_id = cls.match_song(str(track.get('title') or ''), songs) if songs else None
        return video_id, 'title' if video_id else None

    @staticmethod
    def match_song(track_title: str, songs: dict[str, str]) -> str | None:
        """Id of the longest known song name that appears in the track title, if any."""
        normalize = lambda text: re.sub(r'[^a-z0-9]+', ' ', text.lower()).strip()  # noqa: E731
        title = f' {normalize(track_title)} '
        matches = [song for song in songs if f' {normalize(song)} ' in title]
        return songs[max(matches, key=len)] if matches else None


def main() -> None:
    parser = argparse.ArgumentParser(description='Build within-song preference pairs from a profile export')
    parser.add_argument('profile', type=Path, help='music-dna-profile.json exported from the player')
    parser.add_argument('--out', type=Path, default=Path('research-output/preference_pairs.json'))
    Config.add_arguments(parser)
    arguments = parser.parse_args()

    profile = json.loads(arguments.profile.read_text(encoding='utf8'))
    # Unlinked to the corpus; musicdna.experiments.pipeline links pairs to corpus songs.
    pairs = ImplicitPairBuilder(Config.from_arguments(arguments)).build_pairs(profile)
    arguments.out.parent.mkdir(parents=True, exist_ok=True)
    arguments.out.write_text(json.dumps([asdict(p) for p in pairs], indent=2, ensure_ascii=False) + '\n', encoding='utf8')

    songs = {p.track_id for p in pairs}
    strong = sum(p.strength == 'strong' for p in pairs)
    print(f'{len(pairs)} pairs ({strong} strong) across {len(songs)} songs -> {arguments.out}')


if __name__ == '__main__':
    main()
