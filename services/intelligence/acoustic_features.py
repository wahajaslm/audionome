"""Time-aligned, interpretable acoustic features and musical intelligence.

MIR extraction across 5 musical dimensions (Melody/Harmony, Rhythm/Groove,
Instrumentation/Timbre, Vocals/Expression, Arrangement/Transitions) with 4-stem decomposition.
Every window is scored deterministically. The associated recording must be authorized.
"""
from __future__ import annotations
from dataclasses import dataclass
import json
import math
from pathlib import Path
import subprocess
from typing import Any
import librosa
import numpy as np

from .stem_separation import StemSeparator, MusicalStructureAnalyzer
from .beat_tracking import BeatTracker, _DEFAULT_BEAT_TRACKER

SAMPLE_RATE: int = 22050
WINDOW_SECONDS: float = 12.0
HOP_SECONDS: float = 6.0
FEATURE_VERSION: str = 'librosa-m3-segment-v3'
DSP_REFERENCE_FILE: Path = Path(__file__).resolve().parent / 'dsp_reference.json'


def load_dsp_reference(path: Path = DSP_REFERENCE_FILE) -> tuple[np.ndarray, np.ndarray] | None:
    """Per-feature mean/std used to z-score the 25-D DSP vector, so no single feature dominates."""
    if not path.is_file():
        return None
    data = json.loads(path.read_text(encoding='utf8'))
    return np.asarray(data['mean'], dtype=np.float64), np.maximum(np.asarray(data['std'], dtype=np.float64), 1e-6)


def _compute_scalar_mean(array_values: np.ndarray) -> float:
    return float(np.mean(array_values)) if array_values.size else 0.0


@dataclass(frozen=True)
class WindowAcousticDescriptors:
    """Interpretable physical and musical descriptors extracted for a single time window."""
    energy: float
    brightness_hz: float
    onset_activity: float
    noisiness: float
    zero_crossing_rate: float
    energy_slope: float
    vocal_presence: float
    spectral_flux: float
    chroma: list[float]
    dimensions: dict[str, Any]
    key: str
    chords: list[str]
    tempo_bpm: float
    active_stems: list[str]
    top_instruments: list[str]

    def to_dict(self) -> dict[str, Any]:
        return {
            'energy': self.energy,
            'brightness_hz': self.brightness_hz,
            'onset_activity': self.onset_activity,
            'noisiness': self.noisiness,
            'zero_crossing_rate': self.zero_crossing_rate,
            'energy_slope': self.energy_slope,
            'vocal_presence': self.vocal_presence,
            'spectral_flux': self.spectral_flux,
            'chroma': self.chroma,
            'dimensions': self.dimensions,
            'key': self.key,
            'chords': self.chords,
            'tempoBpm': self.tempo_bpm,
            'activeStems': self.active_stems,
            'topInstruments': self.top_instruments,
        }


@dataclass(frozen=True)
class AudioAnalysisSegment:
    """A single time-aligned analysis window with descriptors and unit-norm embedding."""
    start_seconds: float
    end_seconds: float
    descriptors: dict[str, Any]
    embedding: list[float]

    def to_dict(self) -> dict[str, Any]:
        return {
            'startSec': self.start_seconds,
            'endSec': self.end_seconds,
            'descriptors': self.descriptors,
            'embedding': self.embedding,
        }


def load_audio_safely(
    audio_path: str | Path,
    sr: int = SAMPLE_RATE,
    offset: float = 0.0,
    duration: float | None = None
) -> tuple[np.ndarray, int]:
    """Robust audio loader using librosa with automatic ffmpeg fallback for WebM, Opus, AAC, M4A, or unrecognised formats."""
    path_str = str(audio_path)
    dur = duration if duration is not None else 600.0
    try:
        return librosa.load(path_str, sr=sr, mono=True, offset=offset, duration=dur)
    except Exception:
        cmd = ['ffmpeg', '-nostdin', '-threads', '0']
        if offset > 0:
            cmd.extend(['-ss', str(offset)])
        cmd.extend(['-i', path_str])
        if duration is not None:
            cmd.extend(['-t', str(duration)])
        cmd.extend(['-f', 'f32le', '-ac', '1', '-ar', str(sr), '-'])
        proc = subprocess.run(cmd, capture_output=True, check=True)
        waveform = np.frombuffer(proc.stdout, dtype=np.float32)
        if len(waveform) == 0:
            raise ValueError(f"ffmpeg could not decode audio from {path_str}")
        return waveform, sr


class AcousticFeatureExtractor:
    """Deterministic, time-aligned acoustic feature and DSP embedding extractor."""

    def __init__(
        self,
        sample_rate: int = SAMPLE_RATE,
        window_seconds: float = WINDOW_SECONDS,
        hop_seconds: float = HOP_SECONDS,
        model_id: str = FEATURE_VERSION,
        stem_separator: StemSeparator | None = None,
        structure_analyzer: MusicalStructureAnalyzer | None = None,
        beat_tracker: BeatTracker | None = None,
        dsp_reference: tuple[np.ndarray, np.ndarray] | None | bool = True,
    ) -> None:
        self.sample_rate = sample_rate
        self.window_seconds = window_seconds
        self.hop_seconds = hop_seconds
        self.model_id = model_id
        self.stem_separator = stem_separator or StemSeparator()
        self.structure_analyzer = structure_analyzer or MusicalStructureAnalyzer()
        self.beat_tracker = beat_tracker or _DEFAULT_BEAT_TRACKER
        # True = load the bundled reference; None/False = no z-scoring (used to compute the reference).
        self.dsp_reference = load_dsp_reference() if dsp_reference is True else (dsp_reference or None)

    def extract_window_features(
        self,
        audio_clip: np.ndarray,
        sample_rate: int,
        separated_clip_stems: dict[str, np.ndarray] | None = None,
        beat_times: np.ndarray | None = None,
    ) -> tuple[dict[str, Any], list[float]]:
        """Computes descriptors and normalized 25-D DSP embedding vector for a window."""
        rms_frames = librosa.feature.rms(y=audio_clip, frame_length=2048, hop_length=512)[0]
        rms_energy = _compute_scalar_mean(rms_frames)
        spectral_centroid = _compute_scalar_mean(librosa.feature.spectral_centroid(y=audio_clip, sr=sample_rate, hop_length=512))
        spectral_flatness = _compute_scalar_mean(librosa.feature.spectral_flatness(y=audio_clip, hop_length=512))
        zero_crossing_rate = _compute_scalar_mean(librosa.feature.zero_crossing_rate(audio_clip, hop_length=512))
        onset_strengths = librosa.onset.onset_strength(y=audio_clip, sr=sample_rate, hop_length=512)
        onset_activity = _compute_scalar_mean(onset_strengths)
        chroma_vector = np.mean(librosa.feature.chroma_stft(y=audio_clip, sr=sample_rate, hop_length=512), axis=1)
        mfcc_vector = np.mean(librosa.feature.mfcc(y=audio_clip, sr=sample_rate, n_mfcc=8, hop_length=512), axis=1)

        # 1. Energy intensification slope (crescendo)
        if rms_frames.size >= 4:
            normalized_time = np.linspace(0.0, 1.0, rms_frames.size)
            polynomial_slope = float(np.polyfit(normalized_time, rms_frames, 1)[0])
            energy_slope = polynomial_slope / max(rms_energy, 1e-4)
        else:
            energy_slope = 0.0

        # 2. Vocal presence (using vocal stem or band-pass spectral ratio)
        if separated_clip_stems and 'vocals' in separated_clip_stems:
            vocal_rms = float(np.mean(separated_clip_stems['vocals'] ** 2) ** 0.5)
            vocal_presence = float(np.clip(vocal_rms / max(rms_energy, 1e-6), 0.0, 1.0))
        else:
            spectral_magnitude = np.abs(librosa.stft(audio_clip, n_fft=2048, hop_length=512))
            fft_frequencies = librosa.fft_frequencies(sr=sample_rate, n_fft=2048)
            vocal_frequency_mask = (fft_frequencies >= 300.0) & (fft_frequencies <= 3400.0)
            total_spectral_energy = float(np.sum(spectral_magnitude)) or 1.0
            vocal_presence = float(np.sum(spectral_magnitude[vocal_frequency_mask, :])) / total_spectral_energy

        # 3. Spectral flux
        spectral_magnitude = np.abs(librosa.stft(audio_clip, n_fft=2048, hop_length=512))
        if spectral_magnitude.shape[1] >= 2:
            normalized_spectrum = spectral_magnitude / (np.linalg.norm(spectral_magnitude, axis=0, keepdims=True) + 1e-8)
            spectral_flux = float(np.mean(np.linalg.norm(np.diff(normalized_spectrum, axis=1), axis=0)))
        else:
            spectral_flux = 0.0

        # 4. Five musical dimensions
        musical_dimensions = self.structure_analyzer.analyze_dimensions(
            audio_clip, sample_rate, stems=separated_clip_stems, beat_times=beat_times
        )

        window_descriptors = WindowAcousticDescriptors(
            energy=round(float(rms_energy), 5),
            brightness_hz=round(float(spectral_centroid), 1),
            onset_activity=round(float(onset_activity), 4),
            noisiness=round(float(spectral_flatness), 4),
            zero_crossing_rate=round(float(zero_crossing_rate), 4),
            energy_slope=round(float(energy_slope), 4),
            vocal_presence=round(float(vocal_presence), 4),
            spectral_flux=round(float(spectral_flux), 4),
            chroma=[round(float(val), 4) for val in chroma_vector],
            dimensions=musical_dimensions,
            key=musical_dimensions['melodyHarmony']['key'],
            chords=musical_dimensions['melodyHarmony']['chords'],
            tempo_bpm=musical_dimensions['rhythmGroove']['tempoBpm'],
            active_stems=musical_dimensions['arrangementTransitions']['activeStems'],
            top_instruments=musical_dimensions['instrumentationTimbre']['topInstruments'],
        )

        raw_vector = [
            math.log1p(rms_energy * 30.0),
            math.log1p(spectral_centroid) / 10.0,
            math.log1p(onset_activity),
            spectral_flatness,
            zero_crossing_rate * 3.0,
            *[float(x) for x in chroma_vector],
            *[float(x) / 120.0 for x in mfcc_vector]
        ]
        sanitized_vector = np.nan_to_num(np.array(raw_vector, dtype=np.float64), nan=0.0, posinf=0.0, neginf=0.0)
        self.last_raw_vector = sanitized_vector
        if self.dsp_reference is not None:
            reference_mean, reference_std = self.dsp_reference
            sanitized_vector = (sanitized_vector - reference_mean) / reference_std
        vector_norm = float(np.linalg.norm(sanitized_vector))
        normalized_embedding = (
            [round(float(v / vector_norm), 7) for v in sanitized_vector]
            if vector_norm else [0.0] * len(sanitized_vector)
        )

        return window_descriptors.to_dict(), normalized_embedding

    def extract_from_waveform(
        self,
        audio_waveform: np.ndarray,
        sample_rate: int,
        start_offset: float = 0.0,
        separated_stems: dict[str, np.ndarray] | None = None,
        separate_stems_flag: bool = True,
        track_identifier: str | None = None,
    ) -> dict[str, Any]:
        """Performs feature extraction and window analysis directly on an in-memory waveform."""
        if not len(audio_waveform):
            raise ValueError('No decodable samples')
        duration_seconds = len(audio_waveform) / sample_rate
        if duration_seconds < 1.0:
            raise ValueError('Recording must be at least one second')

        if separated_stems is None and separate_stems_flag:
            separated_stems = self.stem_separator.separate(audio_waveform, sample_rate)
            if track_identifier:
                self.stem_separator.save_stems_to_cache(track_identifier, separated_stems, sample_rate)

        rhythm = self.beat_tracker.track(audio_waveform, sample_rate)
        beat_grid = np.asarray(rhythm['beats'], dtype=np.float64)

        analysis_segments: list[AudioAnalysisSegment] = []
        window_start_times = np.arange(0.0, duration_seconds, self.hop_seconds)
        for start_time in window_start_times:
            end_time = min(duration_seconds, float(start_time) + self.window_seconds)
            clip_waveform = audio_waveform[int(start_time * sample_rate):int(end_time * sample_rate)]
            if len(clip_waveform) < int(0.5 * sample_rate):
                continue
            clip_stems = None
            if separated_stems:
                clip_stems = {
                    name: stem_waveform[int(start_time * sample_rate):int(end_time * sample_rate)]
                    for name, stem_waveform in separated_stems.items()
                }
            window_beats = beat_grid[(beat_grid >= start_time) & (beat_grid < end_time)] - start_time
            descriptors_dict, embedding_vector = self.extract_window_features(
                clip_waveform, sample_rate, separated_clip_stems=clip_stems, beat_times=window_beats
            )
            analysis_segments.append(AudioAnalysisSegment(
                start_seconds=round(float(start_offset + start_time), 3),
                end_seconds=round(float(start_offset + end_time), 3),
                descriptors=descriptors_dict,
                embedding=embedding_vector,
            ))

        if not analysis_segments:
            raise ValueError('No usable windows extracted')

        track_dimensions = self.structure_analyzer.analyze_dimensions(
            audio_waveform, sample_rate, stems=separated_stems, beat_times=beat_grid
        )

        return {
            'method': 'dsp',
            'modelId': self.model_id,
            'durationSec': round(duration_seconds, 3),
            'startOffsetSec': round(float(start_offset), 3),
            'hopSec': self.hop_seconds,
            'windowSec': self.window_seconds,
            'segments': [segment.to_dict() for segment in analysis_segments],
            'musicalDimensions': track_dimensions,
            'stemsAvailable': ['vocals', 'drums', 'bass', 'other'] if separated_stems else [],
            'rhythm': {
                **rhythm,
                'beats': [round(b + start_offset, 3) for b in rhythm['beats']],
                'downbeats': [round(b + start_offset, 3) for b in rhythm['downbeats']],
            },
        }

    def extract_track_analysis(
        self,
        audio_path: str | Path,
        track_identifier: str | None = None,
        separate_stems_flag: bool = True,
        start_offset: float = 0.0,
        duration: float | None = None,
    ) -> dict[str, Any]:
        """Loads recording, performs stem decomposition, and extracts overlapping window features."""
        dur = duration if duration is not None else 600.0
        audio_waveform, sample_rate = load_audio_safely(
            str(audio_path), sr=self.sample_rate, offset=start_offset, duration=dur
        )
        return self.extract_from_waveform(
            audio_waveform=audio_waveform,
            sample_rate=sample_rate,
            start_offset=start_offset,
            separated_stems=None,
            separate_stems_flag=separate_stems_flag,
            track_identifier=track_identifier,
        )


def compute_dsp_reference(audio_paths: list[str | Path], out_path: Path = DSP_REFERENCE_FILE) -> dict[str, Any]:
    """Measures per-feature mean/std of the raw DSP vector over every window of the given recordings."""
    extractor = AcousticFeatureExtractor(dsp_reference=None)
    raw_rows: list[np.ndarray] = []
    for audio_path in audio_paths:
        waveform, sample_rate = load_audio_safely(str(audio_path), sr=extractor.sample_rate, duration=600.0)
        for start_time in np.arange(0.0, len(waveform) / sample_rate, extractor.hop_seconds):
            clip = waveform[int(start_time * sample_rate):int((start_time + extractor.window_seconds) * sample_rate)]
            if len(clip) < int(0.5 * sample_rate):
                continue
            extractor.extract_window_features(clip, sample_rate)
            raw_rows.append(extractor.last_raw_vector)
    matrix = np.stack(raw_rows)
    reference = {
        'featureVersion': FEATURE_VERSION,
        'windows': int(matrix.shape[0]),
        'recordings': [Path(path).name for path in audio_paths],
        'mean': [round(float(x), 6) for x in matrix.mean(axis=0)],
        'std': [round(float(x), 6) for x in matrix.std(axis=0)],
    }
    out_path.write_text(json.dumps(reference, indent=2), encoding='utf8')
    return reference


def analyze_track(audio_path: str | Path, separate_stems_flag: bool = True) -> dict[str, Any]:
    """Top-level functional interface for AcousticFeatureExtractor.extract_track_analysis."""
    return AcousticFeatureExtractor().extract_track_analysis(audio_path, separate_stems_flag=separate_stems_flag)


__all__ = [
    'SAMPLE_RATE',
    'WINDOW_SECONDS',
    'HOP_SECONDS',
    'FEATURE_VERSION',
    'DSP_REFERENCE_FILE',
    'load_dsp_reference',
    'compute_dsp_reference',
    'WindowAcousticDescriptors',
    'AudioAnalysisSegment',
    'AcousticFeatureExtractor',
    'analyze_track',
]


if __name__ == '__main__':
    import argparse
    parser = argparse.ArgumentParser(description='Recompute the DSP z-score reference from authorized recordings')
    parser.add_argument('audio', nargs='+', type=Path)
    result = compute_dsp_reference(parser.parse_args().audio)
    print(f"Wrote {DSP_REFERENCE_FILE} from {result['windows']} windows")
