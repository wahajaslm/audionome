"""Coke Studio Pakistan research corpus: selection, download, and loading.

Builds a versioned manifest of the most-viewed song performances per season from the two
official channels (Rohail Hyatt for Seasons 1-6, Coke Studio Pakistan for Seasons 7 onward),
then fetches the audio locally. Audio is research-only and never committed or redistributed.

    python -m research.coke_studio_dataset select --per-season 4
    python -m research.coke_studio_dataset download
    python -m research.coke_studio_dataset verify
"""
from __future__ import annotations
import argparse
import hashlib
import json
import re
import subprocess
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import numpy as np

DATA_DIRECTORY = Path('data/coke_studio')
MANIFEST_PATH = DATA_DIRECTORY / 'manifest.json'
AUDIO_DIRECTORY = DATA_DIRECTORY / 'audio'
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


def era_for_season(season: int) -> str:
    """Classic = Rohail Hyatt (S1-6), middle = Strings (S7-10), modern = S11 onward."""
    if season <= 6:
        return 'classic'
    return 'middle' if season <= 10 else 'modern'


@dataclass
class CorpusEntry:
    video_id: str
    title: str
    song: str
    artists: str
    season: int
    year: int
    era: str
    source_channel: str
    view_count: int
    duration_sec: int
    url: str
    rights: str = 'unconfirmed'
    audio_file: str | None = None
    sha256: str | None = None


@dataclass
class CorpusManifest:
    manifest_version: int
    created_at: str
    selection: dict[str, Any]
    entries: list[CorpusEntry] = field(default_factory=list)

    def save(self, path: Path = MANIFEST_PATH) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(asdict(self), indent=2, ensure_ascii=False) + '\n', encoding='utf8')

    @classmethod
    def load(cls, path: Path = MANIFEST_PATH) -> CorpusManifest:
        raw = json.loads(path.read_text(encoding='utf8'))
        entries = [CorpusEntry(**entry) for entry in raw.pop('entries')]
        return cls(**raw, entries=entries)


def parse_season(title: str) -> int | None:
    match = SEASON_PATTERN.search(title)
    if not match:
        return None
    value = int(next(group for group in match.groups() if group))
    return 13 if value == 2020 else value


def parse_song_and_artists(title: str) -> tuple[str, str]:
    """Strips branding segments from a pipe-delimited title; the first two remaining are song, artists."""
    parts = [re.sub(SEASON_PATTERN, '', part).strip(' -|') if 'coke studio' in part.lower() else part.strip()
             for part in title.split('|')]
    content = [part for part in parts if part and not BRANDING_PATTERN.search(part)]
    song = content[0] if content else title
    artists = content[1] if len(content) > 1 else ''
    return song, artists


def is_song_performance(title: str, duration_sec: int | None) -> bool:
    if duration_sec is None or not MIN_DURATION_SEC <= duration_sec <= MAX_DURATION_SEC:
        return False
    return not EXCLUDED_TITLE_PATTERN.search(title)


def list_channel(channel_url: str) -> list[dict[str, Any]]:
    import yt_dlp
    options = {'extract_flat': 'in_playlist', 'quiet': True, 'no_warnings': True}
    with yt_dlp.YoutubeDL(options) as client:
        info = client.extract_info(channel_url, download=False)
    return [entry for entry in info.get('entries') or [] if entry]


def select_entries(listings: dict[str, list[dict[str, Any]]], per_season: int) -> list[CorpusEntry]:
    """Keeps the top `per_season` song performances by view count in every season."""
    candidates: dict[int, list[CorpusEntry]] = {}
    for channel_name, videos in listings.items():
        for video in videos:
            title = str(video.get('title') or '')
            season = parse_season(title)
            if season is None or season not in SEASON_YEARS:
                continue
            if not is_song_performance(title, video.get('duration')):
                continue
            song, artists = parse_song_and_artists(title)
            candidates.setdefault(season, []).append(CorpusEntry(
                video_id=video['id'], title=title, song=song, artists=artists, season=season,
                year=SEASON_YEARS[season], era=era_for_season(season), source_channel=channel_name,
                view_count=int(video.get('view_count') or 0), duration_sec=int(video['duration']),
                url=f"https://www.youtube.com/watch?v={video['id']}",
            ))
    selected: list[CorpusEntry] = []
    for season in sorted(candidates):
        seen_songs: set[str] = set()
        for entry in sorted(candidates[season], key=lambda e: e.view_count, reverse=True):
            key = entry.song.lower()
            if key in seen_songs:
                continue
            seen_songs.add(key)
            selected.append(entry)
            if len(seen_songs) == per_season:
                break
    return selected


def sha256_of(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open('rb') as handle:
        for block in iter(lambda: handle.read(1 << 20), b''):
            digest.update(block)
    return digest.hexdigest()


def download_audio(manifest: CorpusManifest, audio_directory: Path = AUDIO_DIRECTORY) -> list[str]:
    """Fetches the original audio stream (no re-encoding) and records its checksum. Returns failures."""
    import yt_dlp
    audio_directory.mkdir(parents=True, exist_ok=True)
    options = {
        'format': 'bestaudio[ext=m4a]/bestaudio',
        'outtmpl': str(audio_directory / '%(id)s.%(ext)s'),
        'quiet': True, 'no_warnings': True, 'noprogress': True,
    }
    failures: list[str] = []
    with yt_dlp.YoutubeDL(options) as client:
        for entry in manifest.entries:
            existing = sorted(audio_directory.glob(f'{entry.video_id}.*'))
            if not existing:
                try:
                    client.download([entry.url])
                except yt_dlp.utils.DownloadError as error:
                    failures.append(f'{entry.video_id} {entry.song}: {error}')
                    continue
                existing = sorted(audio_directory.glob(f'{entry.video_id}.*'))
            entry.audio_file = existing[0].name
            entry.sha256 = sha256_of(existing[0])
            print(f'S{entry.season:>2} {entry.song} -> {entry.audio_file}')
    return failures


def verify(manifest: CorpusManifest, audio_directory: Path = AUDIO_DIRECTORY) -> list[str]:
    problems: list[str] = []
    for entry in manifest.entries:
        if not entry.audio_file or not entry.sha256:
            problems.append(f'{entry.video_id} {entry.song}: not downloaded')
        elif not (audio_directory / entry.audio_file).exists():
            problems.append(f'{entry.video_id} {entry.song}: file missing')
        elif sha256_of(audio_directory / entry.audio_file) != entry.sha256:
            problems.append(f'{entry.video_id} {entry.song}: checksum mismatch')
    return problems


def load_audio(entry: CorpusEntry, sample_rate: int, mono: bool = True,
               audio_directory: Path = AUDIO_DIRECTORY) -> np.ndarray:
    """Decodes a corpus file with ffmpeg to float32 at `sample_rate`; shape (n,) mono or (2, n) stereo."""
    if not entry.audio_file:
        raise FileNotFoundError(f'{entry.video_id} has not been downloaded')
    channels = 1 if mono else 2
    command = ['ffmpeg', '-v', 'error', '-i', str(audio_directory / entry.audio_file),
               '-f', 'f32le', '-ac', str(channels), '-ar', str(sample_rate), '-']
    samples = np.frombuffer(subprocess.run(command, check=True, capture_output=True).stdout, dtype=np.float32)
    return samples if mono else samples.reshape(-1, 2).T


def main() -> None:
    parser = argparse.ArgumentParser(description='Coke Studio Pakistan research corpus')
    commands = parser.add_subparsers(dest='command', required=True)
    select_parser = commands.add_parser('select', help='Build the manifest from official channel listings')
    select_parser.add_argument('--per-season', type=int, default=4)
    commands.add_parser('download', help='Fetch audio for every manifest entry')
    commands.add_parser('verify', help='Check every file exists and matches its checksum')
    arguments = parser.parse_args()

    if arguments.command == 'select':
        listings = {name: list_channel(url) for name, url in SOURCE_CHANNELS.items()}
        manifest = CorpusManifest(
            manifest_version=MANIFEST_VERSION,
            created_at=datetime.now(timezone.utc).isoformat(timespec='seconds'),
            selection={'per_season': arguments.per_season, 'ranking': 'view_count at listing time',
                       'channels': SOURCE_CHANNELS, 'duration_sec': [MIN_DURATION_SEC, MAX_DURATION_SEC]},
            entries=select_entries(listings, arguments.per_season),
        )
        manifest.save()
        for entry in manifest.entries:
            print(f'S{entry.season:>2} {entry.era:<7} {entry.view_count:>12,}  {entry.song} | {entry.artists}')
        print(f'{len(manifest.entries)} songs -> {MANIFEST_PATH}')
    elif arguments.command == 'download':
        manifest = CorpusManifest.load()
        failures = download_audio(manifest)
        manifest.save()
        print('\n'.join(failures) or 'All downloads complete.')
    else:
        problems = verify(CorpusManifest.load())
        print('\n'.join(problems) or 'All files present and checksums match.')
        raise SystemExit(1 if problems else 0)


if __name__ == '__main__':
    main()
