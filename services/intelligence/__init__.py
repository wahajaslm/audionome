"""Music DNA Local Intelligence Service Package.

High-cohesion, object-oriented audio analysis, deep neural representation,
multimodal fusion, stem separation, and research evaluation.
"""
from __future__ import annotations

from .service import AudioIntelligenceService
from .repository import AnalysisRepository
from .acoustic_features import AcousticFeatureExtractor, WindowAcousticDescriptors, AudioAnalysisSegment
from .deep_encoder import DeepAudioEncoder, MultimodalFusionEngine, ModelLicenseManager
from .stem_separation import StemSeparator, MusicalStructureAnalyzer, separate_stems, analyze_musical_dimensions
from .vector_projection import EmbeddingProjector, project_to_2d, project_multidimensional
from .spectral_analysis import SpectralVisualizer
from .studio_service import ResearchStudioService

__all__ = [
    'AudioIntelligenceService',
    'AnalysisRepository',
    'AcousticFeatureExtractor',
    'WindowAcousticDescriptors',
    'AudioAnalysisSegment',
    'DeepAudioEncoder',
    'MultimodalFusionEngine',
    'ModelLicenseManager',
    'StemSeparator',
    'MusicalStructureAnalyzer',
    'EmbeddingProjector',
    'SpectralVisualizer',
    'ResearchStudioService',
    'separate_stems',
    'analyze_musical_dimensions',
    'project_to_2d',
    'project_multidimensional',
]
