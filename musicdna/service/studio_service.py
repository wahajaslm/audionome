"""Research Studio Business Service Layer.

Encapsulates data bundling, dynamic emotion trajectories, active learning queries,
contrast analytics, and HTML rendering for the interactive research studio.
"""
from __future__ import annotations
import json
from pathlib import Path
from typing import Any
import numpy as np

from musicdna.service.service import AudioIntelligenceService, _DEFAULT_SERVICE
from musicdna.service.repository import AnalysisRepository, _DEFAULT_REPOSITORY, AUDIO_CACHE_DIR
from musicdna.features.spectral import SpectralVisualizer, _DEFAULT_VISUALIZER
from musicdna.features.projection import EmbeddingProjector
from musicdna.features.embeddings import MODEL_LICENSE_REGISTRY
from musicdna.preference.favorite_passages import FavoritePassageTaxonomy, AcousticContrastAnalyzer
from musicdna.preference.active_learning import ActiveLearningEngine
from musicdna.preference.emotion import DynamicEmotionModel

from musicdna.paths import DEMO_WAV
TEMPLATE_HTML_PATH: Path = Path(__file__).parent / 'templates' / 'studio.html'


class ResearchStudioService:
    """Enterprise domain service for interactive music analysis, visualization, and annotation."""

    def __init__(
        self,
        service: AudioIntelligenceService | None = None,
        visualizer: SpectralVisualizer | None = None,
        repository: AnalysisRepository | None = None,
        template_path: Path = TEMPLATE_HTML_PATH,
        demo_audio_path: Path = DEMO_WAV,
    ) -> None:
        self.service = service or _DEFAULT_SERVICE
        self.visualizer = visualizer or _DEFAULT_VISUALIZER
        self.repository = repository or _DEFAULT_REPOSITORY
        self.template_path = template_path
        self.demo_audio_path = demo_audio_path
        self.taxonomy = FavoritePassageTaxonomy()
        self.contrast_analyzer = AcousticContrastAnalyzer()
        self.active_engine = ActiveLearningEngine()
        self.dmer_model = DynamicEmotionModel()
        self.projector = EmbeddingProjector()
        self._cached_html: str | None = None
        self._demo_bundle_cache: dict[str, Any] = {}
        self._track_bundle_cache: dict[str, dict[str, Any]] = {}

    def get_studio_html(self) -> str:
        """Loads and caches the interactive studio HTML document."""
        if self._cached_html is None:
            if self.template_path.is_file():
                self._cached_html = self.template_path.read_text(encoding='utf-8')
            else:
                self._cached_html = "<html><body><h3>Studio template missing</h3></body></html>"
        return self._cached_html

    def resolve_audio_path(self, track_id: str, duration_sec: float = 0.0) -> Path | None:
        """Locates physical audio file on disk for a given track identifier."""
        if track_id == 'original-demo' and self.demo_audio_path.is_file():
            return self.demo_audio_path

        if AUDIO_CACHE_DIR.exists():
            for path in AUDIO_CACHE_DIR.glob(f'{track_id}.*'):
                if path.suffix.lower() not in ('.json',):
                    return path
            if duration_sec > 0:
                for row in self.repository.get_analyses():
                    other_id = row.get('trackId', '')
                    if other_id and other_id != 'original-demo' and abs(float(row.get('durationSec', 0.0)) - float(duration_sec)) < 0.5:
                        for path in AUDIO_CACHE_DIR.glob(f'{other_id}.*'):
                            if path.suffix.lower() not in ('.json',):
                                return path

        return self.demo_audio_path if self.demo_audio_path.is_file() else None

    def enrich_bundle(
        self,
        title: str,
        dsp: dict[str, Any],
        deep: dict[str, Any],
        fused: dict[str, Any],
        audio_path: Path | None = None,
        track_id: str = 'original-demo'
    ) -> dict[str, Any]:
        """Assembles rich visualization bundle including spectral plots, 2D projections, and DMER trajectory."""
        cache_key = f"{track_id}:{len(fused.get('segments', []))}:{fused.get('durationSec', 0)}"
        if cache_key in self._track_bundle_cache:
            cached = self._track_bundle_cache[cache_key]
            cached['dbStats'] = self.repository.get_database_statistics()
            return cached

        fused['trackId'] = track_id
        dsp['trackId'] = track_id
        deep['trackId'] = track_id
        segs = fused.get('segments', [])

        mm_vecs = [s.get('embedding', []) for s in segs]
        deep_vecs = [s.get('deepEmbedding') or (s.get('embedding', [])[:64]) for s in segs]
        dsp_vecs = [s.get('dspEmbedding') or (s.get('embedding', [])[-25:]) for s in segs]

        pca_mm = self.projector.project_to_2d(mm_vecs) if len(mm_vecs) >= 3 else []
        pca_deep = self.projector.project_to_2d(deep_vecs) if len(deep_vecs) >= 3 else []
        pca_dsp = self.projector.project_to_2d(dsp_vecs) if len(dsp_vecs) >= 3 else []

        x_raw = self.dmer_model._extract_sequence_features(segs)
        h_dual = self.dmer_model.compute_dual_scale_attention(x_raw)
        val = np.tanh((h_dual[:, 5] - np.mean(h_dual[:, 5])) * 3.5 + (h_dual[:, 1] - np.mean(h_dual[:, 1])) * 2.0) if len(segs) else np.zeros(0)
        aro = np.tanh((h_dual[:, 0] - np.mean(h_dual[:, 0])) * 2.8 + h_dual[:, 4] * 1.8) if len(segs) else np.zeros(0)

        dmer_bench = DynamicEmotionModel.evaluate_baseline([fused])
        al_queries = self.active_engine.select_informative_queries([fused], [], [], limit=6)
        spectral_plots = self.visualizer.compute_spectral_plots(audio_path, fused, track_id)
        musical_dimensions = self.visualizer.ensure_m3_dimensions(segs, spectral_plots)
        fused['musicalDimensions'] = musical_dimensions

        bundle = {
            'trackId': track_id,
            'title': title,
            'dsp': dsp,
            'deep': deep,
            'multimodal': fused,
            'musicalDimensions': musical_dimensions,
            'pcaPoints': pca_mm,
            'pcaByMode': {
                'multimodal': pca_mm,
                'deep': pca_deep,
                'dsp': pca_dsp,
            },
            'similarityMatrices': {
                'multimodal': self.visualizer.compute_cosine_matrix(mm_vecs),
                'deep': self.visualizer.compute_cosine_matrix(deep_vecs),
                'dsp': self.visualizer.compute_cosine_matrix(dsp_vecs),
            },
            'spectralPlots': spectral_plots,
            'dynamicVA': [
                {
                    'startSec': s['startSec'],
                    'endSec': s['endSec'],
                    'valence': round(float(v), 4),
                    'arousal': round(float(a), 4),
                }
                for s, v, a in zip(segs, val, aro)
            ],
            'dmerBenchmark': dmer_bench,
            'activeLearning': al_queries,
            'licenses': MODEL_LICENSE_REGISTRY,
            'dbStats': self.repository.get_database_statistics(),
        }
        self._track_bundle_cache[cache_key] = bundle
        return bundle

    def get_demo_bundle(self) -> dict[str, Any]:
        """Provides full analysis bundle for the built-in reference demo recording."""
        if 'bundle' in self._demo_bundle_cache:
            return self._demo_bundle_cache['bundle']

        rows = self.repository.get_analyses(track_id='original-demo')
        if rows:
            mm = next((r for r in rows if r.get('method') == 'multimodal'), rows[0])
            dsp = next((r for r in rows if r.get('method') == 'dsp'), mm)
            deep = next((r for r in rows if r.get('method') == 'clap'), mm)
            bundle = self.enrich_bundle('First Light', dsp, deep, mm, audio_path=self.demo_audio_path, track_id='original-demo')
            self._demo_bundle_cache['bundle'] = bundle
            return bundle

        dsp = self.service.feature_extractor.extract_track_analysis(self.demo_audio_path, track_identifier='original-demo')
        dsp['trackId'] = 'original-demo'
        deep = self.service.deep_encoder.analyze_track_deep(self.demo_audio_path)
        deep['trackId'] = 'original-demo'
        fused = self.service.fusion_engine.fuse(dsp, deep, deep_weight=0.7)
        fused['trackId'] = 'original-demo'

        bundle = self.enrich_bundle('First Light', dsp, deep, fused, audio_path=self.demo_audio_path, track_id='original-demo')
        self._demo_bundle_cache['bundle'] = bundle
        return bundle

    def get_track_bundle(self, track_id: str) -> dict[str, Any]:
        """Provides full analysis bundle for a specific track from the repository."""
        if track_id == 'original-demo':
            return self.get_demo_bundle()

        rows = self.repository.get_analyses(track_id=track_id)
        if not rows:
            all_rows = self.repository.get_analyses()
            rows = [r for r in all_rows if r.get('title') == track_id or r.get('trackId') == track_id]

        if not rows:
            raise KeyError(f"Track '{track_id}' not found in SQLite repository")

        actual_id = rows[0].get('trackId') or track_id
        mm = next((r for r in rows if r.get('method') == 'multimodal'), rows[0])
        dsp = next((r for r in rows if r.get('method') == 'dsp'), mm)
        deep = next((r for r in rows if r.get('method') == 'clap'), mm)
        title = mm.get('title') or actual_id
        dur = float(mm.get('durationSec') or 0.0)
        audio_path = self.resolve_audio_path(actual_id, dur)

        return self.enrich_bundle(title, dsp, deep, mm, audio_path=audio_path, track_id=actual_id)

    def inspect_passage(
        self,
        analysis: dict[str, Any],
        start_sec: float,
        end_sec: float,
        note: str = '',
        qualities: list[str] | None = None
    ) -> dict[str, Any]:
        """Computes passage contrast and matches listener taxonomy reasons and inquiry question chips."""
        qualities = qualities or []
        contrast = self.contrast_analyzer.analyze_contrast(analysis, start_sec, end_sec)
        reasons = self.taxonomy.classify(note, qualities)
        segs = analysis.get('segments', [])
        best_seg = min(segs, key=lambda s: abs(s['startSec'] - start_sec)) if segs else {}
        prompt = self.active_engine.formulate_inquiry_prompt(best_seg, []) if best_seg else {'question': '', 'chips': [], 'scores': {}}

        return {
            'contrast': contrast,
            'detectedFavReasons': reasons,
            'trompaPrompt': prompt,
        }


_DEFAULT_STUDIO_SERVICE = ResearchStudioService()

