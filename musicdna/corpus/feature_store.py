"""Per-window feature cache for the Coke Studio corpus.

Each `FeatureStage` declares the artifacts it writes and the config sections they depend on. Cached
files are named after a hash of those sections, so changing a parameter recomputes only the stages
it affects and results from different settings never mix. All stages share `WindowGrid`.

    python -m musicdna.corpus.feature_store --stages stems dsp spatial vocal clap
    python -m musicdna.corpus.feature_store --set windows.window_sec=10 --set windows.hop_sec=5
"""
from __future__ import annotations
import argparse
import json
from abc import ABC, abstractmethod
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path
from typing import Any, ClassVar

import numpy as np
import soundfile as sf

from musicdna.audio.io import load_audio
from musicdna.audio.windows import WindowGrid
from musicdna.config import DEFAULT, Config
from musicdna.corpus.coke_studio import DATA_DIRECTORY, CorpusEntry, CorpusManifest
from musicdna.features.spatial import SpatialAnalyzer
from musicdna.features.vocal import PitchContour, VocalPitchAnalyzer

FEATURE_DIRECTORY = DATA_DIRECTORY / 'features'


class FeatureStore:
    """Where cached artifacts live, named by the config sections each depends on."""

    def __init__(self, config: Config = DEFAULT, root: Path = FEATURE_DIRECTORY) -> None:
        self.config = config
        self.root = root
        self.grid = WindowGrid(config.windows)

    def path(self, video_id: str, artifact: str) -> Path:
        if artifact == 'vocals':
            return self.root / video_id / f'vocals_{self.config.audio.stem_model}_{self.config.vocal.sample_rate}.flac'
        suffix = '.json' if artifact == 'lyrics' else '.npy'
        return self.root / video_id / f'{artifact}-{self.config.section_hash(*ARTIFACT_SECTIONS[artifact])}{suffix}'

    def has(self, video_id: str, artifact: str) -> bool:
        return self.path(video_id, artifact).exists()

    def save(self, video_id: str, artifact: str, values: np.ndarray) -> None:
        target = self.path(video_id, artifact)
        target.parent.mkdir(parents=True, exist_ok=True)
        np.save(target, np.asarray(values, dtype=np.float32))
        self.record_config(artifact)

    def save_json(self, video_id: str, artifact: str, payload: dict[str, Any]) -> None:
        self.path(video_id, artifact).write_text(json.dumps(payload, ensure_ascii=False, indent=1), encoding='utf8')
        self.record_config(artifact)

    def load(self, video_id: str, artifact: str) -> np.ndarray:
        return np.load(self.path(video_id, artifact))

    def vocals(self, video_id: str) -> np.ndarray:
        audio, _ = sf.read(self.path(video_id, 'vocals'), dtype='float32')
        return audio

    def audio(self, entry: CorpusEntry, rate: int, mono: bool = True) -> np.ndarray:
        return load_audio(CorpusManifest.audio_path(entry), rate, mono=mono)

    def duration(self, entry: CorpusEntry) -> float:
        """Decoded length, measured once, so every stage builds the identical window grid."""
        target = self.root / entry.video_id / 'duration.json'
        if target.exists():
            return float(json.loads(target.read_text())['duration_sec'])
        rate = 8000
        seconds = len(self.audio(entry, rate)) / rate
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(json.dumps({'duration_sec': seconds}))
        return seconds

    def windows(self, entry: CorpusEntry) -> list[tuple[float, float]]:
        return self.grid.windows(self.duration(entry))

    def context_clips(self, entry: CorpusEntry, rate: int, mono: bool = True, preroll_sec: float | None = None,
                      postroll_sec: float | None = None) -> list[tuple[np.ndarray, tuple[float, float]]]:
        """Each window's audio widened by pre/post-roll, with the window's (start, end) inside the clip.

        Defaults come from windows.preroll_sec / postroll_sec. Example: window 12-24 s with 1 s / 1 s
        -> clip covering 11-25 s and core (1.0, 13.0). Pass 0 / 0 for the bare window.
        """
        audio = self.audio(entry, rate, mono)
        duration = audio.shape[-1] / rate
        clips = []
        for start, end in self.windows(entry):
            context_start, context_end = self.grid.context_span(start, end, duration, preroll_sec, postroll_sec)
            clip = audio[..., int(context_start * rate): int(context_end * rate)]
            clips.append((clip, (start - context_start, end - context_start)))
        return clips

    def window_index(self, start_sec: float) -> int:
        return self.grid.index(start_sec)

    def record_config(self, artifact: str) -> None:
        """Keeps the parameters behind every hash, so a cached file can always be traced to its settings."""
        sections = ARTIFACT_SECTIONS[artifact]
        target = self.root / 'configs' / f'{self.config.section_hash(*sections)}.json'
        if not target.exists():
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text(json.dumps({s: self.config.to_dict()[s] for s in sections}, indent=2))


class FeatureStage(ABC):
    """One step of the corpus build. Subclasses declare what they write and what it depends on."""

    name: ClassVar[str]
    artifacts: ClassVar[dict[str, tuple[str, ...]]]  # artifact -> config sections it depends on
    needs_vocals: ClassVar[bool] = False
    parallel: ClassVar[bool] = False                 # CPU-only stages run in a process pool

    @property
    def output(self) -> str:
        return next(iter(self.artifacts))

    def prepare(self, store: FeatureStore, allow_nc_weights: bool) -> None:
        """Loads models once before the songs are processed."""

    @abstractmethod
    def run(self, store: FeatureStore, entry: CorpusEntry) -> None: ...

    def is_done(self, store: FeatureStore, entry: CorpusEntry) -> bool:
        return store.has(entry.video_id, self.output)

    def is_ready(self, store: FeatureStore, entry: CorpusEntry) -> bool:
        return bool(entry.audio_file) and (not self.needs_vocals or store.has(entry.video_id, 'vocals'))


class StemStage(FeatureStage):
    """Demucs vocal stem at the pitch-tracking sample rate."""
    name = 'stems'
    artifacts = {'vocals': ('audio', 'vocal')}

    def run(self, store: FeatureStore, entry: CorpusEntry) -> None:
        import librosa
        from musicdna.audio.stems import StemSeparator
        rate = store.config.audio.stereo_sr
        stereo = store.audio(entry, rate, mono=False)
        # separate_demucs trims stems to len(input), so pass (samples, 2) rather than (2, samples).
        vocals = StemSeparator().separate_demucs(stereo.T, rate, model_name=store.config.audio.stem_model)['vocals']
        target = store.path(entry.video_id, 'vocals')
        target.parent.mkdir(parents=True, exist_ok=True)
        sf.write(target, librosa.resample(vocals, orig_sr=rate, target_sr=store.config.vocal.sample_rate),
                 store.config.vocal.sample_rate)


class DspStage(FeatureStage):
    """25-D librosa vector and RMS loudness per window."""
    name = 'dsp'
    artifacts = {'dsp': ('windows', 'audio'), 'loudness': ('windows', 'audio')}
    parallel = True

    def run(self, store: FeatureStore, entry: CorpusEntry) -> None:
        from musicdna.features.dsp import AcousticFeatureExtractor
        extractor = AcousticFeatureExtractor(store.config)
        vectors, loudness = [], []
        for clip, core in store.context_clips(entry, extractor.sample_rate):
            descriptors, vector = extractor.extract_window_features(clip, extractor.sample_rate, core=core)
            vectors.append(vector)
            loudness.append([descriptors['energy']])
        store.save(entry.video_id, 'dsp', np.array(vectors))
        store.save(entry.video_id, 'loudness', np.array(loudness))


class SpatialStage(FeatureStage):
    """7-D stereo image descriptors per window."""
    name = 'spatial'
    artifacts = {'spatial': ('windows', 'audio', 'spatial')}
    parallel = True

    def run(self, store: FeatureStore, entry: CorpusEntry) -> None:
        analyzer = SpatialAnalyzer(store.config.spatial)
        rate = store.config.audio.stereo_sr
        rows = [analyzer.describe(clip, rate, core).to_vector() for clip, core in store.context_clips(entry, rate, mono=False)]
        store.save(entry.video_id, 'spatial', np.array(rows))


class VocalStage(FeatureStage):
    """9-D pitch descriptors per window; the full contour is cached and reused across window settings."""
    name = 'vocal'
    artifacts = {'vocal': ('windows', 'audio', 'vocal'), 'pitch_contour': ('audio', 'vocal')}
    needs_vocals = True
    parallel = True

    def run(self, store: FeatureStore, entry: CorpusEntry) -> None:
        analyzer = VocalPitchAnalyzer(store.config.vocal)
        if store.has(entry.video_id, 'pitch_contour'):
            contour = PitchContour.from_semitones(store.load(entry.video_id, 'pitch_contour'), store.config.vocal)
        else:
            contour = analyzer.track(store.vocals(entry.video_id), store.config.vocal.sample_rate)
            store.save(entry.video_id, 'pitch_contour', contour.semitones)
        rows = [analyzer.describe(contour, start, end).to_vector() for start, end in store.windows(entry)]
        store.save(entry.video_id, 'vocal', np.array(rows))


class EmbeddingStage(FeatureStage):
    """Neural audio embedding per window."""
    allow_nc_weights = False

    def prepare(self, store: FeatureStore, allow_nc_weights: bool) -> None:
        from musicdna.features.embeddings import DeepAudioEncoder
        self.encoder = DeepAudioEncoder()
        self.allow_nc_weights = allow_nc_weights

    def run(self, store: FeatureStore, entry: CorpusEntry) -> None:
        # Embeddings see the whole clip (models take no core span), so their context is a separate
        # setting, windows.embedding_context_sec (default 0 = window only). Example: 2.0 gives each
        # 12 s window 16 s of audio; neighbouring windows then share audio, so R01 should compare.
        rate = store.config.audio.stereo_sr
        context = store.config.windows.embedding_context_sec
        clips = [clip for clip, _ in store.context_clips(entry, rate, preroll_sec=context, postroll_sec=context)]
        store.save(entry.video_id, self.name, np.array(self.encode(clips, rate)))

    @abstractmethod
    def encode(self, clips: list[np.ndarray], rate: int) -> list[np.ndarray]: ...


class ClapStage(EmbeddingStage):
    """512-D LAION-CLAP (Apache-2.0 weights)."""
    name = 'clap'
    artifacts = {'clap': ('windows', 'audio')}

    def encode(self, clips: list[np.ndarray], rate: int) -> list[np.ndarray]:
        return self.encoder.encode_clips_with_hf_clap(clips, rate)


class MertStage(EmbeddingStage):
    """768-D MERT-v1-95M (CC BY-NC 4.0 weights; needs --allow-nc-weights)."""
    name = 'mert'
    artifacts = {'mert': ('windows', 'audio')}

    def encode(self, clips: list[np.ndarray], rate: int) -> list[np.ndarray]:
        return self.encoder.encode_clips_with_mert(clips, rate, allow_noncommercial=self.allow_nc_weights)


class LyricsStage(FeatureStage):
    """Whisper transcript of the vocal stem (needs faster-whisper)."""
    name = 'lyrics'
    artifacts = {'lyrics': ('audio', 'vocal')}
    needs_vocals = True

    def prepare(self, store: FeatureStore, allow_nc_weights: bool) -> None:
        from faster_whisper import WhisperModel
        self.model = WhisperModel('small', compute_type='int8')

    def run(self, store: FeatureStore, entry: CorpusEntry) -> None:
        segments, info = self.model.transcribe(store.vocals(entry.video_id), vad_filter=True)
        store.save_json(entry.video_id, 'lyrics', {
            'language': info.language, 'language_probability': info.language_probability,
            'segments': [{'start': s.start, 'end': s.end, 'text': s.text, 'avg_logprob': s.avg_logprob} for s in segments],
        })


STAGES: dict[str, FeatureStage] = {stage.name: stage for stage in (
    StemStage(), DspStage(), SpatialStage(), VocalStage(), ClapStage(), MertStage(), LyricsStage())}
ARTIFACT_SECTIONS: dict[str, tuple[str, ...]] = {
    artifact: sections for stage in STAGES.values() for artifact, sections in stage.artifacts.items()}
DEFAULT_STAGES = ['stems', 'dsp', 'spatial', 'vocal', 'clap']


def _run_in_worker(job: tuple[str, CorpusEntry, Config, Path]) -> str:
    stage_name, entry, config, root = job
    try:
        STAGES[stage_name].run(FeatureStore(config, root), entry)
        return f'{stage_name:<7} S{entry.season:>2} {entry.song}'
    except Exception as error:  # noqa: BLE001 - one bad song must not stop the corpus
        return f'{stage_name:<7} FAILED {entry.video_id} {entry.song}: {error}'


class FeatureBuilder:
    """Runs stages over corpus songs, skipping work already cached for the current config."""

    def __init__(self, store: FeatureStore, workers: int = 4, allow_nc_weights: bool = False) -> None:
        self.store = store
        self.workers = workers
        self.allow_nc_weights = allow_nc_weights

    def build(self, stage_names: list[str], entries: list[CorpusEntry]) -> list[str]:
        failures: list[str] = []
        for name in stage_names:
            stage = STAGES[name]
            todo = [e for e in entries if stage.is_ready(self.store, e) and not stage.is_done(self.store, e)]
            print(f'[{name}] {len(todo)} songs to process', flush=True)
            if todo:
                failures += self._run_parallel(stage, todo) if stage.parallel else self._run_serial(stage, todo)
        return failures

    def coverage(self, entries: list[CorpusEntry]) -> dict[str, int]:
        return {name: sum(stage.is_done(self.store, e) for e in entries) for name, stage in STAGES.items()}

    def _run_parallel(self, stage: FeatureStage, todo: list[CorpusEntry]) -> list[str]:
        failures = []
        with ProcessPoolExecutor(max_workers=self.workers) as pool:
            for line in pool.map(_run_in_worker, [(stage.name, e, self.store.config, self.store.root) for e in todo]):
                print(line, flush=True)
                if 'FAILED' in line:
                    failures.append(line)
        return failures

    def _run_serial(self, stage: FeatureStage, todo: list[CorpusEntry]) -> list[str]:
        try:
            stage.prepare(self.store, self.allow_nc_weights)
        except (ImportError, PermissionError) as error:
            return [f'{stage.name}: {error}']
        failures = []
        for entry in todo:
            try:
                stage.run(self.store, entry)
                print(f'{stage.name:<7} S{entry.season:>2} {entry.song}', flush=True)
            except PermissionError as error:
                return failures + [f'{stage.name}: {error}']
            except Exception as error:  # noqa: BLE001
                failures.append(f'{stage.name} {entry.video_id} {entry.song}: {error}')
        return failures


def main() -> None:
    parser = argparse.ArgumentParser(description='Compute per-window corpus features')
    parser.add_argument('--stages', nargs='+', choices=list(STAGES), default=DEFAULT_STAGES)
    parser.add_argument('--workers', type=int, default=4)
    parser.add_argument('--limit', type=int, default=None, help='Only the first N songs (for smoke tests)')
    parser.add_argument('--allow-nc-weights', action='store_true', help='Permit CC BY-NC weights (MERT) for research')
    Config.add_arguments(parser)
    arguments = parser.parse_args()

    entries = CorpusManifest.load().entries[:arguments.limit]
    builder = FeatureBuilder(FeatureStore(Config.from_arguments(arguments)), arguments.workers, arguments.allow_nc_weights)
    failures = builder.build(arguments.stages, entries)
    print(json.dumps(builder.coverage(entries)))
    print('\n'.join(failures) or 'No failures.')


if __name__ == '__main__':
    main()
