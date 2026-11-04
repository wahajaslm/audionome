"""Stem separation: Demucs (htdemucs / htdemucs_6s) or a fast deterministic MIR fallback.

Splits a recording into vocals, drums, bass and other (plus guitar and piano with htdemucs_6s).
"""
from __future__ import annotations
from pathlib import Path
import librosa
import numpy as np
import soundfile as sf
from musicdna.paths import AUDIO_CACHE_DIR


class StemSeparator:
    """Decomposes audio waveforms into isolated musical stems (6 stems with htdemucs_6s: Vocals, Drums, Bass, Other, Guitar, Piano; or 4 stems with htdemucs/MIR)."""

    def __init__(self, cache_directory: Path = AUDIO_CACHE_DIR) -> None:
        self.cache_directory = cache_directory

    def separate_mir(self, audio_waveform: np.ndarray, sample_rate: int) -> dict[str, np.ndarray]:
        """Separates stems using Harmonic-Percussive Source Separation (HPSS) and spectral formant filtering."""
        if len(audio_waveform) < 256:
            silence = np.zeros_like(audio_waveform)
            return {'vocals': silence, 'drums': silence, 'bass': silence, 'other': silence}

        # 1. HPSS: Separate transients (drums) from tonal harmonic content
        harmonic_component, percussive_component = librosa.effects.hpss(audio_waveform, margin=1.2)
        drums = percussive_component

        # 2. Spectral filtering for Bass, Vocals, Other
        harmonic_stft = librosa.stft(harmonic_component, n_fft=2048, hop_length=512)
        frequencies = librosa.fft_frequencies(sr=sample_rate, n_fft=2048)

        # Bass mask (< 250 Hz)
        bass_mask = (frequencies < 250.0).astype(np.float64)[:, np.newaxis]
        bass_stft = harmonic_stft * bass_mask
        bass = librosa.istft(bass_stft, hop_length=512, length=len(audio_waveform))

        # Vocal mask (300 Hz - 3400 Hz)
        vocal_mask = ((frequencies >= 300.0) & (frequencies <= 3400.0)).astype(np.float64)[:, np.newaxis]
        vocal_stft = harmonic_stft * vocal_mask
        vocals = librosa.istft(vocal_stft, hop_length=512, length=len(audio_waveform))

        # Other accompaniment (remaining mid/high spectrum)
        other_mask = (1.0 - np.clip(bass_mask + vocal_mask, 0.0, 1.0))
        other_stft = harmonic_stft * other_mask
        other = librosa.istft(other_stft, hop_length=512, length=len(audio_waveform))

        max_amplitude = max(1e-4, float(np.max(np.abs(audio_waveform))))
        for stem_array in (vocals, drums, bass, other):
            np.clip(stem_array, -max_amplitude, max_amplitude, out=stem_array)

        return {
            'vocals': vocals.astype(np.float32),
            'drums': drums.astype(np.float32),
            'bass': bass.astype(np.float32),
            'other': other.astype(np.float32),
        }

    def separate_demucs(
        self,
        audio_waveform: np.ndarray,
        sample_rate: int,
        model_name: str = 'htdemucs_6s'
    ) -> dict[str, np.ndarray]:
        """Separates stems using Meta's Demucs deep neural hybrid transformer ('htdemucs_6s' or 'htdemucs')."""
        import torch
        import demucs.api

        target_sr = 44100
        if sample_rate != target_sr:
            audio_44k = librosa.resample(audio_waveform, orig_sr=sample_rate, target_sr=target_sr)
        else:
            audio_44k = audio_waveform

        if audio_44k.ndim == 1:
            tensor = torch.from_numpy(audio_44k).unsqueeze(0).repeat(2, 1).float()
        elif audio_44k.ndim == 2 and audio_44k.shape[0] == 2:
            tensor = torch.from_numpy(audio_44k).float()
        elif audio_44k.ndim == 2 and audio_44k.shape[1] == 2:
            tensor = torch.from_numpy(audio_44k.T).float()
        else:
            tensor = torch.from_numpy(audio_44k.reshape(1, -1)).repeat(2, 1).float()

        separator = demucs.api.Separator(model=model_name)
        _, demucs_stems = separator.separate_tensor(tensor)

        result_stems: dict[str, np.ndarray] = {}
        for stem_name, stem_tensor in demucs_stems.items():
            mono_44k = stem_tensor.mean(dim=0).cpu().numpy().astype(np.float32)
            if sample_rate != target_sr:
                mono_orig = librosa.resample(mono_44k, orig_sr=target_sr, target_sr=sample_rate)
                if len(mono_orig) < len(audio_waveform):
                    mono_orig = np.pad(mono_orig, (0, len(audio_waveform) - len(mono_orig)))
                else:
                    mono_orig = mono_orig[:len(audio_waveform)]
                result_stems[stem_name] = mono_orig.astype(np.float32)
            else:
                if len(mono_44k) < len(audio_waveform):
                    mono_44k = np.pad(mono_44k, (0, len(audio_waveform) - len(mono_44k)))
                else:
                    mono_44k = mono_44k[:len(audio_waveform)]
                result_stems[stem_name] = mono_44k.astype(np.float32)

        return result_stems

    def separate(
        self,
        audio_waveform: np.ndarray,
        sample_rate: int,
        model_family: str = 'auto'
    ) -> dict[str, np.ndarray]:
        """Performs stem separation, using Demucs deep learning when requested, or fast deterministic MIR."""
        if model_family in ('demucs', 'htdemucs', 'htdemucs_6s', '6s', 'demucs_6s'):
            model_name = 'htdemucs' if model_family == 'htdemucs' else 'htdemucs_6s'
            return self.separate_demucs(audio_waveform, sample_rate, model_name=model_name)
        return self.separate_mir(audio_waveform, sample_rate)

    def save_stems_to_cache(
        self,
        track_id: str,
        stems: dict[str, np.ndarray],
        sample_rate: int
    ) -> dict[str, Path]:
        """Persists isolated stem WAV files into the local audio cache directory."""
        stem_directory = self.cache_directory / 'stems' / track_id
        stem_directory.mkdir(parents=True, exist_ok=True)
        cached_paths: dict[str, Path] = {}
        for stem_name, stem_data in stems.items():
            destination = stem_directory / f'{stem_name}.wav'
            sf.write(str(destination), stem_data, sample_rate)
            cached_paths[stem_name] = destination
        return cached_paths

    def get_cached_stem_path(self, track_id: str, stem_name: str) -> Path | None:
        """Retrieves path to an already cached stem audio file."""
        target_path = self.cache_directory / 'stems' / track_id / f'{stem_name}.wav'
        return target_path if target_path.is_file() else None


def separate_stems(audio_waveform: np.ndarray, sample_rate: int, model_family: str = 'auto') -> dict[str, np.ndarray]:
    """Top-level functional interface for StemSeparator.separate."""
    return StemSeparator().separate(audio_waveform, sample_rate, model_family=model_family)



__all__ = ['StemSeparator', 'separate_stems']
