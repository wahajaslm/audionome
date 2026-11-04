"""Deep audio neural embeddings and multimodal fusion module."""
from __future__ import annotations

from .deep_encoder import (
    HF_CLAP_MODEL_ID,
    MODEL_LICENSE_REGISTRY,
    ModelLicenseManager,
    DeepAudioEncoder,
    MultimodalFusionEngine,
)

__all__ = [
    'HF_CLAP_MODEL_ID',
    'MODEL_LICENSE_REGISTRY',
    'ModelLicenseManager',
    'DeepAudioEncoder',
    'MultimodalFusionEngine',
]
