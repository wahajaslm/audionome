"""Acoustic feature extraction module."""
from __future__ import annotations

from .acoustic_features import (
    SAMPLE_RATE,
    WINDOW_SECONDS,
    HOP_SECONDS,
    FEATURE_VERSION,
    WindowAcousticDescriptors,
    AudioAnalysisSegment,
    AcousticFeatureExtractor,
)

__all__ = [
    'SAMPLE_RATE',
    'WINDOW_SECONDS',
    'HOP_SECONDS',
    'FEATURE_VERSION',
    'WindowAcousticDescriptors',
    'AudioAnalysisSegment',
    'AcousticFeatureExtractor',
]
