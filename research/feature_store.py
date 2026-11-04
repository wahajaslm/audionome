"""Per-window feature cache for the Coke Studio corpus, aligned with research.implicit_pairs windows.

Stages run in order and skip work already on disk, so the store fills incrementally:
  stems    Demucs vocal stem per song (16 kHz FLAC), needed by `vocal` and `lyrics`
  dsp      25-D librosa vector + RMS loudness            (services.intelligence.acoustic_features)
  spatial  7-D stereo image descriptors                  (research.spatial_features)
  vocal    9-D pitch descriptors + full pitch contour     (research.vocal_pitch)
  clap     512-D LAION-CLAP                              (Apache-2.0 weights)
  mert     768-D MERT-v1-95M                             (CC BY-NC 4.0 weights; opt-in)
  lyrics   Whisper transcript segments (optional; needs faster-whisper)

    python -m research.feature_store --stages stems dsp spatial vocal clap
    python -m research.feature_store --stages mert --allow-nc-weights
"""
from __future__ import annotations
import argparse
import json
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path

import librosa
import numpy as np
import soundfile as sf

from . import spatial_features, vocal_pitch
from .coke_studio_dataset import DATA_DIRECTORY, CorpusEntry, CorpusManifest, load_audio
from .implicit_pairs import WINDOW_SEC

FEATURE_DIRECTORY = DATA_DIRECTORY / 'features'
STEREO_RATE = 44100
DSP_RATE = 22050
ALL_STAGES = ('stems', 'dsp', 'spatial', 'vocal', 'clap', 'mert', 'lyrics')
# Embedding stages are memory-heavy torch models: run them in-process, one song at a time.
PARALLEL_STAGES = ('dsp', 'spatial', 'vocal')


class FeatureStore:
    def __init__(self, root: Path = FEATURE_DIRECTORY, window_sec: float = WINDOW_SEC) -> None:
        self.root = root
        self.window_sec = window_sec

    def path(self, video_id: str, name: str, suffix: str = '.npy') -> Path:
        return self.root / video_id / f'{name}{suffix}'

    def has(self, video_id: str, name: str, suffix: str = '.npy') -> bool:
        return self.path(video_id, name, suffix).exists()

    def save(self, video_id: str, name: str, values: np.ndarray) -> None:
        target = self.path(video_id, name)
        target.parent.mkdir(parents=True, exist_ok=True)
        np.save(target, np.asarray(values, dtype=np.float32))

    def load(self, video_id: str, name: str) -> np.ndarray:
        return np.load(self.path(video_id, name))

    def window_index(self, start_sec: float) -> int:
        return int(round(start_sec / self.window_sec))

    def window_bounds(self, duration_sec: float) -> list[tuple[float, float]]:
        count = max(1, int(duration_sec // self.window_sec))
        return [(i * self.window_sec, (i + 1) * self.window_sec) for i in range(count)]

    def vocals(self, video_id: str) -> np.ndarray:
        audio, _ = sf.read(self.path(video_id, 'vocals', '.flac'), dtype='float32')
        return audio


def _clips(audio: np.ndarray, rate: int, bounds: list[tuple[float, float]]) -> list[np.ndarray]:
    return [audio[..., int(start * rate): int(end * rate)] for start, end in bounds]


def run_stems(store: FeatureStore, entry: CorpusEntry) -> None:
    from services.intelligence.stem_separation import StemSeparator
    stereo = load_audio(entry, STEREO_RATE, mono=False)
    # separate_demucs trims stems to len(input), so pass (samples, 2) rather than (2, samples).
    vocals = StemSeparator().separate_demucs(stereo.T, STEREO_RATE, model_name='htdemucs')['vocals']
    target = store.path(entry.video_id, 'vocals', '.flac')
    target.parent.mkdir(parents=True, exist_ok=True)
    sf.write(target, librosa.resample(vocals, orig_sr=STEREO_RATE, target_sr=vocal_pitch.PITCH_SAMPLE_RATE),
             vocal_pitch.PITCH_SAMPLE_RATE)


def run_dsp(store: FeatureStore, entry: CorpusEntry) -> None:
    from services.intelligence.acoustic_features import AcousticFeatureExtractor
    extractor = AcousticFeatureExtractor()
    audio = load_audio(entry, DSP_RATE)
    vectors, loudness = [], []
    for clip in _clips(audio, DSP_RATE, store.window_bounds(len(audio) / DSP_RATE)):
        descriptors, vector = extractor.extract_window_features(clip, DSP_RATE)
        vectors.append(vector)
        loudness.append([descriptors['energy']])
    store.save(entry.video_id, 'dsp', np.array(vectors))
    store.save(entry.video_id, 'loudness', np.array(loudness))


def run_spatial(store: FeatureStore, entry: CorpusEntry) -> None:
    stereo = load_audio(entry, STEREO_RATE, mono=False)
    bounds = store.window_bounds(stereo.shape[1] / STEREO_RATE)
    rows = [spatial_features.describe_window(clip, STEREO_RATE).to_vector() for clip in _clips(stereo, STEREO_RATE, bounds)]
    store.save(entry.video_id, 'spatial', np.array(rows))


def run_vocal(store: FeatureStore, entry: CorpusEntry) -> None:
    contour = vocal_pitch.track_pitch(store.vocals(entry.video_id))
    store.save(entry.video_id, 'pitch_contour', contour.semitones)
    bounds = store.window_bounds(len(contour.times) / contour.frame_rate)
    rows = [vocal_pitch.describe_window(contour, start, end).to_vector() for start, end in bounds]
    store.save(entry.video_id, 'vocal', np.array(rows))


def run_embedding(store: FeatureStore, entry: CorpusEntry, encoder: object, name: str, allow_nc: bool) -> None:
    audio = load_audio(entry, STEREO_RATE)
    clips = _clips(audio, STEREO_RATE, store.window_bounds(len(audio) / STEREO_RATE))
    if name == 'clap':
        vectors = encoder.encode_clips_with_hf_clap(clips, STEREO_RATE)
    else:
        vectors = encoder.encode_clips_with_mert(clips, STEREO_RATE, allow_noncommercial=allow_nc)
    store.save(entry.video_id, name, np.array(vectors))


def run_lyrics(store: FeatureStore, entry: CorpusEntry, model: object) -> None:
    segments, info = model.transcribe(store.vocals(entry.video_id), vad_filter=True)
    payload = {'language': info.language, 'language_probability': info.language_probability,
               'segments': [{'start': s.start, 'end': s.end, 'text': s.text, 'avg_logprob': s.avg_logprob}
                            for s in segments]}
    target = store.path(entry.video_id, 'lyrics', '.json')
    target.write_text(json.dumps(payload, ensure_ascii=False, indent=1), encoding='utf8')


STAGE_OUTPUT = {'stems': ('vocals', '.flac'), 'dsp': ('dsp', '.npy'), 'spatial': ('spatial', '.npy'),
                'vocal': ('vocal', '.npy'), 'clap': ('clap', '.npy'), 'mert': ('mert', '.npy'),
                'lyrics': ('lyrics', '.json')}
PARALLEL_RUNNERS = {'dsp': run_dsp, 'spatial': run_spatial, 'vocal': run_vocal}


def _run_parallel_job(job: tuple[str, CorpusEntry, Path]) -> str:
    stage, entry, root = job
    try:
        PARALLEL_RUNNERS[stage](FeatureStore(root), entry)
        return f'{stage:<7} S{entry.season:>2} {entry.song}'
    except Exception as error:  # noqa: BLE001 - one bad song must not stop the corpus
        return f'{stage:<7} FAILED {entry.video_id} {entry.song}: {error}'


def build(stages: list[str], store: FeatureStore, entries: list[CorpusEntry], workers: int, allow_nc: bool) -> list[str]:
    failures: list[str] = []
    for stage in stages:
        name, suffix = STAGE_OUTPUT[stage]
        todo = [e for e in entries if e.audio_file and not store.has(e.video_id, name, suffix)]
        needs_vocals = stage in ('vocal', 'lyrics')
        if needs_vocals:
            todo = [e for e in todo if store.has(e.video_id, 'vocals', '.flac')]
        print(f'[{stage}] {len(todo)} songs to process')
        if not todo:
            continue

        if stage in PARALLEL_STAGES:
            with ProcessPoolExecutor(max_workers=workers) as pool:
                for line in pool.map(_run_parallel_job, [(stage, e, store.root) for e in todo]):
                    print(line)
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
            from services.intelligence.deep_encoder import DeepAudioEncoder
            model = DeepAudioEncoder()

        for entry in todo:
            try:
                if stage == 'stems':
                    run_stems(store, entry)
                elif stage == 'lyrics':
                    run_lyrics(store, entry, model)
                else:
                    run_embedding(store, entry, model, stage, allow_nc)
                print(f'{stage:<7} S{entry.season:>2} {entry.song}')
            except PermissionError as error:
                failures.append(f'{stage}: {error}')
                break
            except Exception as error:  # noqa: BLE001
                failures.append(f'{stage} {entry.video_id} {entry.song}: {error}')
    return failures


def coverage(store: FeatureStore, entries: list[CorpusEntry]) -> dict[str, int]:
    return {stage: sum(store.has(e.video_id, *STAGE_OUTPUT[stage]) for e in entries) for stage in ALL_STAGES}


def main() -> None:
    parser = argparse.ArgumentParser(description='Compute per-window corpus features')
    parser.add_argument('--stages', nargs='+', choices=ALL_STAGES, default=['stems', 'dsp', 'spatial', 'vocal', 'clap'])
    parser.add_argument('--workers', type=int, default=4)
    parser.add_argument('--limit', type=int, default=None, help='Only the first N songs (for smoke tests)')
    parser.add_argument('--allow-nc-weights', action='store_true', help='Permit CC BY-NC weights (MERT) for research')
    arguments = parser.parse_args()

    entries = CorpusManifest.load().entries[:arguments.limit]
    store = FeatureStore()
    failures = build(arguments.stages, store, entries, arguments.workers, arguments.allow_nc_weights)
    print(json.dumps(coverage(store, entries)))
    print('\n'.join(failures) or 'No failures.')


if __name__ == '__main__':
    main()
