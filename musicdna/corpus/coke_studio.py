"""Coke Studio Pakistan corpus: which songs, and the season details stored for each.

Builds a versioned manifest of the most-viewed song performances per season from the two
official channels (Rohail Hyatt for Seasons 1-6, Coke Studio Pakistan for Seasons 7 onward),
then fetches the audio locally. Audio is research-only and never committed or redistributed.
Generic loading, saving, download and checksums live in `musicdna.corpus.manifest`.

    python -m musicdna.corpus.coke_studio select --per-season 4
    python -m musicdna.corpus.coke_studio download
    python -m musicdna.corpus.coke_studio verify
"""
from __future__ import annotations
import argparse
import re
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

from musicdna.corpus.manifest import MANIFEST_PATH, CorpusEntry, CorpusManifest

MANIFEST_VERSION = 1

SOURCE_CHANNELS: dict[str, str] = {
    'rohail_hyatt': 'https://www.youtube.com/@RohailHyattMusic/videos',
    'coke_studio_pakistan': 'https://www.youtube.com/@cokestudio/videos',
}

# Season 13 was released as "Coke Studio 2020".
SEASON_YEARS: dict[int, int] = {
    1: 2008, 2: 2009, 3: 2010, 4: 2011, 5: 2012, 6: 2013, 7: 2014, 8: 2015,
    9: 2016, 10: 2017, 11: 2018, 12: 2019, 13: 2020, 14: 2022, 15: 2024,
}

# Non-song uploads: rehearsals, promos, remixes, documentaries, re-performances.
EXCLUDED_TITLE_PATTERN = re.compile(
    r'\b(BTS|behind the scenes|promo|teaser|trailer|coming soon|magical journey|journey|'
    r'remix|lofi|rendition|throwback|off the record|live|jam|session|credits|preparations|'
    r'line ?up|houseband|interview|making|fan love|dance video|episode|highlights|recap)\b',
    re.IGNORECASE,
)
SEASON_PATTERN = re.compile(r'Season\s*(\d{1,2})\b|\bS(\d{1,2})\b|Coke Studio\s+(2020|\d{1,2})\b', re.IGNORECASE)
BRANDING_PATTERN = re.compile(r'coke studio|^season\s*\d+$|^s\d+$|^@|^\d{2}\.\d{2}\.\d{2}$', re.IGNORECASE)
MIN_DURATION_SEC = 150
MAX_DURATION_SEC = 900


@dataclass(kw_only=True)
class CokeStudioEntry(CorpusEntry):
    """A Coke Studio Pakistan performance: the generic entry plus where it sits in the show's history."""
    season: int
    year: int
    era: str              # classic (S1-6, Rohail Hyatt), middle (S7-10, Strings), modern (S11+)
    source_channel: str
    view_count: int

    @property
    def label(self) -> str:
        return f'S{self.season:>2} {self.song}'


@dataclass
class CokeStudioManifest(CorpusManifest):
    entry_class = CokeStudioEntry


class CokeStudioCatalog:
    """Reads the official channel listings and picks the most-viewed song performances per season."""

    def __init__(self, channels: dict[str, str] = SOURCE_CHANNELS) -> None:
        self.channels = channels

    def build_manifest(self, per_season: int) -> CokeStudioManifest:
        listings = {name: self.list_channel(url) for name, url in self.channels.items()}
        return CokeStudioManifest(
            manifest_version=MANIFEST_VERSION,
            created_at=datetime.now(timezone.utc).isoformat(timespec='seconds'),
            selection={'per_season': per_season, 'ranking': 'view_count at listing time',
                       'channels': self.channels, 'duration_sec': [MIN_DURATION_SEC, MAX_DURATION_SEC]},
            entries=self.select(listings, per_season),
        )

    @staticmethod
    def list_channel(channel_url: str) -> list[dict[str, Any]]:
        import yt_dlp
        options = {'extract_flat': 'in_playlist', 'quiet': True, 'no_warnings': True}
        with yt_dlp.YoutubeDL(options) as client:
            info = client.extract_info(channel_url, download=False)
        return [entry for entry in info.get('entries') or [] if entry]

    @classmethod
    def select(cls, listings: dict[str, list[dict[str, Any]]], per_season: int) -> list[CokeStudioEntry]:
        """Keeps the top `per_season` song performances by view count in every season."""
        candidates: dict[int, list[CokeStudioEntry]] = {}
        for channel_name, videos in listings.items():
            for video in videos:
                title = str(video.get('title') or '')
                season = cls.parse_season(title)
                if season is None or season not in SEASON_YEARS or not cls.is_song_performance(title, video.get('duration')):
                    continue
                song, artists = cls.parse_song_and_artists(title)
                candidates.setdefault(season, []).append(CokeStudioEntry(
                    video_id=video['id'], title=title, song=song, artists=artists, season=season,
                    year=SEASON_YEARS[season], era=cls.era_for_season(season), source_channel=channel_name,
                    view_count=int(video.get('view_count') or 0), duration_sec=int(video['duration']),
                    url=f"https://www.youtube.com/watch?v={video['id']}",
                ))
        selected: list[CokeStudioEntry] = []
        for season in sorted(candidates):
            seen_songs: set[str] = set()
            for entry in sorted(candidates[season], key=lambda e: e.view_count, reverse=True):
                if entry.song.lower() in seen_songs:
                    continue
                seen_songs.add(entry.song.lower())
                selected.append(entry)
                if len(seen_songs) == per_season:
                    break
        return selected

    @staticmethod
    def era_for_season(season: int) -> str:
        """Classic = Rohail Hyatt (S1-6), middle = Strings (S7-10), modern = S11 onward."""
        if season <= 6:
            return 'classic'
        return 'middle' if season <= 10 else 'modern'

    @staticmethod
    def parse_season(title: str) -> int | None:
        match = SEASON_PATTERN.search(title)
        if not match:
            return None
        value = int(next(group for group in match.groups() if group))
        return 13 if value == 2020 else value

    @staticmethod
    def parse_song_and_artists(title: str) -> tuple[str, str]:
        """Strips branding segments from a pipe-delimited title; the first two remaining are song, artists."""
        parts = [re.sub(SEASON_PATTERN, '', part).strip(' -|') if 'coke studio' in part.lower() else part.strip()
                 for part in title.split('|')]
        content = [part for part in parts if part and not BRANDING_PATTERN.search(part)]
        return (content[0] if content else title), (content[1] if len(content) > 1 else '')

    @staticmethod
    def is_song_performance(title: str, duration_sec: int | None) -> bool:
        if duration_sec is None or not MIN_DURATION_SEC <= duration_sec <= MAX_DURATION_SEC:
            return False
        return not EXCLUDED_TITLE_PATTERN.search(title)


def main() -> None:
    parser = argparse.ArgumentParser(description='Coke Studio Pakistan research corpus')
    commands = parser.add_subparsers(dest='command', required=True)
    select_parser = commands.add_parser('select', help='Build the manifest from official channel listings')
    select_parser.add_argument('--per-season', type=int, default=4)
    commands.add_parser('download', help='Fetch audio for every manifest entry')
    commands.add_parser('verify', help='Check every file exists and matches its checksum')
    arguments = parser.parse_args()

    if arguments.command == 'select':
        manifest = CokeStudioCatalog().build_manifest(arguments.per_season)
        manifest.save()
        for entry in manifest.entries:
            print(f'S{entry.season:>2} {entry.era:<7} {entry.view_count:>12,}  {entry.song} | {entry.artists}')
        print(f'{len(manifest.entries)} songs -> {MANIFEST_PATH}')
    elif arguments.command == 'download':
        manifest = CokeStudioManifest.load()
        failures = manifest.download()
        manifest.save()
        print('\n'.join(failures) or 'All downloads complete.')
    else:
        problems = CokeStudioManifest.load().verify()
        print('\n'.join(problems) or 'All files present and checksums match.')
        raise SystemExit(1 if problems else 0)


if __name__ == '__main__':
    main()
