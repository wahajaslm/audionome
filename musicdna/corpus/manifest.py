"""Generic research corpus: a versioned list of songs and the local audio files they point to.

Dataset-specific details (e.g. Coke Studio seasons) live in subclasses: a dataset defines its own
`CorpusEntry` subclass with extra fields and a `CorpusManifest` subclass that sets `entry_class`.
Code that only needs songs and audio (feature store, experiments) works with these base classes.
"""
from __future__ import annotations
import hashlib
import json
from dataclasses import asdict, dataclass, field, fields
from pathlib import Path
from typing import Any, ClassVar

from musicdna.paths import CORPUS_DIR

MANIFEST_PATH = CORPUS_DIR / 'manifest.json'
AUDIO_DIRECTORY = CORPUS_DIR / 'audio'


@dataclass(kw_only=True)
class CorpusEntry:
    """One song. `video_id` is the source's id (a YouTube video id for YouTube corpora); it also
    names the song's audio file and its feature-cache folder."""
    video_id: str
    title: str
    song: str
    artists: str
    duration_sec: int
    url: str
    rights: str = 'unconfirmed'
    audio_file: str | None = None
    sha256: str | None = None

    @property
    def label(self) -> str:
        """Short name for progress output; datasets may add context (e.g. the season)."""
        return self.song


@dataclass
class CorpusManifest:
    """The versioned song list. Subclasses set `entry_class` to their own entry type."""
    entry_class: ClassVar[type[CorpusEntry]] = CorpusEntry

    manifest_version: int
    created_at: str
    selection: dict[str, Any]
    entries: list[CorpusEntry] = field(default_factory=list)

    @classmethod
    def load(cls, path: Path = MANIFEST_PATH) -> CorpusManifest:
        """Loads entries as `entry_class`. Fields that class does not know are ignored, so generic
        code can read any dataset's manifest; only the dataset's own class should save it back."""
        raw = json.loads(path.read_text(encoding='utf8'))
        known = {f.name for f in fields(cls.entry_class)}
        entries = [cls.entry_class(**{k: v for k, v in entry.items() if k in known}) for entry in raw.pop('entries')]
        return cls(**raw, entries=entries)

    def save(self, path: Path = MANIFEST_PATH) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(asdict(self), indent=2, ensure_ascii=False) + '\n', encoding='utf8')

    def song_index(self) -> dict[str, str]:
        return {entry.song: entry.video_id for entry in self.entries}

    @staticmethod
    def audio_path(entry: CorpusEntry, audio_directory: Path = AUDIO_DIRECTORY) -> Path:
        """Local file for a corpus song; decode it with `musicdna.audio.io.load_audio`."""
        if not entry.audio_file:
            raise FileNotFoundError(f'{entry.video_id} has not been downloaded')
        return audio_directory / entry.audio_file

    def download(self, audio_directory: Path = AUDIO_DIRECTORY) -> list[str]:
        """Fetches each entry's original audio stream with yt-dlp (no re-encoding) and records its
        checksum. Returns failures."""
        import yt_dlp
        audio_directory.mkdir(parents=True, exist_ok=True)
        options = {
            'format': 'bestaudio[ext=m4a]/bestaudio',
            'outtmpl': str(audio_directory / '%(id)s.%(ext)s'),
            'quiet': True, 'no_warnings': True, 'noprogress': True,
        }
        failures: list[str] = []
        with yt_dlp.YoutubeDL(options) as client:
            for entry in self.entries:
                existing = sorted(audio_directory.glob(f'{entry.video_id}.*'))
                if not existing:
                    try:
                        client.download([entry.url])
                    except yt_dlp.utils.DownloadError as error:
                        failures.append(f'{entry.video_id} {entry.song}: {error}')
                        continue
                    existing = sorted(audio_directory.glob(f'{entry.video_id}.*'))
                entry.audio_file = existing[0].name
                entry.sha256 = self._sha256(existing[0])
                print(f'{entry.label} -> {entry.audio_file}')
        return failures

    def verify(self, audio_directory: Path = AUDIO_DIRECTORY) -> list[str]:
        problems: list[str] = []
        for entry in self.entries:
            if not entry.audio_file or not entry.sha256:
                problems.append(f'{entry.video_id} {entry.song}: not downloaded')
            elif not (audio_directory / entry.audio_file).exists():
                problems.append(f'{entry.video_id} {entry.song}: file missing')
            elif self._sha256(audio_directory / entry.audio_file) != entry.sha256:
                problems.append(f'{entry.video_id} {entry.song}: checksum mismatch')
        return problems

    @staticmethod
    def _sha256(path: Path) -> str:
        digest = hashlib.sha256()
        with path.open('rb') as handle:
            for block in iter(lambda: handle.read(1 << 20), b''):
                digest.update(block)
        return digest.hexdigest()
