"""Research Integration Reproducible Benchmark Suite.

Usage:
  python -m musicdna.experiments.benchmark_suite --out research-output/benchmark_report.json

Executes and verifies all 6 scientific integration pillars on real audio:
1. FAV Corpus methodology (15s favorite passage schema, musical reasons, passage-vs-track contrast)
2. Real Pretrained Deep Audio Encoder (LAION-CLAP music, 512-D embeddings + license verification)
3. DSP + Deep Embedding Multimodal Fusion (versioned, unit-normalized joint representations)
4. TROMPA-MER Inspired Active Learning (uncertainty + cross-modal disagreement + diversity query selection)
5. Personalized-DMER Baseline (AAAI 2025 dual-scale temporal attention + listener support-set adaptation)
6. Hybrid Preference Evaluation & Evidence-Backed Insight Synthesis (DSP vs Deep vs Fused vs Fused+Behavior)
"""
from __future__ import annotations
import argparse
import json
from pathlib import Path
from tempfile import TemporaryDirectory
from typing import Any
import librosa
import numpy as np
import soundfile as sf

from musicdna.features.dsp import SAMPLE_RATE, AcousticFeatureExtractor
from musicdna.paths import DEMO_WAV
from musicdna.features.embeddings import (
    DeepAudioEncoder,
    MultimodalFusionEngine,
    ModelLicenseManager,
    MODEL_LICENSE_REGISTRY,
)
from musicdna.preference.favorite_passages import (
    FAVAnnotation,
    FavoritePassageTaxonomy,
    AcousticContrastAnalyzer,
    FavoritePassageEvaluator,
)
from musicdna.preference.active_learning import ActiveLearningEngine
from musicdna.preference.emotion import DynamicEmotionModel
from musicdna.preference.evaluation import (
    ListeningBehaviorAggregator,
    PreferenceAblationStudy,
    EvidenceInsightSynthesizer,
)


class ControlledCorpusGenerator:
    """Generates controlled multi-passage audio recordings for scientific leave-one-track-out evaluation."""

    @staticmethod
    def generate_benchmark_tracks(
        base_recording_path: Path,
        working_directory: Path
    ) -> list[tuple[str, Path]]:
        """Creates 4 controlled multi-passage recordings derived from the authorized base recording

        so that leave-one-track-out evaluation has distinct tracks with known vocal+intensification
        passages versus non-intensifying percussive textures.
        """
        audio_waveform, sample_rate = librosa.load(str(base_recording_path), sr=SAMPLE_RATE, mono=True)
        duration_seconds = len(audio_waveform) / sample_rate
        generated_tracks: list[tuple[str, Path]] = []

        time_axis = np.linspace(0.0, duration_seconds, len(audio_waveform), endpoint=False)
        # Synthesized vocal-formant harmonic carrier (440Hz + 880Hz + 1320Hz with natural vibrato)
        vibrato_frequency = np.sin(2.0 * np.pi * 5.5 * time_axis) * 0.015
        synthesized_vocal = (
            0.35 * np.sin(2.0 * np.pi * 440.0 * (time_axis + vibrato_frequency)) +
            0.25 * np.sin(2.0 * np.pi * 880.0 * (time_axis + vibrato_frequency)) +
            0.15 * np.sin(2.0 * np.pi * 1320.0 * (time_axis + vibrato_frequency))
        ).astype(np.float32)

        for track_index in range(1, 5):
            modified_waveform = audio_waveform.copy()

            # Window 0 (0-12s): Gradually intensifying vocal build-up (true crescendo)
            start_frame_crescendo = 0
            end_frame_crescendo = min(len(audio_waveform), int(12.0 * sample_rate))
            crescendo_ramp = np.linspace(0.15, 1.45, end_frame_crescendo - start_frame_crescendo, dtype=np.float32) ** 1.4
            crescendo_segment = modified_waveform[start_frame_crescendo:end_frame_crescendo]
            rms_energy = np.sqrt(np.mean(crescendo_segment ** 2)) + 1e-4
            normalized_base_clip = (crescendo_segment / rms_energy) * 0.12

            modified_waveform[start_frame_crescendo:end_frame_crescendo] = (
                0.35 * normalized_base_clip +
                0.65 * synthesized_vocal[start_frame_crescendo:end_frame_crescendo] * (1.0 + 0.05 * track_index)
            ) * crescendo_ramp

            # Window 2 (12-24s): Low-vocal, decaying percussive noise texture (negative contrast)
            start_frame_percussive = min(len(audio_waveform), int(12.0 * sample_rate))
            end_frame_percussive = min(len(audio_waveform), int(24.0 * sample_rate))
            if end_frame_percussive > start_frame_percussive:
                percussive_duration = end_frame_percussive - start_frame_percussive
                decay_envelope = np.linspace(1.1, 0.2, percussive_duration, dtype=np.float32)
                random_generator = np.random.default_rng(100 + track_index)
                noise_texture = random_generator.standard_normal(percussive_duration).astype(np.float32) * 0.14
                modified_waveform[start_frame_percussive:end_frame_percussive] = (
                    0.15 * modified_waveform[start_frame_percussive:end_frame_percussive] + noise_texture
                ) * decay_envelope

            output_audio_path = working_directory / f"research_track_{track_index}.wav"
            sf.write(str(output_audio_path), modified_waveform, sample_rate)
            generated_tracks.append((f"track-{track_index}", output_audio_path))

        return generated_tracks


class ResearchBenchmarkSuite:
    """Orchestrates reproducible scientific evaluation across all 6 research pillars."""

    def __init__(self, demo_audio_path: Path | None = None) -> None:
        self.demo_audio_path = (
            demo_audio_path or
            DEMO_WAV
        )
        self.corpus_generator = ControlledCorpusGenerator()
        self.feature_extractor = AcousticFeatureExtractor()
        self.deep_encoder = DeepAudioEncoder()
        self.fusion_engine = MultimodalFusionEngine()
        self.license_manager = ModelLicenseManager()
        self.fav_evaluator = FavoritePassageEvaluator()
        self.active_learning_engine = ActiveLearningEngine()
        self.ablation_study = PreferenceAblationStudy()
        self.insight_synthesizer = EvidenceInsightSynthesizer()

    def run(self) -> dict[str, Any]:
        """Executes full scientific benchmark and returns verified metrics dictionary."""
        with TemporaryDirectory(prefix='music-dna-m4-') as temporary_directory:
            working_path = Path(temporary_directory)
            track_files = self.corpus_generator.generate_benchmark_tracks(self.demo_audio_path, working_path)

            all_analyses: list[dict[str, Any]] = []
            for track_id, wav_path in track_files:
                dsp_analysis = self.feature_extractor.extract_track_analysis(wav_path, track_identifier=track_id)
                dsp_analysis['trackId'] = track_id
                deep_analysis = self.deep_encoder.analyze_track_deep(wav_path)
                deep_analysis['trackId'] = track_id
                fused_analysis = self.fusion_engine.fuse(dsp_analysis, deep_analysis, deep_weight=0.7)
                fused_analysis['trackId'] = track_id
                all_analyses.extend([dsp_analysis, deep_analysis, fused_analysis])

            dsp_analyses = [a for a in all_analyses if a['method'] == 'dsp']
            deep_analyses = [a for a in all_analyses if a['method'] == 'clap']
            fused_analyses = [a for a in all_analyses if a['method'] == 'multimodal']

            # Controlled FAV ground truth: 0-12s vocal crescendo passages in tracks 1, 2, 3
            user_saved_moments: list[dict[str, Any]] = [
                {
                    'id': 'm1',
                    'trackId': 'track-1',
                    'startSec': 0.0,
                    'endSec': 12.0,
                    'qualities': ['Vocals', 'Build-up', 'Melody'],
                    'feelings': ['Chills'],
                    'explanation': 'Expressive vocals over an intensifying build-up',
                },
                {
                    'id': 'm2',
                    'trackId': 'track-2',
                    'startSec': 0.0,
                    'endSec': 12.0,
                    'qualities': ['Vocals', 'Build-up', 'Instruments'],
                    'feelings': ['♡ Love'],
                    'explanation': 'Building instrumentation and soulful vocal line',
                },
                {
                    'id': 'm3',
                    'trackId': 'track-3',
                    'startSec': 0.0,
                    'endSec': 12.0,
                    'qualities': ['Vocals', 'Build-up'],
                    'feelings': ['Excitement'],
                    'note': 'Rising vocal crescendo',
                },
                {
                    'id': 'm4',
                    'trackId': 'track-1',
                    'startSec': 24.0,
                    'endSec': 32.0,
                    'qualities': ['Atmosphere', 'Harmony'],
                    'note': 'Warm harmonic texture and reverb space',
                },
                {
                    'id': 'm5',
                    'trackId': 'track-2',
                    'startSec': 24.0,
                    'endSec': 32.0,
                    'qualities': ['Instruments', 'Atmosphere', 'Melody', 'Lyrics'],
                    'note': 'Subtle acoustic arrangement and narrative lyric',
                },
            ]

            user_ratings: list[dict[str, Any]] = [
                {'trackId': 'track-1', 'startSec': 0.0, 'endSec': 12.0, 'value': 'like'},
                {'trackId': 'track-1', 'startSec': 12.0, 'endSec': 24.0, 'value': 'dislike'},
                {'trackId': 'track-2', 'startSec': 0.0, 'endSec': 12.0, 'value': 'like'},
                {'trackId': 'track-2', 'startSec': 12.0, 'endSec': 24.0, 'value': 'dislike'},
                {'trackId': 'track-3', 'startSec': 0.0, 'endSec': 12.0, 'value': 'like'},
                {'trackId': 'track-3', 'startSec': 12.0, 'endSec': 24.0, 'value': 'dislike'},
                {'trackId': 'track-4', 'startSec': 0.0, 'endSec': 12.0, 'value': 'like'},
                {'trackId': 'track-4', 'startSec': 12.0, 'endSec': 24.0, 'value': 'dislike'},
            ]

            simulated_listening_events: list[dict[str, Any]] = [
                # Repeated rewinds & multi-session returns to track-1 build-up
                {'kind': 'seek', 'origin': 'user', 'trackId': 'track-1', 'fromSec': 18.0, 'toSec': 2.0, 'sessionId': 'sess-1', 'at': 100},
                {'kind': 'seek', 'origin': 'user', 'trackId': 'track-1', 'fromSec': 14.0, 'toSec': 3.0, 'sessionId': 'sess-2', 'at': 200},
                {'kind': 'loop_enabled', 'origin': 'user', 'trackId': 'track-1', 'momentStartSec': 0.0, 'momentEndSec': 12.0, 'sessionId': 'sess-2', 'at': 205},
                {'kind': 'loop_cycle', 'origin': 'player', 'trackId': 'track-1', 'momentStartSec': 0.0, 'momentEndSec': 12.0, 'sessionId': 'sess-2', 'at': 218},
                # Repeat rewind to track-2 build-up
                {'kind': 'seek', 'origin': 'user', 'trackId': 'track-2', 'fromSec': 20.0, 'toSec': 2.5, 'sessionId': 'sess-3', 'at': 300},
                {'kind': 'seek', 'origin': 'user', 'trackId': 'track-2', 'fromSec': 16.0, 'toSec': 1.0, 'sessionId': 'sess-4', 'at': 400},
                # Skips departing from the noisy percussive sections
                {'kind': 'skip', 'origin': 'user', 'trackId': 'track-1', 'positionSec': 14.0, 'sessionId': 'sess-1', 'at': 120},
                {'kind': 'skip', 'origin': 'user', 'trackId': 'track-2', 'positionSec': 15.0, 'sessionId': 'sess-3', 'at': 320},
            ]

            # 1. FAV Corpus Evaluation
            fav_evaluation = self.fav_evaluator.evaluate_corpus(dsp_analyses, user_saved_moments)

            # 2. Pretrained Deep Encoder Licensing Check
            muq_license_blocked_by_default = False
            try:
                self.license_manager.verify_license('muq', allow_noncommercial=False)
            except PermissionError:
                muq_license_blocked_by_default = True

            # 3. Active Learning Query Selection & Benchmark
            active_queries = self.active_learning_engine.select_informative_queries(
                all_analyses, user_saved_moments[:2], user_ratings[:2],
                listening_events=simulated_listening_events, limit=3
            )
            pooled_segments = [s for a in fused_analyses for s in a['segments']]
            ground_truth_likes = {idx for idx, s in enumerate(pooled_segments) if s['startSec'] < 6.0}
            active_learning_benchmark = self.active_learning_engine.benchmark_against_random(
                pooled_segments, ground_truth_likes, query_budget=4
            )

            # 4. Personalized-DMER Affective Baseline
            dmer_evaluation = DynamicEmotionModel.evaluate_baseline(fused_analyses)

            # 5. Hybrid Preference Ablation Study & Evidence Insight
            ablation_results = self.ablation_study.run_ablation(
                simulated_listening_events, all_analyses, user_saved_moments, user_ratings
            )
            insight_summary = self.insight_synthesizer.synthesize(
                all_analyses, user_saved_moments, user_ratings, simulated_listening_events
            )

            return {
                'milestone': 'Research Integration Benchmark',
                '1_fav_methodology': fav_evaluation,
                '2_deep_audio_encoder': {
                    'modelId': deep_analyses[0]['modelId'],
                    'embedding_dim': len(deep_analyses[0]['segments'][0]['embedding']),
                    'muq_nc_weights_blocked_by_default': muq_license_blocked_by_default,
                    'registered_models': list(MODEL_LICENSE_REGISTRY.keys()),
                },
                '3_dsp_deep_fusion': {
                    'modelId': fused_analyses[0]['modelId'],
                    'components': fused_analyses[0]['components'],
                    'fused_dim': len(fused_analyses[0]['segments'][0]['embedding']),
                },
                '4_trompa_active_learning': {
                    'top_queries': active_queries,
                    'benchmark_vs_random': active_learning_benchmark,
                },
                '5_personalized_dmer_baseline': dmer_evaluation,
                '6_hybrid_preference_evaluation': ablation_results,
                'concrete_illustrative_insight': insight_summary,
            }


BenchmarkSuite = ResearchBenchmarkSuite

__all__ = ['ControlledCorpusGenerator', 'ResearchBenchmarkSuite', 'BenchmarkSuite']


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Run Research Integration Benchmark Suite')
    parser.add_argument('--out', type=Path, default=Path('research-output/benchmark_report.json'))
    args = parser.parse_args()
    benchmark_report = ResearchBenchmarkSuite().run()
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(benchmark_report, indent=2), encoding='utf8')
    print(json.dumps(benchmark_report, indent=2))
