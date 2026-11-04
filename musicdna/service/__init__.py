"""Music DNA Local Intelligence Service Package.

High-cohesion, object-oriented audio analysis, deep neural representation,
multimodal fusion, stem separation, and research evaluation.
"""
from __future__ import annotations

from musicdna.service.service import AudioIntelligenceService
from musicdna.service.repository import AnalysisRepository
from musicdna.features.dsp import AcousticFeatureExtractor, WindowAcousticDescriptors, AudioAnalysisSegment
from musicdna.features.embeddings import DeepAudioEncoder, MultimodalFusionEngine, ModelLicenseManager
from musicdna.audio.stems import StemSeparator, separate_stems
from musicdna.features.structure import MusicalStructureAnalyzer, analyze_musical_dimensions
from musicdna.features.projection import EmbeddingProjector, project_to_2d, project_multidimensional
from musicdna.features.spectral import SpectralVisualizer
from musicdna.service.studio_service import ResearchStudioService

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
