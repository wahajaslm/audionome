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
from typing import Any
import librosa
import numpy as np

from musicdna.audio.beats import BeatTracker, _DEFAULT_BEAT_TRACKER
from musicdna.audio.io import load_audio
from musicdna.audio.stems import StemSeparator
from musicdna.audio.windows import WindowGrid
from musicdna.config import DEFAULT, Config
from musicdna.features.structure import MusicalStructureAnalyzer
from musicdna.features.vocal import PitchContour, VocalDescriptors, VocalPitchAnalyzer

# Defaults, kept for callers that only need the numbers. Pass a Config to change them.
SAMPLE_RATE: int = DEFAULT.audio.analysis_sr
WINDOW_SECONDS: float = DEFAULT.windows.window_sec
HOP_SECONDS: float = DEFAULT.windows.hop_sec
# v4: pre/post-roll context (windows.preroll_sec / postroll_sec); v3 values are not comparable.
FEATURE_VERSION: str = 'librosa-m3-segment-v4'
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


class AcousticFeatureExtractor:
    """Deterministic, time-aligned acoustic feature and DSP embedding extractor."""

    def __init__(
        self,
        config: Config = DEFAULT,
        model_id: str = FEATURE_VERSION,
        stem_separator: StemSeparator | None = None,
        structure_analyzer: MusicalStructureAnalyzer | None = None,
        beat_tracker: BeatTracker | None = None,
        dsp_reference: tuple[np.ndarray, np.ndarray] | None | bool = True,
    ) -> None:
        self.config = config
        self.grid = WindowGrid(config.windows)
        self.vocal_analyzer = VocalPitchAnalyzer(config.vocal)
        self.sample_rate = config.audio.analysis_sr
        self.window_seconds = config.windows.window_sec
        self.hop_seconds = config.windows.hop_sec
        self.model_id = model_id
        self.stem_separator = stem_separator or StemSeparator()
        self.structure_analyzer = structure_analyzer or MusicalStructureAnalyzer()
        self.beat_tracker = beat_tracker or _DEFAULT_BEAT_TRACKER
        # True = load the bundled reference; None/False = no z-scoring (used to compute the reference).
        self.dsp_reference = load_dsp_reference() if dsp_reference is True else (dsp_reference or None)

    def context_clip(self, waveform: np.ndarray, sample_rate: int, start_sec: float,
                     end_sec: float) -> tuple[np.ndarray, tuple[float, float]]:
        """The window plus pre/post-roll, and where the window sits inside it (pass as `core`).

        Example: window 12-24 s with 1 s / 1 s roll -> clip of 11-25 s, core = (1.0, 13.0).
        """
        duration = len(waveform) / sample_rate
        context_start, context_end = self.grid.context_span(start_sec, end_sec, duration)
        clip = waveform[int(context_start * sample_rate):int(context_end * sample_rate)]
        return clip, (start_sec - context_start, end_sec - context_start)

    def extract_window_features(
        self,
        audio_clip: np.ndarray,
        sample_rate: int,
        separated_clip_stems: dict[str, np.ndarray] | None = None,
        beat_times: np.ndarray | None = None,
        vocal_pitch: VocalDescriptors | None = None,
        core: tuple[float, float] | None = None,
    ) -> tuple[dict[str, Any], list[float]]:
        """Computes descriptors and normalized 25-D DSP embedding vector for a window.

        core: (start, end) in seconds *within audio_clip* of the window being described. When the
        clip includes pre/post-roll (see `WindowGrid.context_span`), every frame-level feature is
        computed on the whole clip and then averaged over the core frames only.

        Why: features such as onset strength and spectral flux compare each frame with the one
        before it. A clip that starts in the middle of a held note has no "before", so its first
        frames look like a sudden new sound.
        Example: a steady tone across 0-30 s, window 12-24 s. Without pre-roll the window starts
        with a false onset at 12.0 s; with 1 s of pre-roll the analysis hears 11-12 s, sees the
        tone was already sounding, and reports no onset. The values still describe only 12-24 s.
        Stems, structure and beats stay on the core span (they have their own track-level context).
        """
        hop = 512
        core_start, core_end = core if core is not None else (0.0, len(audio_clip) / sample_rate)
        core_clip = audio_clip[int(core_start * sample_rate):int(core_end * sample_rate)]

        def frame_mask(n_frames: int) -> np.ndarray:
            """Frames whose centre lies inside the core span (librosa frames are centred)."""
            centres = librosa.frames_to_time(np.arange(n_frames), sr=sample_rate, hop_length=hop)
            mask = (centres >= core_start) & (centres < core_end)
            return mask if mask.any() else np.ones(n_frames, dtype=bool)

        def core_mean(frames: np.ndarray) -> float:
            """Mean of a (n_frames,) or (n, n_frames) feature over core frames only."""
            values = frames[..., frame_mask(frames.shape[-1])]
            return _compute_scalar_mean(values)

        rms_all = librosa.feature.rms(y=audio_clip, frame_length=2048, hop_length=hop)[0]
        rms_frames = rms_all[frame_mask(rms_all.size)]
        rms_energy = _compute_scalar_mean(rms_frames)
        spectral_centroid = core_mean(librosa.feature.spectral_centroid(y=audio_clip, sr=sample_rate, hop_length=hop)[0])
        spectral_flatness = core_mean(librosa.feature.spectral_flatness(y=audio_clip, hop_length=hop)[0])
        zero_crossing_rate = core_mean(librosa.feature.zero_crossing_rate(audio_clip, hop_length=hop)[0])
        onset_activity = core_mean(librosa.onset.onset_strength(y=audio_clip, sr=sample_rate, hop_length=hop))
        chroma_all = librosa.feature.chroma_stft(y=audio_clip, sr=sample_rate, hop_length=hop)
        chroma_vector = np.mean(chroma_all[:, frame_mask(chroma_all.shape[1])], axis=1)
        mfcc_all = librosa.feature.mfcc(y=audio_clip, sr=sample_rate, n_mfcc=8, hop_length=hop)
        mfcc_vector = np.mean(mfcc_all[:, frame_mask(mfcc_all.shape[1])], axis=1)

        # 1. Energy intensification slope (crescendo), over the core frames
        if rms_frames.size >= 4:
            normalized_time = np.linspace(0.0, 1.0, rms_frames.size)
            polynomial_slope = float(np.polyfit(normalized_time, rms_frames, 1)[0])
            energy_slope = polynomial_slope / max(rms_energy, 1e-4)
        else:
            energy_slope = 0.0

        # 2. Vocal presence (using vocal stem or band-pass spectral ratio), over the core span
        spectral_magnitude = np.abs(librosa.stft(audio_clip, n_fft=2048, hop_length=hop))
        core_magnitude = spectral_magnitude[:, frame_mask(spectral_magnitude.shape[1])]
        if separated_clip_stems and 'vocals' in separated_clip_stems:
            vocal_rms = float(np.mean(separated_clip_stems['vocals'] ** 2) ** 0.5)
            vocal_presence = float(np.clip(vocal_rms / max(rms_energy, 1e-6), 0.0, 1.0))
        else:
            fft_frequencies = librosa.fft_frequencies(sr=sample_rate, n_fft=2048)
            vocal_frequency_mask = (fft_frequencies >= 300.0) & (fft_frequencies <= 3400.0)
            total_spectral_energy = float(np.sum(core_magnitude)) or 1.0
            vocal_presence = float(np.sum(core_magnitude[vocal_frequency_mask, :])) / total_spectral_energy

        # 3. Spectral flux: change from each frame to the next, kept where the later frame is in the core.
        # With pre-roll, the first core frame is compared with real audio before the window.
        if spectral_magnitude.shape[1] >= 2:
            normalized_spectrum = spectral_magnitude / (np.linalg.norm(spectral_magnitude, axis=0, keepdims=True) + 1e-8)
            flux_frames = np.linalg.norm(np.diff(normalized_spectrum, axis=1), axis=0)
            spectral_flux = _compute_scalar_mean(flux_frames[frame_mask(spectral_magnitude.shape[1])[1:]])
        else:
            spectral_flux = 0.0

        # 4. Five musical dimensions (core span; stems and beats are already sliced to it)
        musical_dimensions = self.structure_analyzer.analyze_dimensions(
            core_clip, sample_rate, stems=separated_clip_stems, beat_times=beat_times, vocal_pitch=vocal_pitch
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
        pitch_contour: PitchContour | None = None,
    ) -> dict[str, Any]:
        """Performs feature extraction and window analysis directly on an in-memory waveform.

        pitch_contour: from `VocalPitchAnalyzer.track` on a real vocal stem. Without it, windows
        report no vocal pitch rather than an estimate from the mix.
        """
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
        for start_time, end_time in self.grid.windows(duration_seconds):
            clip_waveform, core = self.context_clip(audio_waveform, sample_rate, start_time, end_time)
            clip_stems = None
            if separated_stems:
                clip_stems = {
                    name: stem_waveform[int(start_time * sample_rate):int(end_time * sample_rate)]
                    for name, stem_waveform in separated_stems.items()
                }
            window_beats = beat_grid[(beat_grid >= start_time) & (beat_grid < end_time)] - start_time
            window_pitch = (self.vocal_analyzer.describe(pitch_contour, start_time, end_time)
                            if pitch_contour is not None else None)
            descriptors_dict, embedding_vector = self.extract_window_features(
                clip_waveform, sample_rate, separated_clip_stems=clip_stems, beat_times=window_beats,
                vocal_pitch=window_pitch, core=core,
            )
            analysis_segments.append(AudioAnalysisSegment(
                start_seconds=round(float(start_offset + start_time), 3),
                end_seconds=round(float(start_offset + end_time), 3),
                descriptors=descriptors_dict,
                embedding=embedding_vector,
            ))

        if not analysis_segments:
            raise ValueError('No usable windows extracted')

        track_pitch = (self.vocal_analyzer.describe(pitch_contour, 0.0, duration_seconds)
                       if pitch_contour is not None else None)
        track_dimensions = self.structure_analyzer.analyze_dimensions(
            audio_waveform, sample_rate, stems=separated_stems, beat_times=beat_grid, vocal_pitch=track_pitch
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
        audio_waveform = load_audio(
            audio_path, self.sample_rate, offset_sec=start_offset,
            duration_sec=duration if duration is not None else self.config.audio.max_duration_sec,
        )
        return self.extract_from_waveform(
            audio_waveform=audio_waveform,
            sample_rate=self.sample_rate,
            start_offset=start_offset,
            separated_stems=None,
            separate_stems_flag=separate_stems_flag,
            track_identifier=track_identifier,
        )


def compute_dsp_reference(audio_paths: list[str | Path], out_path: Path = DSP_REFERENCE_FILE,
                          config: Config = DEFAULT) -> dict[str, Any]:
    """Measures per-feature mean/std of the raw DSP vector over every window of the given recordings."""
    extractor = AcousticFeatureExtractor(config, dsp_reference=None)
    sample_rate = extractor.sample_rate
    raw_rows: list[np.ndarray] = []
    for audio_path in audio_paths:
        waveform = load_audio(audio_path, sample_rate, duration_sec=config.audio.max_duration_sec)
        for start_time, end_time in extractor.grid.windows(len(waveform) / sample_rate):
            clip, core = extractor.context_clip(waveform, sample_rate, start_time, end_time)
            extractor.extract_window_features(clip, sample_rate, core=core)
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
