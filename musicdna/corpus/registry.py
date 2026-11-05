"""Every research corpus by name, with where its manifest, audio and feature cache live.

The feature store, the pipeline and their command lines take a corpus name, so any corpus can be
processed the same way:

    python -m musicdna.corpus.feature_store --corpus genre_mix
    python -m musicdna.experiments.pipeline --corpus genre_mix --profile music-dna-profile.json

A new corpus is a `CorpusManifest` subclass plus one line in CORPORA.
"""
from __future__ import annotations
from dataclasses import dataclass
from pathlib import Path
from typing import TYPE_CHECKING

from musicdna.config import DEFAULT, Config
from musicdna.corpus.coke_studio import CokeStudioManifest
from musicdna.corpus.genre_mix import GENRE_MIX_CONFIRM_DIR, GENRE_MIX_DIR, GenreMixManifest
from musicdna.corpus.manifest import CorpusManifest
from musicdna.paths import CORPUS_DIR

if TYPE_CHECKING:
    from musicdna.corpus.feature_store import FeatureStore


@dataclass(frozen=True)
class Corpus:
    """One corpus: its manifest class and its folder (manifest.json, audio/, features/)."""
    name: str
    directory: Path
    manifest_class: type[CorpusManifest]
    module: str   # the module whose CLI selects and downloads it

    @property
    def manifest_path(self) -> Path:
        return self.directory / 'manifest.json'

    @property
    def audio_directory(self) -> Path:
        return self.directory / 'audio'

    @property
    def feature_directory(self) -> Path:
        return self.directory / 'features'

    @property
    def tonic_annotations(self) -> Path:
        return self.directory / 'tonic_annotations.json'

    def load(self) -> CorpusManifest:
        return self.manifest_class.load(self.manifest_path)

    def verify(self, manifest: CorpusManifest) -> list[str]:
        return CorpusManifest.verify(manifest, self.audio_directory)

    def feature_store(self, config: Config = DEFAULT) -> FeatureStore:
        from musicdna.corpus.feature_store import FeatureStore
        return FeatureStore(config, self.feature_directory, self.audio_directory, self.tonic_annotations)


CORPORA: dict[str, Corpus] = {c.name: c for c in (
    Corpus('coke_studio', CORPUS_DIR, CokeStudioManifest, 'musicdna.corpus.coke_studio'),
    Corpus('genre_mix', GENRE_MIX_DIR, GenreMixManifest, 'musicdna.corpus.genre_mix'),
    # Fresh songs for the one-time confirmation test: `python -m musicdna.corpus.genre_mix --confirm ...`.
    Corpus('genre_mix_confirm', GENRE_MIX_CONFIRM_DIR, GenreMixManifest, 'musicdna.corpus.genre_mix'),
)}
DEFAULT_CORPUS = 'coke_studio'


def get_corpus(name: str = DEFAULT_CORPUS) -> Corpus:
    if name not in CORPORA:
        raise KeyError(f"Unknown corpus '{name}'. Known: {', '.join(CORPORA)}")
    return CORPORA[name]
