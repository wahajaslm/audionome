"""Audio Intelligence Orchestration Service.

Coordinates feature extraction, stem separation, deep neural embeddings,
multimodal fusion, vector projection, and persistence into a single object-oriented service layer.
"""
from __future__ import annotations
import math
from pathlib import Path
import shutil
from tempfile import NamedTemporaryFile
from typing import Any
import librosa
import numpy as np

from musicdna.features.dsp import AcousticFeatureExtractor, SAMPLE_RATE
from musicdna.audio.stems import StemSeparator
from musicdna.features.structure import MusicalStructureAnalyzer
from musicdna.features.embeddings import DeepAudioEncoder, MultimodalFusionEngine, ModelLicenseManager, MODEL_LICENSE_REGISTRY
from musicdna.features.projection import EmbeddingProjector
from musicdna.service.repository import AnalysisRepository, AUDIO_CACHE_DIR
from musicdna.preference.active_learning import ActiveLearningEngine
from musicdna.preference.evaluation import EvidenceInsightSynthesizer

from musicdna.paths import DEMO_WAV as DEMO_AUDIO_FILE


class AudioIntelligenceService:
    """Enterprise domain service orchestrating acoustic intelligence, embeddings, and persistence."""

    def __init__(
        self,
        repository: AnalysisRepository | None = None,
        feature_extractor: AcousticFeatureExtractor | None = None,
        stem_separator: StemSeparator | None = None,
        structure_analyzer: MusicalStructureAnalyzer | None = None,
        deep_encoder: DeepAudioEncoder | None = None,
        fusion_engine: MultimodalFusionEngine | None = None,
        projector: EmbeddingProjector | None = None,
        active_learning_engine: ActiveLearningEngine | None = None,
    ) -> None:
        self.repository = repository or AnalysisRepository()
        self.feature_extractor = feature_extractor or AcousticFeatureExtractor()
        self.stem_separator = stem_separator or StemSeparator()
        self.structure_analyzer = structure_analyzer or MusicalStructureAnalyzer()
        self.deep_encoder = deep_encoder or DeepAudioEncoder()
        self.fusion_engine = fusion_engine or MultimodalFusionEngine()
        self.projector = projector or EmbeddingProjector()
        self.active_learning_engine = active_learning_engine or ActiveLearningEngine()
        self.insight_synthesizer = EvidenceInsightSynthesizer()

    def get_service_health(self) -> dict[str, Any]:
        """Returns service status, available model families, database statistics, and policy."""
        available_models = ['dsp']
        if self.deep_encoder.is_available():
            available_models.extend(['clap', 'multimodal'])

        return {
            'status': 'ready',
            'models': available_models,
            'licenses': MODEL_LICENSE_REGISTRY,
            'database': 'sqlite',
            'dbStats': self.repository.get_database_statistics(),
            'dataPolicy': 'local-request-only; audio deleted after extraction; no training',
        }

    def analyze_audio_bytes(
        self,
        audio_bytes: bytes,
        filename: str,
        method: str = 'dsp',
        local_confirmed: bool = False,
        track_id: str | None = None,
        model_family: str = 'auto',
        allow_noncommercial: bool | None = None,
        w_clap: float = 0.7
    ) -> dict[str, Any]:
        """Extracts acoustic features, deep neural representations, or multimodal fusion from audio bytes."""
        if not local_confirmed:
            raise PermissionError('Local analysis requires confirmation of rights-cleared or user-owned recording.')

        if method not in ('dsp', 'clap', 'multimodal'):
            raise ValueError(f"Unknown analysis method '{method}'. Supported: dsp, clap, multimodal")

        suffix = Path(filename).suffix.lower() or '.wav'
        temp_file = NamedTemporaryFile(suffix=suffix, delete=False)
        try:
            temp_file.write(audio_bytes)
            temp_file.flush()
            temp_file.close()
            temp_path = Path(temp_file.name)

            if method == 'dsp':
                analysis_result = self.feature_extractor.extract_track_analysis(
                    temp_path, track_identifier=track_id, separate_stems_flag=True
                )
            elif method == 'clap':
                analysis_result = self.deep_encoder.analyze_track_deep(
                    temp_path, model_family=model_family, allow_noncommercial=allow_noncommercial
                )
            else:  # multimodal
                dsp_result = self.feature_extractor.extract_track_analysis(
                    temp_path, track_identifier=track_id, separate_stems_flag=True
                )
                deep_result = self.deep_encoder.analyze_track_deep(
                    temp_path, model_family=model_family, allow_noncommercial=allow_noncommercial
                )
                analysis_result = self.fusion_engine.fuse(dsp_result, deep_result, deep_weight=w_clap)

            if track_id:
                analysis_result['trackId'] = track_id
                self.repository.save_analysis(track_id, analysis_result, title=Path(filename).stem)

            return analysis_result
        finally:
            Path(temp_file.name).unlink(missing_ok=True)

    def project_embedding_vectors(self, model_id: str, vectors: list[list[float]]) -> list[list[float]]:
        """Projects high-dimensional embeddings to 2D coordinates."""
        return self.projector.project_to_2d(vectors)

    def cache_uploaded_audio(
        self,
        audio_bytes: bytes,
        track_id: str,
        filename: str,
        content_type: str,
        track_title: str | None = None
    ) -> Path:
        """Stores uploaded audio in local cache and synchronizes metadata."""
        if not track_id:
            raise ValueError('Missing track_id')

        suffix = Path(filename).suffix.lower() or '.wav'
        AUDIO_CACHE_DIR.mkdir(parents=True, exist_ok=True)
        for old_file in AUDIO_CACHE_DIR.glob(f'{track_id}.*'):
            old_file.unlink(missing_ok=True)

        target_file = AUDIO_CACHE_DIR / f'{track_id}{suffix}'
        target_file.write_bytes(audio_bytes)

        if track_title:
            cached_analyses = self.repository.get_analyses(track_id=track_id)
            duration_seconds = cached_analyses[0]['durationSec'] if cached_analyses else 0.0
            self.repository.sync_track({
                'id': track_id,
                'title': track_title,
                'artist': 'Your library',
                'durationSec': duration_seconds,
                'mimeType': content_type,
                'source': 'local-file',
                'addedAt': 0,
            })

        return target_file

    def find_cached_audio(self, track_id: str) -> Path | None:
        """Finds cached audio file by track identifier or demo recording."""
        if track_id == 'original-demo' and DEMO_AUDIO_FILE.is_file():
            return DEMO_AUDIO_FILE

        if AUDIO_CACHE_DIR.exists():
            for cached_path in AUDIO_CACHE_DIR.glob(f'{track_id}.*'):
                if cached_path.suffix.lower() not in ('.json',):
                    return cached_path

            all_rows = self.repository.get_analyses()
            matching_rows = [r for r in all_rows if r.get('trackId') == track_id or r.get('title') == track_id]
            for row in matching_rows:
                tid = row.get('trackId', '')
                if tid:
                    for cached_path in AUDIO_CACHE_DIR.glob(f'{tid}.*'):
                        if cached_path.suffix.lower() not in ('.json',):
                            return cached_path
        return None

    def find_cached_stem(self, track_id: str, stem_name: str) -> Path | None:
        """Finds or extracts cached stem for a track."""
        cached_stem = self.stem_separator.get_cached_stem_path(track_id, stem_name)
        if cached_stem and cached_stem.is_file():
            return cached_stem

        audio_file = self.find_cached_audio(track_id)
        if not audio_file:
            return None

        audio_waveform, sample_rate = librosa.load(str(audio_file), sr=SAMPLE_RATE, mono=True)
        stems = self.stem_separator.separate(audio_waveform, sample_rate)
        saved = self.stem_separator.save_stems_to_cache(track_id, stems, sample_rate)
        return saved.get(stem_name)


_DEFAULT_SERVICE = AudioIntelligenceService()

