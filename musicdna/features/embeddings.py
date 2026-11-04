"""Pretrained Deep Audio Encoders (LAION-CLAP via Hugging Face, MS-CLAP, remote CLAP)
and Versioned Multimodal DSP + Deep Embedding Fusion.

Enforces independent verification of source-code licenses vs. pretrained checkpoint weight licenses
(e.g., MuQ code is MIT, but MuQ published weights are CC BY-NC 4.0).
"""
from __future__ import annotations
import json
import os
from pathlib import Path
from tempfile import TemporaryDirectory
from typing import Any
import httpx
import librosa
import numpy as np
import soundfile as sf
from musicdna.audio.io import load_audio
from musicdna.local_models import LocalModels
from musicdna.features.dsp import AcousticFeatureExtractor

HF_CLAP_MODEL_ID: str = os.getenv('MUSIC_DNA_CLAP_MODEL', 'laion/clap-htsat-unfused').strip()
HF_CLAP_SAMPLE_RATE: int = 48000
HF_CLAP_BATCH_SIZE: int = 8
MERT_MODEL_ID: str = os.getenv('MUSIC_DNA_MERT_MODEL', 'm-a-p/MERT-v1-95M').strip()
MERT_SAMPLE_RATE: int = 24000

MODEL_LICENSE_REGISTRY: dict[str, dict[str, Any]] = {
    'clap': {
        'name': 'LAION-CLAP (clap-htsat-unfused) / MS-CLAP',
        'repo': 'https://huggingface.co/laion/clap-htsat-unfused',
        'code_license': 'MIT',
        'weights_license': 'Apache-2.0 / CC0-1.0',
        'commercial_safe': True,
    },
    'mert': {
        'name': 'MERT-v1-95M (Acoustic Music Understanding)',
        'repo': 'https://github.com/yizhilll/MERT',
        'code_license': 'Apache-2.0',
        'weights_license': 'CC BY-NC 4.0',
        'commercial_safe': False,
        'restriction_note': 'MERT code is Apache-2.0, but the published MERT-v1 weights are CC BY-NC 4.0 (non-commercial only).',
    },
    'muq': {
        'name': 'MuQ (Self-Supervised Music Representation Learning)',
        'repo': 'https://github.com/tencent-ailab/MuQ',
        'code_license': 'MIT',
        'weights_license': 'CC BY-NC 4.0',
        'commercial_safe': False,
        'restriction_note': 'MuQ code is MIT-licensed, but published model weights are CC BY-NC 4.0 (non-commercial research only).',
    },
    'essentia-noncommercial': {
        'name': 'Essentia Pretrained Models (MusiCNN / Discogs-EffNet)',
        'repo': 'https://essentia.upf.edu/models.html',
        'code_license': 'AGPLv3 / Proprietary',
        'weights_license': 'CC BY-NC-SA 4.0',
        'commercial_safe': False,
        'restriction_note': 'Essentia pretrained weights require separate commercial licensing outside academic research.',
    },
}


class ModelLicenseManager:
    """Manages legal compliance and license checks for model code versus weights."""

    def __init__(self, registry: dict[str, dict[str, Any]] | None = None) -> None:
        self.registry = registry or MODEL_LICENSE_REGISTRY

    def verify_license(self, model_family: str, allow_noncommercial: bool | None = None) -> dict[str, Any]:
        """Verifies both source code and model weight licenses independently."""
        key = model_family.lower().strip()
        if key not in self.registry:
            raise ValueError(f"Unknown model family '{model_family}'. Supported: {list(self.registry.keys())}")
        info = self.registry[key]
        if allow_noncommercial is None:
            allow_noncommercial = os.getenv('MUSIC_DNA_ALLOW_NC_WEIGHTS', '').strip() in ('1', 'true', 'yes')
        if not info['commercial_safe'] and not allow_noncommercial:
            raise PermissionError(
                f"Model '{info['name']}' weights are licensed under {info['weights_license']} "
                f"(code: {info['code_license']}). {info.get('restriction_note', '')} "
                "Set allow_noncommercial=True or MUSIC_DNA_ALLOW_NC_WEIGHTS=1 for non-commercial research evaluation."
            )
        return info


class DeepAudioEncoder:
    """Extracts neural audio embeddings using local transformer checkpoints or remote backends."""

    def __init__(self, license_manager: ModelLicenseManager | None = None) -> None:
        self.license_manager = license_manager or ModelLicenseManager()
        self._hf_clap: tuple[Any, Any] | None = None
        self._mert: tuple[Any, Any] | None = None

    def get_colab_url(self) -> str:
        return os.getenv('MUSIC_DNA_COLAB_URL', '').strip().rstrip('/')

    @staticmethod
    def hf_clap_is_cached() -> bool:
        """True when transformers is installed and the CLAP checkpoint is already in the local HF cache."""
        try:
            import transformers  # noqa: F401
            from huggingface_hub import try_to_load_from_cache
        except ImportError:
            return False
        return isinstance(try_to_load_from_cache(HF_CLAP_MODEL_ID, 'config.json'), str)

    def is_available(self) -> bool:
        if self.get_colab_url():
            return True
        clap_path = os.getenv('MUSIC_DNA_CLAP_WEIGHTS', '')
        if clap_path and Path(clap_path).is_file():
            try:
                import msclap  # noqa: F401
                return True
            except ImportError:
                pass
        return self.hf_clap_is_cached()

    def load_hf_clap(self) -> tuple[Any, Any]:
        """Loads the pretrained LAION-CLAP model and processor once per encoder."""
        if self._hf_clap is None:
            from transformers import ClapModel, ClapProcessor
            with LocalModels.offline_when_downloaded(HF_CLAP_MODEL_ID) as local:
                model = ClapModel.from_pretrained(HF_CLAP_MODEL_ID, local_files_only=local)
                model.eval()
                self._hf_clap = (model, ClapProcessor.from_pretrained(HF_CLAP_MODEL_ID, local_files_only=local))
        return self._hf_clap

    def encode_clips_with_hf_clap(self, audio_clips: list[np.ndarray], sample_rate: int) -> list[np.ndarray]:
        """Embeds each clip with the pretrained CLAP audio tower (512-D joint audio-text space)."""
        import torch
        model, processor = self.load_hf_clap()
        resampled = [
            librosa.resample(np.asarray(clip, dtype=np.float32), orig_sr=sample_rate, target_sr=HF_CLAP_SAMPLE_RATE)
            for clip in audio_clips
        ]
        embeddings: list[np.ndarray] = []
        for batch_start in range(0, len(resampled), HF_CLAP_BATCH_SIZE):
            batch = resampled[batch_start:batch_start + HF_CLAP_BATCH_SIZE]
            inputs = processor(audio=batch, sampling_rate=HF_CLAP_SAMPLE_RATE, return_tensors='pt')
            with torch.no_grad():
                output = model.get_audio_features(**inputs)
            features = output if isinstance(output, torch.Tensor) else output.pooler_output
            embeddings.extend(features.detach().cpu().numpy().astype(np.float64))
        return embeddings

    def load_mert(self, allow_noncommercial: bool | None = None) -> tuple[Any, Any]:
        """Loads MERT once. Its weights are CC BY-NC 4.0 and its model code runs via trust_remote_code.

        Layer outputs are captured with forward hooks on the 12 encoder layers. FIX: MERT's remote code
        ignores output_hidden_states under transformers 5.x and returns hidden_states=None.
        Example: asking for all layers gave only last_hidden_state (1, 374, 768); the hooks give all 12.
        """
        if self._mert is None:
            self.license_manager.verify_license('mert', allow_noncommercial=allow_noncommercial)
            from transformers import AutoModel, Wav2Vec2FeatureExtractor
            with LocalModels.offline_when_downloaded(MERT_MODEL_ID) as local:
                model = AutoModel.from_pretrained(MERT_MODEL_ID, trust_remote_code=True, local_files_only=local)
                model.eval()
                processor = Wav2Vec2FeatureExtractor.from_pretrained(MERT_MODEL_ID, trust_remote_code=True,
                                                                     local_files_only=local)
            self._mert_layers: list[Any] = []
            for layer in model.encoder.layers:
                layer.register_forward_hook(
                    lambda _module, _inputs, output: self._mert_layers.append(output[0] if isinstance(output, tuple) else output))
            self._mert = (model, processor)
        return self._mert

    def encode_clips_with_mert(
        self, audio_clips: list[np.ndarray], sample_rate: int, allow_noncommercial: bool | None = None
    ) -> list[np.ndarray]:
        """768-D MERT embedding per clip: time-averaged hidden states, averaged over all 12 layers.

        Clips are batched only with clips of the same length. FIX: padding shorter clips with silence
        put that silence into the time average. Example: a song's 4.5 s tail window batched with 12 s
        windows was 60% padding, so its embedding mostly described silence.
        """
        import torch
        model, processor = self.load_mert(allow_noncommercial)
        resampled = [
            librosa.resample(np.asarray(clip, dtype=np.float32), orig_sr=sample_rate, target_sr=MERT_SAMPLE_RATE)
            for clip in audio_clips
        ]
        embeddings: dict[int, np.ndarray] = {}
        by_length: dict[int, list[int]] = {}
        for index, clip in enumerate(resampled):
            by_length.setdefault(len(clip), []).append(index)
        for indices in by_length.values():
            for batch_start in range(0, len(indices), HF_CLAP_BATCH_SIZE):
                batch_indices = indices[batch_start:batch_start + HF_CLAP_BATCH_SIZE]
                inputs = processor([resampled[i] for i in batch_indices], sampling_rate=MERT_SAMPLE_RATE, return_tensors='pt')
                self._mert_layers.clear()
                with torch.no_grad():
                    model(**inputs)
                layers = torch.stack(self._mert_layers)  # (12, batch, time, 768)
                for i, vector in zip(batch_indices, layers.mean(dim=2).mean(dim=0).cpu().numpy().astype(np.float64)):
                    embeddings[i] = vector
        return [embeddings[i] for i in range(len(resampled))]

    def encode_via_colab(self, audio_files: list[str], service_url: str) -> list[list[float]]:
        embeddings: list[list[float]] = []
        with httpx.Client(timeout=60.0) as client:
            for file_path in audio_files:
                with open(file_path, 'rb') as f:
                    response = client.post(f"{service_url}/embed", files={'file': (Path(file_path).name, f, 'audio/wav')})
                    if response.status_code != 200:
                        raise RuntimeError(f"Colab embedding failed ({response.status_code}): {response.text[:120]}")
                    embeddings.append(response.json()['embedding'])
        return embeddings

    def analyze_waveform_deep(
        self,
        audio_waveform: np.ndarray,
        sample_rate: int,
        base_analysis: dict[str, Any],
        start_offset: float = 0.0,
        model_family: str = 'auto',
        allow_noncommercial: bool | None = None
    ) -> dict[str, Any]:
        """Extracts time-aligned deep neural embeddings for each window directly from an in-memory waveform."""
        supported_families = ('auto', 'clap')
        if model_family not in supported_families:
            raise ValueError(f"Unsupported deep encoder family: {model_family} (only CLAP is wired up)")

        if model_family != 'auto':
            self.license_manager.verify_license(model_family, allow_noncommercial=allow_noncommercial)

        if not self.is_available():
            raise RuntimeError(
                f'No deep audio encoder configured. Install transformers and download {HF_CLAP_MODEL_ID} '
                '(see README), set MUSIC_DNA_COLAB_URL, or set MUSIC_DNA_CLAP_WEIGHTS.'
            )

        colab_service_url = self.get_colab_url()
        clap_weights_path = os.getenv('MUSIC_DNA_CLAP_WEIGHTS', '').strip()
        deep_analysis = json.loads(json.dumps(base_analysis))

        if colab_service_url and model_family in ('auto', 'clap'):
            self.license_manager.verify_license('clap', allow_noncommercial=allow_noncommercial)
            with TemporaryDirectory(prefix='music-dna-clap-') as temporary_directory:
                window_files: list[str] = []
                for index, segment in enumerate(deep_analysis['segments']):
                    s_idx = max(0, int((segment['startSec'] - start_offset) * sample_rate))
                    e_idx = min(len(audio_waveform), int((segment['endSec'] - start_offset) * sample_rate))
                    clip = audio_waveform[s_idx:e_idx]
                    file_name = str(Path(temporary_directory) / f'window_{index:04d}.wav')
                    sf.write(file_name, clip, sample_rate)
                    window_files.append(file_name)
                embedding_vectors = self.encode_via_colab(window_files, colab_service_url)
                model_identifier = f'colab-clap-2023:{colab_service_url[:32]}'
        elif clap_weights_path and Path(clap_weights_path).is_file() and model_family in ('auto', 'clap'):
            self.license_manager.verify_license('clap', allow_noncommercial=allow_noncommercial)
            from msclap import CLAP
            with TemporaryDirectory(prefix='music-dna-clap-') as temporary_directory:
                window_files = []
                for index, segment in enumerate(deep_analysis['segments']):
                    s_idx = max(0, int((segment['startSec'] - start_offset) * sample_rate))
                    e_idx = min(len(audio_waveform), int((segment['endSec'] - start_offset) * sample_rate))
                    clip = audio_waveform[s_idx:e_idx]
                    file_name = str(Path(temporary_directory) / f'window_{index:04d}.wav')
                    sf.write(file_name, clip, sample_rate)
                    window_files.append(file_name)
                clap_model = CLAP(model_fp=clap_weights_path, version='2023', use_cuda=False)
                raw_tensors = clap_model.get_audio_embeddings(window_files)
                embedding_vectors = raw_tensors.detach().cpu().numpy() if hasattr(raw_tensors, 'detach') else np.asarray(raw_tensors)
                weights_file = Path(clap_weights_path)
                model_identifier = f'msclap-2023:{weights_file.name}:{weights_file.stat().st_size}'
        else:
            license_information = self.license_manager.verify_license('clap', allow_noncommercial=allow_noncommercial)
            clips = []
            for segment in deep_analysis['segments']:
                s_idx = max(0, int((segment['startSec'] - start_offset) * sample_rate))
                e_idx = min(len(audio_waveform), int((segment['endSec'] - start_offset) * sample_rate))
                clip = audio_waveform[s_idx:e_idx]
                if len(clip) < int(0.5 * sample_rate):
                    clip = np.pad(clip, (0, int(0.5 * sample_rate) - len(clip)))
                clips.append(clip)
            embedding_vectors = self.encode_clips_with_hf_clap(clips, sample_rate)
            model_identifier = f'hf-clap:{HF_CLAP_MODEL_ID}:{len(embedding_vectors[0]) if embedding_vectors else 0}d'
            deep_analysis['license'] = license_information['weights_license']

        if len(embedding_vectors) != len(deep_analysis['segments']):
            raise RuntimeError('Deep encoder output did not match requested windows')

        for segment, embedding_row in zip(deep_analysis['segments'], embedding_vectors):
            sanitized_row = np.nan_to_num(np.asarray(embedding_row, dtype=np.float64))
            row_norm = float(np.linalg.norm(sanitized_row))
            segment['embedding'] = [round(float(v / row_norm), 7) for v in sanitized_row] if row_norm else [0.0] * len(sanitized_row)

        deep_analysis['method'] = 'clap'
        deep_analysis['modelId'] = model_identifier
        return deep_analysis

    def analyze_track_deep(
        self,
        audio_path: str | Path,
        model_family: str = 'auto',
        allow_noncommercial: bool | None = None
    ) -> dict[str, Any]:
        """Extracts time-aligned deep neural embeddings for each window of an authorized recording."""
        extractor = AcousticFeatureExtractor()
        sample_rate = extractor.sample_rate
        audio_signal = load_audio(audio_path, sample_rate, duration_sec=extractor.config.audio.max_duration_sec)
        base_analysis = extractor.extract_from_waveform(audio_signal, sample_rate)
        return self.analyze_waveform_deep(
            audio_waveform=audio_signal,
            sample_rate=sample_rate,
            base_analysis=base_analysis,
            start_offset=0.0,
            model_family=model_family,
            allow_noncommercial=allow_noncommercial
        )


class MultimodalFusionEngine:
    """Fuses high-level pretrained neural embeddings with interpretable low-level DSP acoustic features."""

    @staticmethod
    def fuse(
        dsp_analysis: dict[str, Any],
        deep_analysis: dict[str, Any],
        deep_weight: float = 0.7
    ) -> dict[str, Any]:
        """Combines DSP and deep embeddings into a unit-normalized joint representation."""
        dsp_weight = max(0.0, 1.0 - deep_weight)
        dsp_model_id = dsp_analysis.get('modelId', 'librosa-segment-v1')
        deep_model_id = deep_analysis.get('modelId', 'clap')

        fused_analysis = dict(dsp_analysis)
        fused_analysis['method'] = 'multimodal'
        fused_analysis['modelId'] = f"fused-v2(deep={deep_model_id}@{deep_weight:.2f}+dsp={dsp_model_id}@{dsp_weight:.2f})"
        fused_analysis['components'] = {
            'dspModelId': dsp_model_id,
            'deepModelId': deep_model_id,
            'wDeep': round(float(deep_weight), 3),
            'wDsp': round(float(dsp_weight), 3),
        }
        fused_segments = []

        for segment_dsp, segment_deep in zip(dsp_analysis['segments'], deep_analysis['segments']):
            vector_dsp = np.asarray(segment_dsp['embedding'], dtype=np.float64)
            vector_deep = np.asarray(segment_deep['embedding'], dtype=np.float64)

            norm_dsp = float(np.linalg.norm(vector_dsp)) or 1.0
            norm_deep = float(np.linalg.norm(vector_deep)) or 1.0
            unit_dsp = vector_dsp / norm_dsp
            unit_deep = vector_deep / norm_deep

            # Unit-normalized block fusion: ||v_fused||_2 = sqrt(w_deep * 1 + w_dsp * 1) = 1.0
            fused_vector = np.concatenate([np.sqrt(deep_weight) * unit_deep, np.sqrt(dsp_weight) * unit_dsp])
            fused_norm = float(np.linalg.norm(fused_vector)) or 1.0
            fused_vector = fused_vector / fused_norm

            fused_segment = dict(segment_dsp)
            fused_segment['dspEmbedding'] = [round(float(x), 7) for x in unit_dsp]
            fused_segment['deepEmbedding'] = [round(float(x), 7) for x in unit_deep]
            fused_segment['embedding'] = [round(float(x), 7) for x in fused_vector]
            fused_segments.append(fused_segment)

        fused_analysis['segments'] = fused_segments
        return fused_analysis


def analyze_track_deep(audio_path: str | Path) -> dict[str, Any]:
    """Top-level functional interface for DeepAudioEncoder.analyze_track_deep."""
    return DeepAudioEncoder().analyze_track_deep(audio_path)


def fuse_multimodal_embeddings(
    dsp_analysis: dict[str, Any], deep_analysis: dict[str, Any], deep_weight: float = 0.7
) -> dict[str, Any]:
    """Top-level functional interface for MultimodalFusionEngine.fuse."""
    return MultimodalFusionEngine.fuse(dsp_analysis, deep_analysis, deep_weight=deep_weight)


__all__ = [
    'HF_CLAP_MODEL_ID',
    'MODEL_LICENSE_REGISTRY',
    'ModelLicenseManager',
    'DeepAudioEncoder',
    'MultimodalFusionEngine',
    'analyze_track_deep',
    'fuse_multimodal_embeddings',
]
