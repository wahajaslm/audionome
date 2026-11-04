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
                    files: dict[str, str] | None = None) -> list[PreferencePair]:
        """Links imported tracks to corpus songs: `files` maps a corpus file's sha256 to its id, `songs` a song name.

        The file hash wins, because only the exact corpus file guarantees pair windows land on the audio
        the features were computed from. Example: importing data/coke_studio/audio/7rLxN41avhY.m4a gives a
        track titled '7rLxN41avhY'; no song name matches it, but its sha256 does (-> Garaj Baras).
        A track with a hash that is *not* in the corpus (e.g. a re-encoded 'Garaj Baras.mp3') is not linked
        by title either: its audio may be offset or trimmed against the corpus file.
        """
        signals = self.config.signals
        tracks = {t['id']: t for t in profile.get('tracks', [])}
        titles = {track_id: str(t.get('title') or '') for track_id, t in tracks.items()}
        pairs: list[PreferencePair] = []
        for track_id, windows in self.label_windows(profile).items():
            # A window with both kinds of evidence is ambiguous and left out.
            preferred = [w for w in windows if w.positive() and not w.negative(signals)]
            passed_over = [w for w in windows if w.negative(signals) and not w.positive()]
            video_id, linked_by = self.link(tracks.get(track_id, {}), songs or {}, files or {})
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
                    ))
        return pairs

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
