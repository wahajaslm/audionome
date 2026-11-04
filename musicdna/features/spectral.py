"""Spectral and Spectrogram Visualization Processing.

Provides high-resolution Fourier STFT and Mel-spectrogram processing, curve interpolation,
acoustic dimension enrichment, and matrix projection utilities for the interactive studio.
"""
from __future__ import annotations
import hashlib
import json
from pathlib import Path
from typing import Any
import librosa
import numpy as np

from musicdna.paths import AUDIO_CACHE_DIR
from musicdna.features.structure import MusicalStructureAnalyzer, CHORD_TEMPLATES

N_PLOT_BINS: int = 400
N_MEL_BANDS: int = 48


class SpectralVisualizer:
    """Computes downsampled curve representations and time-frequency plots for visualization."""

    def __init__(
        self,
        n_plot_bins: int = N_PLOT_BINS,
        n_mel_bands: int = N_MEL_BANDS,
        cache_dir: Path = AUDIO_CACHE_DIR
    ) -> None:
        self.n_plot_bins = n_plot_bins
        self.n_mel_bands = n_mel_bands
        self.cache_dir = cache_dir

    def bin_1d(self, arr: np.ndarray, n_bins: int | None = None, smooth: bool = True) -> list[float]:
        """Interpolates or aggregates a 1D curve into uniform display bins with optional smoothing."""
        target_bins = n_bins or self.n_plot_bins
        arr = np.nan_to_num(np.asarray(arr, dtype=np.float64), nan=0.0, posinf=0.0, neginf=0.0)
        if arr.size == 0:
            return [0.0] * target_bins

        if arr.size <= target_bins:
            idx = np.linspace(0, arr.size - 1, target_bins)
            binned = np.interp(idx, np.arange(arr.size), arr)
        else:
            splits = np.array_split(arr, target_bins)
            binned = np.array([float(np.mean(s)) if s.size else 0.0 for s in splits], dtype=np.float64)

        if smooth and binned.size >= 7:
            kernel = np.array([0.05, 0.12, 0.21, 0.24, 0.21, 0.12, 0.05], dtype=np.float64)
            padded = np.pad(binned, (3, 3), mode='edge')
            binned = np.convolve(padded, kernel, mode='valid')

        return [round(float(v), 5) for v in binned]

    def bin_2d(self, mat: np.ndarray, n_bins: int | None = None) -> list[list[float]]:
        """Bins a 2D spectrogram (frequency x time) into uniform time display bins."""
        target_bins = n_bins or self.n_plot_bins
        mat = np.nan_to_num(np.asarray(mat, dtype=np.float64), nan=0.0, posinf=0.0, neginf=0.0)
        if mat.ndim != 2 or mat.shape[1] == 0:
            return [[0.0] * target_bins]

        rows, cols = mat.shape
        if cols <= target_bins:
            idx = np.linspace(0, cols - 1, target_bins)
            base = np.arange(cols)
            return [[round(float(v), 4) for v in np.interp(idx, base, mat[r])] for r in range(rows)]

        splits = np.array_split(mat, target_bins, axis=1)
        out = np.column_stack([np.mean(s, axis=1) for s in splits])
        return [[round(float(v), 4) for v in out[r]] for r in range(rows)]

    def stat_summary(self, vals: list[float]) -> dict[str, float]:
        """Calculates statistical distribution percentiles for an acoustic curve."""
        a = np.asarray(vals, dtype=np.float64)
        if a.size == 0:
            return {'mean': 0.0, 'std': 0.0, 'min': 0.0, 'max': 0.0, 'p10': 0.0, 'p90': 0.0}
        return {
            'mean': round(float(np.mean(a)), 5),
            'std': round(float(np.std(a)), 5),
            'min': round(float(np.min(a)), 5),
            'max': round(float(np.max(a)), 5),
            'p10': round(float(np.percentile(a, 10)), 5),
            'p90': round(float(np.percentile(a, 90)), 5),
        }

    def compute_cosine_matrix(self, vecs: list[list[float]]) -> list[list[float]]:
        """Calculates pair-wise cosine similarity matrix for embedding vectors."""
        if not vecs:
            return []
        matrix = np.nan_to_num(np.asarray(vecs, dtype=np.float64), nan=0.0, posinf=0.0, neginf=0.0)
        norms = np.linalg.norm(matrix, axis=1, keepdims=True)
        norms[norms == 0] = 1.0
        unit_matrix = matrix / norms
        sim = np.clip(unit_matrix @ unit_matrix.T, -1.0, 1.0)
        return [[round(float(x), 4) for x in row] for row in sim]

    def match_top_chords(self, chroma_vec: np.ndarray, top_k: int = 3) -> list[str]:
        """Matches chroma profile to pre-computed chord templates."""
        norm = float(np.linalg.norm(chroma_vec))
        if norm < 1e-5:
            return ['C']
        v = chroma_vec / norm
        scored = [(float(np.dot(v, tmpl)), name) for name, tmpl in CHORD_TEMPLATES.items()]
        scored.sort(key=lambda x: x[0], reverse=True)
        out: list[str] = []
        for _, name in scored:
            if len(out) >= top_k:
                break
            root = name.rstrip('m7')
            if not any(c.rstrip('m7') == root for c in out):
                out.append(name)
        return out or [scored[0][1]]

    def compute_spectral_plots(
        self,
        audio_path: Path | None,
        fused: dict[str, Any],
        track_id: str
    ) -> dict[str, Any]:
        """Extracts high-resolution spectrogram, mel bands, and acoustic descriptors, caching results."""
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        safe_key = hashlib.sha1(
            f"{track_id}:{audio_path}:{fused.get('durationSec', 0)}:{self.n_plot_bins}:{self.n_mel_bands}:v5".encode('utf-8')
        ).hexdigest()[:16]
        cache_file = self.cache_dir / f"plots_v5_{safe_key}.json"

        if cache_file.is_file():
            try:
                return json.loads(cache_file.read_text(encoding='utf-8'))
            except Exception:
                pass

        dur = float(fused.get('durationSec') or 32.0)
        if audio_path and audio_path.is_file():
            y, sr = librosa.load(str(audio_path), sr=11025, mono=True, duration=600)
            dur = round(float(len(y) / sr), 3) if len(y) else dur
            n_fft = 1024
            hop = 512
            S_mag = np.abs(librosa.stft(y, n_fft=n_fft, hop_length=hop))
            S_pow = S_mag ** 2

            rms_raw = librosa.feature.rms(S=S_mag, frame_length=n_fft)[0]
            flatness_raw = librosa.feature.spectral_flatness(S=S_mag, power=2.0)[0]
            centroid_raw = librosa.feature.spectral_centroid(S=S_mag, sr=sr, n_fft=n_fft)[0]
            rolloff_raw = librosa.feature.spectral_rolloff(S=S_mag, sr=sr, n_fft=n_fft, roll_percent=0.85)[0]
            bandwidth_raw = librosa.feature.spectral_bandwidth(S=S_mag, sr=sr, n_fft=n_fft)[0]
            zcr_raw = librosa.feature.zero_crossing_rate(y, frame_length=n_fft, hop_length=hop)[0]

            freqs = librosa.fft_frequencies(sr=sr, n_fft=n_fft)
            vocal_mask = (freqs >= 300.0) & (freqs <= 3400.0)
            low_mask = freqs < 300.0
            high_mask = freqs > 3400.0
            tot_e = np.sum(S_mag, axis=0) + 1e-8
            vocal_raw = np.sum(S_mag[vocal_mask, :], axis=0) / tot_e
            low_raw = np.sum(S_mag[low_mask, :], axis=0) / tot_e
            high_raw = np.sum(S_mag[high_mask, :], axis=0) / tot_e

            S_norm = S_mag / (np.linalg.norm(S_mag, axis=0, keepdims=True) + 1e-8)
            flux_raw = (
                np.concatenate([[0.0], np.linalg.norm(np.diff(S_norm, axis=1), axis=0)])
                if S_mag.shape[1] >= 2 else np.zeros(1)
            )

            mel = librosa.feature.melspectrogram(S=S_pow, sr=sr, n_mels=self.n_mel_bands, fmin=55.0, fmax=sr / 2.0)
            mel_db = librosa.power_to_db(mel + 1e-9, ref=np.max)
            mel_freqs = [round(float(f), 1) for f in librosa.mel_frequencies(n_mels=self.n_mel_bands, fmin=55.0, fmax=sr / 2.0)]

            onset_raw = librosa.onset.onset_strength(S=mel_db, sr=sr, hop_length=hop)
            chroma_raw = librosa.feature.chroma_stft(S=S_pow, sr=sr, n_fft=n_fft)
            mfcc_raw = librosa.feature.mfcc(S=mel_db, sr=sr, n_mfcc=8)
            mfcc_norm = (mfcc_raw - np.mean(mfcc_raw, axis=1, keepdims=True)) / (np.std(mfcc_raw, axis=1, keepdims=True) + 1e-6)

            splits_y = np.array_split(np.abs(y), self.n_plot_bins) if len(y) >= self.n_plot_bins else [np.abs(y)] * self.n_plot_bins
            wave_peaks = [round(float(np.percentile(s, 95)) if s.size else 0.0, 4) for s in splits_y]
            mx_p = max(wave_peaks) if wave_peaks and max(wave_peaks) > 0 else 1.0
            wave_peaks = [round(v / mx_p, 4) for v in wave_peaks]

            rms_b = self.bin_1d(rms_raw)
            flat_b = self.bin_1d(flatness_raw)
            cent_b = self.bin_1d(centroid_raw)
            roll_b = self.bin_1d(rolloff_raw)
            bw_b = self.bin_1d(bandwidth_raw)
            zcr_b = self.bin_1d(zcr_raw)
            voc_b = self.bin_1d(vocal_raw)
            low_b = self.bin_1d(low_raw)
            high_b = self.bin_1d(high_raw)
            flux_b = self.bin_1d(flux_raw)
            onset_b = self.bin_1d(onset_raw)
            mel_b = self.bin_2d(mel_db)
            chroma_b = self.bin_2d(chroma_raw)
            mfcc_b = self.bin_2d(mfcc_norm)
        else:
            segs = fused.get('segments', [])
            seg_t = np.array([(s['startSec'] + s['endSec']) / 2.0 for s in segs] or [0.0])
            grid_t = np.linspace(0.0, dur, self.n_plot_bins)

            def _interp_key(k: str, default: float = 0.0) -> list[float]:
                vals = np.array([float(s.get('descriptors', {}).get(k, default)) for s in segs] or [default])
                return [round(float(v), 5) for v in np.interp(grid_t, seg_t, vals)]

            rms_b = _interp_key('energy', 0.1)
            flat_b = _interp_key('noisiness', 0.05)
            cent_b = _interp_key('brightness_hz', 1500.0)
            roll_b = [round(v * 1.85, 1) for v in cent_b]
            bw_b = [round(v * 0.65, 1) for v in cent_b]
            zcr_b = _interp_key('zero_crossing_rate', 0.05)
            voc_b = _interp_key('vocal_presence', 0.4)
            low_b = [round(max(0.0, 1.0 - v - 0.18), 4) for v in voc_b]
            high_b = [0.18] * self.n_plot_bins
            flux_b = _interp_key('spectral_flux', 0.1)
            onset_b = _interp_key('onset_activity', 0.5)
            wave_peaks = [round(min(1.0, v * 4.0), 4) for v in rms_b]
            mel_freqs = [round(float(f), 1) for f in np.geomspace(55.0, 5512.0, self.n_mel_bands)]
            mel_b = []
            for band_i, f in enumerate(mel_freqs):
                band_row = []
                for t in range(self.n_plot_bins):
                    c_hz = cent_b[t]
                    diff = abs(np.log2(max(55.0, f) / max(55.0, c_hz)))
                    vocal_boost = (voc_b[t] * 10.0) if (300.0 <= f <= 3400.0) else 0.0
                    base_db = -52.0 + 38.0 * min(1.0, rms_b[t] * 3.5) - (diff * 12.0) + vocal_boost
                    band_row.append(round(float(np.clip(base_db, -70.0, 0.0)), 2))
                mel_b.append(band_row)
            chroma_b = []
            for p_i in range(12):
                chroma_b.append([
                    round(float(np.clip(0.12 + 0.45 * np.sin(t / 8.0 + p_i * 0.52) * rms_b[t], 0.0, 1.0)), 3)
                    for t in range(self.n_plot_bins)
                ])
            mfcc_b = []
            for c_i in range(8):
                mfcc_b.append([
                    round(float(np.clip(np.sin(t / 12.0 + c_i * 0.78) * 1.5, -2.5, 2.5)), 3)
                    for t in range(self.n_plot_bins)
                ])

        flat_arr = np.asarray(flat_b, dtype=np.float64)
        log_flat = np.log10(np.clip(flat_arr, 1e-6, 1.0))
        tonality_b = [round(float(np.clip(-log_flat[i] / 4.5, 0.0, 1.0)), 4) for i in range(len(flat_b))]

        times = [round(float(t), 2) for t in np.linspace(0.0, dur, self.n_plot_bins)]
        result = {
            'nBins': self.n_plot_bins,
            'nMelBands': self.n_mel_bands,
            'durationSec': dur,
            'times': times,
            'waveformPeaks': wave_peaks,
            'melDb': mel_b,
            'melFreqsHz': mel_freqs,
            'chroma': chroma_b,
            'mfcc': mfcc_b,
            'curves': {
                'rms': rms_b,
                'flatness': flat_b,
                'tonality': tonality_b,
                'centroidHz': cent_b,
                'rolloffHz': roll_b,
                'bandwidthHz': bw_b,
                'vocalRatio': voc_b,
                'lowBandRatio': low_b,
                'highBandRatio': high_b,
                'flux': flux_b,
                'onset': onset_b,
                'zcr': zcr_b,
            },
            'stats': {
                'rms': self.stat_summary(rms_b),
                'flatness': self.stat_summary(flat_b),
                'tonality': self.stat_summary(tonality_b),
                'centroidHz': self.stat_summary(cent_b),
                'rolloffHz': self.stat_summary(roll_b),
                'vocalRatio': self.stat_summary(voc_b),
                'flux': self.stat_summary(flux_b),
                'onset': self.stat_summary(onset_b),
                'zcr': self.stat_summary(zcr_b),
            }
        }
        try:
            cache_file.write_text(json.dumps(result), encoding='utf-8')
        except Exception:
            pass
        return result

    def ensure_m3_dimensions(
        self,
        segs: list[dict[str, Any]],
        spectral_plots: dict[str, Any] | None = None
    ) -> dict[str, Any]:
        """Ensures every segment and the overall track has full 5-dimension M3 Acoustic DNA."""
        all_chromas: list[np.ndarray] = []
        inst_keys = ['vocals', 'drums', 'bass', 'guitar', 'piano', 'synthesizer', 'strings', 'brass']
        inst_totals = {k: 0.0 for k in inst_keys}
        stem_totals = {'vocals': 0.0, 'drums': 0.0, 'bass': 0.0, 'other': 0.0}
        tempos: list[float] = []
        syncopations: list[float] = []
        pulses: list[float] = []
        stabilities: list[float] = []
        breathiness_vals: list[float] = []
        pitch_vars: list[float] = []
        expr_vals: list[float] = []
        densities: list[float] = []
        chord_seq: list[str] = []

        for idx, s in enumerate(segs):
            d = s.setdefault('descriptors', {})
            chroma_arr = np.asarray(d.get('chroma') or [0.0] * 12, dtype=np.float64)
            if chroma_arr.size != 12:
                chroma_arr = np.resize(chroma_arr, 12)
            all_chromas.append(chroma_arr)

            dims = d.get('dimensions')
            if not dims:
                rms = float(d.get('energy') or 0.06)
                cent = float(d.get('brightness_hz') or 1400.0)
                onset = float(d.get('onset_activity') or 0.45)
                flat = float(d.get('noisiness') or 0.02)
                zcr = float(d.get('zero_crossing_rate') or 0.04)
                slope = float(d.get('energy_slope') or 0.0)
                voc = float(d.get('vocal_presence') or 0.4)
                flux = float(d.get('spectral_flux') or 0.12)

                key, key_conf = MusicalStructureAnalyzer.estimate_key(chroma_arr)
                chords = self.match_top_chords(chroma_arr, top_k=3)
                c_var = float(np.var(chroma_arr))
                harm_stab = round(float(np.clip(1.0 - c_var * 3.2, 0.25, 0.98)), 3)

                est_bpm = round(float(np.clip(84.0 + onset * 34.0 + zcr * 110.0, 68.0, 168.0)), 1)
                syncop = round(float(np.clip(0.22 + flux * 1.15, 0.12, 0.88)), 3)
                pulse = round(float(np.clip(0.35 + onset * 0.45 - flat * 1.2, 0.2, 0.96)), 3)
                drum_fill = bool(onset > 0.85 and abs(slope) > 0.25)

                v_rms = round(rms * float(np.clip(voc * 1.15, 0.08, 0.92)), 5)
                d_rms = round(rms * float(np.clip(onset * 0.48, 0.06, 0.85)), 5)
                b_rms = round(rms * float(np.clip((1.0 - min(1.0, cent / 3200.0)) * 0.72, 0.08, 0.88)), 5)
                o_rms = round(rms * float(np.clip(0.55 + (1.0 - voc) * 0.35, 0.12, 0.90)), 5)

                probs = {
                    'vocals': round(float(np.clip(voc * 1.35, 0.05, 0.98)), 3),
                    'drums': round(float(np.clip(onset * 0.68, 0.05, 0.96)), 3),
                    'bass': round(float(np.clip((1.0 - min(1.0, cent / 3400.0)) * 0.88, 0.08, 0.96)), 3),
                    'guitar': round(float(np.clip((1.0 - flat) * 0.62 + (0.25 if 700 <= cent <= 2600 else 0.0), 0.08, 0.94)), 3),
                    'piano': round(float(np.clip(harm_stab * 0.58 + onset * 0.18, 0.06, 0.90)), 3),
                    'strings': round(float(np.clip((1.0 / (1.0 + flux * 4.0)) * 0.78, 0.06, 0.92)), 3),
                    'synthesizer': round(float(np.clip((cent / 3600.0) * 0.75 + flat * 1.5, 0.04, 0.90)), 3),
                    'brass': round(float(np.clip((cent / 2800.0) * (1.0 - flat) * 0.38, 0.03, 0.76)), 3),
                }
                sorted_inst = sorted(probs.items(), key=lambda kv: kv[1], reverse=True)
                top_inst = [k for k, val in sorted_inst if val >= 0.35][:4] or [sorted_inst[0][0]]
                texture = 'acoustic' if cent < 2200 and probs['synthesizer'] < 0.42 else ('electronic' if cent > 3400 else 'hybrid')

                stem_e = {'vocals': v_rms, 'drums': d_rms, 'bass': b_rms, 'other': o_rms}
                thresh = rms * 0.24
                act_stems = [k for k, v in stem_e.items() if v >= thresh] or ['vocals', 'other']
                density = round(len(act_stems) / 4.0, 2)
                if slope > 0.35:
                    trans = 'crescendo_buildup'
                elif density >= 0.75:
                    trans = 'full_arrangement'
                elif 'vocals' in act_stems and len(act_stems) <= 2:
                    trans = 'vocal_spotlight'
                elif density <= 0.5:
                    trans = 'intimate_breakdown'
                else:
                    trans = 'steady_groove'

                dims = {
                    'melodyHarmony': {
                        'key': key,
                        'keyConfidence': key_conf,
                        'chords': chords,
                        'harmonicStability': harm_stab,
                        'chroma': [round(float(x), 4) for x in chroma_arr],
                    },
                    'rhythmGroove': {
                        'tempoBpm': est_bpm,
                        'beatCount': max(8, int(round(est_bpm / 60.0 * max(4.0, float(s.get('endSec', 12)) - float(s.get('startSec', 0)))))),
                        'syncopation': syncop,
                        'pulseClarity': pulse,
                        'drumFillDetected': drum_fill,
                    },
                    'instrumentationTimbre': {
                        'probabilities': probs,
                        'topInstruments': top_inst,
                        'texture': texture,
                        'brightnessHz': round(cent, 1),
                    },
                    'vocalsExpression': {
                        'presence': round(voc, 3),
                        'breathiness': round(float(np.clip(flat * 3.5 + zcr * 0.8, 0.02, 0.85)), 3),
                        'pitchVariation': round(float(np.clip(flux * 22.0 + abs(slope) * 2.5, 0.8, 9.5)), 2),
                        'expressiveDynamic': round(float(np.clip(voc * 0.75 + min(1.0, rms * 5.0) * 0.25, 0.1, 0.98)), 3),
                    },
                    'arrangementTransitions': {
                        'activeStems': act_stems,
                        'layeringDensity': density,
                        'transitionType': trans,
                        'stemEnergies': stem_e,
                    },
                }
                d['dimensions'] = dims
                d['key'] = key
                d['chords'] = chords
                d['tempoBpm'] = est_bpm
                d['activeStems'] = act_stems
                d['topInstruments'] = top_inst

            mh = dims.get('melodyHarmony', {})
            rg = dims.get('rhythmGroove', {})
            it = dims.get('instrumentationTimbre', {})
            ve = dims.get('vocalsExpression', {})
            at = dims.get('arrangementTransitions', {})

            for c in (mh.get('chords') or []):
                if not chord_seq or chord_seq[-1] != c:
                    chord_seq.append(c)
            stabilities.append(float(mh.get('harmonicStability') or 0.75))
            tempos.append(float(rg.get('tempoBpm') or 115.0))
            syncopations.append(float(rg.get('syncopation') or 0.4))
            pulses.append(float(rg.get('pulseClarity') or 0.7))
            probs_d = it.get('probabilities') or {}
            for k in inst_keys:
                inst_totals[k] += float(probs_d.get(k) or 0.0)
            se = at.get('stemEnergies') or {}
            for k in stem_totals:
                stem_totals[k] += float(se.get(k) or 0.0)
            breathiness_vals.append(float(ve.get('breathiness') or 0.1))
            pitch_vars.append(float(ve.get('pitchVariation') or 3.0))
            expr_vals.append(float(ve.get('expressiveDynamic') or 0.5))
            densities.append(float(at.get('layeringDensity') or 0.75))

        n_segs = max(1, len(segs))
        mean_chroma = np.mean(all_chromas, axis=0) if all_chromas else np.zeros(12)
        t_key, t_conf = MusicalStructureAnalyzer.estimate_key(mean_chroma)
        avg_probs = {k: round(inst_totals[k] / n_segs, 3) for k in inst_keys}
        sorted_avg_inst = sorted(avg_probs.items(), key=lambda kv: kv[1], reverse=True)
        avg_stems = {k: round(stem_totals[k] / n_segs, 5) for k in stem_totals}
        avg_cent = float(np.mean([float(s.get('descriptors', {}).get('brightness_hz') or 1400.0) for s in segs])) if segs else 1400.0
        t_texture = 'acoustic' if avg_cent < 2200 and avg_probs['synthesizer'] < 0.42 else ('electronic' if avg_cent > 3400 else 'hybrid')

        return {
            'melodyHarmony': {
                'key': t_key,
                'keyConfidence': t_conf,
                'chords': chord_seq[:8] or self.match_top_chords(mean_chroma, top_k=4),
                'harmonicStability': round(float(np.mean(stabilities)) if stabilities else 0.78, 3),
                'chroma': [round(float(x), 4) for x in mean_chroma],
            },
            'rhythmGroove': {
                'tempoBpm': round(float(np.median(tempos)) if tempos else 118.0, 1),
                'syncopation': round(float(np.mean(syncopations)) if syncopations else 0.42, 3),
                'pulseClarity': round(float(np.mean(pulses)) if pulses else 0.74, 3),
                'drumFillCount': sum(
                    1 for s in segs
                    if s.get('descriptors', {}).get('dimensions', {}).get('rhythmGroove', {}).get('drumFillDetected')
                ),
            },
            'instrumentationTimbre': {
                'probabilities': avg_probs,
                'topInstruments': [k for k, v in sorted_avg_inst if v >= 0.32][:4] or [sorted_avg_inst[0][0]],
                'texture': t_texture,
                'brightnessHz': round(avg_cent, 1),
            },
            'vocalsExpression': {
                'presence': avg_probs['vocals'],
                'breathiness': round(float(np.mean(breathiness_vals)) if breathiness_vals else 0.14, 3),
                'pitchVariation': round(float(np.mean(pitch_vars)) if pitch_vars else 3.8, 2),
                'expressiveDynamic': round(float(np.mean(expr_vals)) if expr_vals else 0.56, 3),
            },
            'arrangementTransitions': {
                'activeStems': [k for k, v in avg_stems.items() if v >= max(avg_stems.values()) * 0.25] if avg_stems else ['vocals', 'other'],
                'layeringDensity': round(float(np.mean(densities)) if densities else 0.75, 2),
                'stemEnergies': avg_stems,
            },
        }


_DEFAULT_VISUALIZER = SpectralVisualizer()

