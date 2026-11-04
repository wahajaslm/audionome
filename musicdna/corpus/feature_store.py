"""Per-window feature cache for the Coke Studio corpus.

Every stage uses the shared window grid (`audio.windows`) and the parameters in `Config`. Each
cached file is named after a hash of the config sections it depends on, so changing a parameter
recomputes only the stages it affects and results from different settings never mix:

  stems    Demucs vocal stem per song                   depends on audio.stem_model, vocal.sample_rate
  dsp      25-D librosa vector + RMS loudness           windows, audio
  spatial  7-D stereo image descriptors                 windows, audio, spatial
  vocal    9-D pitch descriptors + full pitch contour   windows, audio, vocal
  clap     512-D LAION-CLAP                             windows, audio
  mert     768-D MERT-v1-95M (CC BY-NC 4.0; opt-in)     windows, audio
  lyrics   Whisper transcript (optional)                audio, vocal

    python -m musicdna.corpus.feature_store --stages stems dsp spatial vocal clap
    python -m musicdna.corpus.feature_store --set windows.window_sec=10 --set windows.hop_sec=5
"""
from __future__ import annotations
import argparse
import json
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path

import numpy as np
import soundfile as sf

from musicdna.audio.io import load_audio
from musicdna.audio.windows import window_grid, window_index
from musicdna.config import DEFAULT, Config, add_config_arguments, config_from_arguments
from musicdna.corpus.coke_studio import DATA_DIRECTORY, CorpusEntry, CorpusManifest, audio_path
from musicdna.features import spatial, vocal

FEATURE_DIRECTORY = DATA_DIRECTORY / 'features'
ALL_STAGES = ('stems', 'dsp', 'spatial', 'vocal', 'clap', 'mert', 'lyrics')
PARALLEL_STAGES = ('dsp', 'spatial', 'vocal')  # torch stages run in-process, one song at a time

# Which config sections each cached artifact depends on.
DEPENDS_ON: dict[str, tuple[str, ...]] = {
    'dsp': ('windows', 'audio'), 'loudness': ('windows', 'audio'),
    'spatial': ('windows', 'audio', 'spatial'),
    'vocal': ('windows', 'audio', 'vocal'), 'pitch_contour': ('audio', 'vocal'),
    'clap': ('windows', 'audio'), 'mert': ('windows', 'audio'),
    'lyrics': ('audio', 'vocal'),
}
STAGE_OUTPUT = {'stems': 'vocals', 'dsp': 'dsp', 'spatial': 'spatial', 'vocal': 'vocal',
                'clap': 'clap', 'mert': 'mert', 'lyrics': 'lyrics'}


class FeatureStore:
    def __init__(self, config: Config = DEFAULT, root: Path = FEATURE_DIRECTORY) -> None:
        self.config = config
        self.root = root

    def path(self, video_id: str, name: str) -> Path:
        if name == 'vocals':
            return self.root / video_id / f'vocals_{self.config.audio.stem_model}_{self.config.vocal.sample_rate}.flac'
        suffix = '.json' if name == 'lyrics' else '.npy'
        return self.root / video_id / f'{name}-{self.config.section_hash(*DEPENDS_ON[name])}{suffix}'

    def has(self, video_id: str, name: str) -> bool:
        return self.path(video_id, name).exists()

    def save(self, video_id: str, name: str, values: np.ndarray) -> None:
        target = self.path(video_id, name)
        target.parent.mkdir(parents=True, exist_ok=True)
        np.save(target, np.asarray(values, dtype=np.float32))
        self._record_config(name)

    def load(self, video_id: str, name: str) -> np.ndarray:
        return np.load(self.path(video_id, name))

    def vocals(self, video_id: str) -> np.ndarray:
        audio, _ = sf.read(self.path(video_id, 'vocals'), dtype='float32')
        return audio

    def duration(self, entry: CorpusEntry) -> float:
        """Decoded length, measured once, so every stage builds the identical window grid."""
        target = self.root / entry.video_id / 'duration.json'
        if target.exists():
            return float(json.loads(target.read_text())['duration_sec'])
        rate = 8000
        seconds = len(load_audio(audio_path(entry), rate)) / rate
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(json.dumps({'duration_sec': seconds}))
        return seconds

    def grid(self, entry: CorpusEntry) -> list[tuple[float, float]]:
        return window_grid(self.duration(entry), self.config.windows)

    def window_index(self, start_sec: float) -> int:
        return window_index(start_sec, self.config.windows)

    def _record_config(self, name: str) -> None:
        """Keeps the parameters behind every hash, so a cached file can always be traced to its settings."""
        sections = DEPENDS_ON[name]
        target = self.root / 'configs' / f'{self.config.section_hash(*sections)}.json'
        if not target.exists():
            target.parent.mkdir(parents=True, exist_ok=True)
            payload = {section: self.config.to_dict()[section] for section in sections}
            target.write_text(json.dumps(payload, indent=2))


def _audio(entry: CorpusEntry, rate: int, mono: bool = True) -> np.ndarray:
    return load_audio(audio_path(entry), rate, mono=mono)


def _clips(audio: np.ndarray, rate: int, bounds: list[tuple[float, float]]) -> list[np.ndarray]:
    return [audio[..., int(start * rate): int(end * rate)] for start, end in bounds]


def run_stems(store: FeatureStore, entry: CorpusEntry) -> None:
    import librosa
    from musicdna.audio.stems import StemSeparator
    rate = store.config.audio.stereo_sr
    stereo = _audio(entry, rate, mono=False)
    # separate_demucs trims stems to len(input), so pass (samples, 2) rather than (2, samples).
    vocals = StemSeparator().separate_demucs(stereo.T, rate, model_name=store.config.audio.stem_model)['vocals']
    target = store.path(entry.video_id, 'vocals')
    target.parent.mkdir(parents=True, exist_ok=True)
    sf.write(target, librosa.resample(vocals, orig_sr=rate, target_sr=store.config.vocal.sample_rate),
             store.config.vocal.sample_rate)


def run_dsp(store: FeatureStore, entry: CorpusEntry) -> None:
    from musicdna.features.dsp import AcousticFeatureExtractor
    extractor = AcousticFeatureExtractor(store.config)
    rate = extractor.sample_rate
    vectors, loudness = [], []
    for clip in _clips(_audio(entry, rate), rate, store.grid(entry)):
        descriptors, vector = extractor.extract_window_features(clip, rate)
        vectors.append(vector)
        loudness.append([descriptors['energy']])
    store.save(entry.video_id, 'dsp', np.array(vectors))
    store.save(entry.video_id, 'loudness', np.array(loudness))


def run_spatial(store: FeatureStore, entry: CorpusEntry) -> None:
    rate = store.config.audio.stereo_sr
    clips = _clips(_audio(entry, rate, mono=False), rate, store.grid(entry))
    store.save(entry.video_id, 'spatial',
               np.array([spatial.describe_window(clip, rate, store.config.spatial).to_vector() for clip in clips]))


def run_vocal(store: FeatureStore, entry: CorpusEntry) -> None:
    settings = store.config.vocal
    if store.has(entry.video_id, 'pitch_contour'):
        contour = vocal.PitchContour.from_semitones(store.load(entry.video_id, 'pitch_contour'), settings)
    else:
        contour = vocal.track_pitch(store.vocals(entry.video_id), settings.sample_rate, settings)
        store.save(entry.video_id, 'pitch_contour', contour.semitones)
    rows = [vocal.describe_window(contour, start, end, settings).to_vector() for start, end in store.grid(entry)]
    store.save(entry.video_id, 'vocal', np.array(rows))


def run_embedding(store: FeatureStore, entry: CorpusEntry, encoder: object, name: str, allow_nc: bool) -> None:
    rate = store.config.audio.stereo_sr
    clips = _clips(_audio(entry, rate), rate, store.grid(entry))
    if name == 'clap':
        vectors = encoder.encode_clips_with_hf_clap(clips, rate)
    else:
        vectors = encoder.encode_clips_with_mert(clips, rate, allow_noncommercial=allow_nc)
    store.save(entry.video_id, name, np.array(vectors))


def run_lyrics(store: FeatureStore, entry: CorpusEntry, model: object) -> None:
    segments, info = model.transcribe(store.vocals(entry.video_id), vad_filter=True)
    payload = {'language': info.language, 'language_probability': info.language_probability,
               'segments': [{'start': s.start, 'end': s.end, 'text': s.text, 'avg_logprob': s.avg_logprob}
                            for s in segments]}
    store.path(entry.video_id, 'lyrics').write_text(json.dumps(payload, ensure_ascii=False, indent=1), encoding='utf8')
    store._record_config('lyrics')


PARALLEL_RUNNERS = {'dsp': run_dsp, 'spatial': run_spatial, 'vocal': run_vocal}


def _run_parallel_job(job: tuple[str, CorpusEntry, Config, Path]) -> str:
    stage, entry, config, root = job
    try:
        PARALLEL_RUNNERS[stage](FeatureStore(config, root), entry)
        return f'{stage:<7} S{entry.season:>2} {entry.song}'
    except Exception as error:  # noqa: BLE001 - one bad song must not stop the corpus
        return f'{stage:<7} FAILED {entry.video_id} {entry.song}: {error}'


def build(stages: list[str], store: FeatureStore, entries: list[CorpusEntry], workers: int, allow_nc: bool) -> list[str]:
    failures: list[str] = []
    for stage in stages:
        todo = [e for e in entries if e.audio_file and not store.has(e.video_id, STAGE_OUTPUT[stage])]
        if stage in ('vocal', 'lyrics'):
            todo = [e for e in todo if store.has(e.video_id, 'vocals')]
        print(f'[{stage}] {len(todo)} songs to process', flush=True)
        if not todo:
            continue

        if stage in PARALLEL_STAGES:
            with ProcessPoolExecutor(max_workers=workers) as pool:
                for line in pool.map(_run_parallel_job, [(stage, e, store.config, store.root) for e in todo]):
                    print(line, flush=True)
                    if 'FAILED' in line:
                        failures.append(line)
            continue

        if stage == 'lyrics':
            try:
                from faster_whisper import WhisperModel
            except ImportError:
                failures.append('lyrics: faster-whisper is not installed (pip install faster-whisper)')
                continue
            model: object = WhisperModel('small', compute_type='int8')
        elif stage in ('clap', 'mert'):
            from musicdna.features.embeddings import DeepAudioEncoder
            model = DeepAudioEncoder()

        for entry in todo:
            try:
                if stage == 'stems':
                    run_stems(store, entry)
                elif stage == 'lyrics':
                    run_lyrics(store, entry, model)
                else:
                    run_embedding(store, entry, model, stage, allow_nc)
                print(f'{stage:<7} S{entry.season:>2} {entry.song}', flush=True)
            except PermissionError as error:
                failures.append(f'{stage}: {error}')
                break
            except Exception as error:  # noqa: BLE001
                failures.append(f'{stage} {entry.video_id} {entry.song}: {error}')
    return failures


def coverage(store: FeatureStore, entries: list[CorpusEntry]) -> dict[str, int]:
    return {stage: sum(store.has(e.video_id, STAGE_OUTPUT[stage]) for e in entries) for stage in ALL_STAGES}


def main() -> None:
    parser = argparse.ArgumentParser(description='Compute per-window corpus features')
    parser.add_argument('--stages', nargs='+', choices=ALL_STAGES, default=['stems', 'dsp', 'spatial', 'vocal', 'clap'])
    parser.add_argument('--workers', type=int, default=4)
    parser.add_argument('--limit', type=int, default=None, help='Only the first N songs (for smoke tests)')
    parser.add_argument('--allow-nc-weights', action='store_true', help='Permit CC BY-NC weights (MERT) for research')
    add_config_arguments(parser)
    arguments = parser.parse_args()

    entries = CorpusManifest.load().entries[:arguments.limit]
    store = FeatureStore(config_from_arguments(arguments))
    failures = build(arguments.stages, store, entries, arguments.workers, arguments.allow_nc_weights)
    print(json.dumps(coverage(store, entries)))
    print('\n'.join(failures) or 'No failures.')


if __name__ == '__main__':
    main()
