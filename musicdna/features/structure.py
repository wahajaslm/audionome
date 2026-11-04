"""Musical structure from audio: key, chords, rhythm, instrumentation, vocal expression, arrangement.

Scores five musical dimensions per window:
1. Melody & Harmony: Key detection, chord progression tracking, harmonic stability
2. Rhythm & Groove: Tempo (BPM), beat regularity, syncopation index, drum fill activity
3. Instrumentation & Timbre: Probabilistic instrument presence (guitar, piano, bass, drums, synth, strings, brass, vocals)
4. Vocals & Expression: Vocal pitch movement, vibrato, breathiness, and expressive dynamics
5. Arrangement & Transitions: Active stem layering, build-up, drop, breakdown, and solo detection
"""
from __future__ import annotations
from typing import Any
import librosa
import numpy as np
from musicdna.audio.beats import tempo_from_beats
from musicdna.audio.stems import StemSeparator


# Krumhansl-Schmuckler Key Profiles (12 pitch classes: C, C#, D, D#, E, F, F#, G, G#, A, A#, B)
PITCH_CLASSES: list[str] = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
MAJOR_PROFILE: np.ndarray = np.array([6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88], dtype=np.float64)
MINOR_PROFILE: np.ndarray = np.array([6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17], dtype=np.float64)

# Chord templates (12-D binary indicators for root, third, fifth)
CHORD_TEMPLATES: dict[str, np.ndarray] = {}
for root_idx, root_note in enumerate(PITCH_CLASSES):
    # Major triad: root, +4, +7
    major_template = np.zeros(12, dtype=np.float64)
    major_template[root_idx] = 1.0
    major_template[(root_idx + 4) % 12] = 1.0
    major_template[(root_idx + 7) % 12] = 1.0
    CHORD_TEMPLATES[root_note] = major_template / np.linalg.norm(major_template)

    # Minor triad: root, +3, +7
    minor_template = np.zeros(12, dtype=np.float64)
    minor_template[root_idx] = 1.0
    minor_template[(root_idx + 3) % 12] = 1.0
    minor_template[(root_idx + 7) % 12] = 1.0
    CHORD_TEMPLATES[f'{root_note}m'] = minor_template / np.linalg.norm(minor_template)

    # Dominant 7th: root, +4, +7, +10
    dominant_template = np.zeros(12, dtype=np.float64)
    dominant_template[root_idx] = 1.0
    dominant_template[(root_idx + 4) % 12] = 1.0
    dominant_template[(root_idx + 7) % 12] = 1.0
    dominant_template[(root_idx + 10) % 12] = 0.8
    CHORD_TEMPLATES[f'{root_note}7'] = dominant_template / np.linalg.norm(dominant_template)



class MusicalStructureAnalyzer:
    """Extracts structural musical properties: key, chords, rhythm, instrument probabilities, and arrangement dynamics."""

    def __init__(self, chord_templates: dict[str, np.ndarray] | None = None) -> None:
        self.chord_templates = chord_templates or CHORD_TEMPLATES

    @staticmethod
    def estimate_key(chroma_mean: np.ndarray) -> tuple[str, float]:
        """Estimates musical key and detection confidence via Krumhansl-Schmuckler profile correlation."""
        if chroma_mean.size != 12:
            return 'Unknown', 0.0

        centered_chroma = chroma_mean - np.mean(chroma_mean)
        vector_norm = np.linalg.norm(centered_chroma)
        if vector_norm < 1e-6:
            return 'C Major', 0.1

        normalized_chroma = centered_chroma / vector_norm
        best_key = 'C Major'
        best_correlation = -1.0

        for shift_index, root_note in enumerate(PITCH_CLASSES):
            # Major key profile
            major_profile_shifted = np.roll(MAJOR_PROFILE, shift_index)
            major_profile_centered = (major_profile_shifted - np.mean(major_profile_shifted)) / np.linalg.norm(major_profile_shifted - np.mean(major_profile_shifted))
            correlation_major = float(np.dot(normalized_chroma, major_profile_centered))
            if correlation_major > best_correlation:
                best_correlation = correlation_major
                best_key = f'{root_note} Major'

            # Minor key profile
            minor_profile_shifted = np.roll(MINOR_PROFILE, shift_index)
            minor_profile_centered = (minor_profile_shifted - np.mean(minor_profile_shifted)) / np.linalg.norm(minor_profile_shifted - np.mean(minor_profile_shifted))
            correlation_minor = float(np.dot(normalized_chroma, minor_profile_centered))
            if correlation_minor > best_correlation:
                best_correlation = correlation_minor
                best_key = f'{root_note} Minor'

        confidence_score = round(float(np.clip((best_correlation + 1.0) / 2.0, 0.0, 1.0)), 3)
        return best_key, confidence_score

    def estimate_chords(self, chroma_frames: np.ndarray, hop_frames: int = 10) -> list[str]:
        """Detects sequential chord symbols by matching chroma frames against triad templates."""
        if chroma_frames.ndim != 2 or chroma_frames.shape[1] == 0:
            return []

        total_frames = chroma_frames.shape[1]
        detected_chords: list[str] = []
        step_size = max(1, hop_frames)

        for frame_start in range(0, total_frames, step_size):
            frame_window = chroma_frames[:, frame_start:min(total_frames, frame_start + step_size)]
            mean_vector = np.mean(frame_window, axis=1)
            norm = np.linalg.norm(mean_vector)
            if norm < 1e-4:
                continue
            normalized_vector = mean_vector / norm

            best_chord_name = ''
            highest_similarity = -1.0
            for chord_name, template_vector in self.chord_templates.items():
                similarity = float(np.dot(normalized_vector, template_vector))
                if similarity > highest_similarity:
                    highest_similarity = similarity
                    best_chord_name = chord_name

            if best_chord_name and (not detected_chords or detected_chords[-1] != best_chord_name):
                detected_chords.append(best_chord_name)

        return detected_chords[:8]

    def predict_instruments_probabilistic(
        self,
        audio_signal: np.ndarray,
        sample_rate: int,
        stems: dict[str, np.ndarray] | None = None
    ) -> dict[str, float]:
        """Predicts presence probabilities across primary instrument categories."""
        if stems is None:
            stems = StemSeparator().separate_mir(audio_signal, sample_rate)

        mix_rms = float(np.mean(audio_signal ** 2) ** 0.5) or 1e-6
        vocal_rms = float(np.mean(stems['vocals'] ** 2) ** 0.5)
        drum_rms = float(np.mean(stems['drums'] ** 2) ** 0.5)
        bass_rms = float(np.mean(stems['bass'] ** 2) ** 0.5)
        other_rms = float(np.mean(stems['other'] ** 2) ** 0.5)

        other_stft = np.abs(librosa.stft(stems['other'], n_fft=2048, hop_length=512))
        frequencies = librosa.fft_frequencies(sr=sample_rate, n_fft=2048)
        other_energy = float(np.sum(other_stft)) or 1.0

        guitar_mask = (frequencies >= 200.0) & (frequencies <= 2500.0)
        guitar_ratio = float(np.sum(other_stft[guitar_mask, :])) / other_energy

        spectral_flatness = float(np.mean(librosa.feature.spectral_flatness(y=audio_signal, hop_length=512)))
        onset_envelope = librosa.onset.onset_strength(y=stems['other'], sr=sample_rate, hop_length=512)
        piano_attack = float(np.std(onset_envelope)) / (float(np.mean(onset_envelope)) + 1e-4)

        if other_stft.shape[1] >= 2:
            flux_difference = np.diff(other_stft, axis=1)
            sustained_smoothness = 1.0 / (1.0 + float(np.mean(np.abs(flux_difference))))
        else:
            sustained_smoothness = 0.5

        centroid = float(np.mean(librosa.feature.spectral_centroid(y=audio_signal, sr=sample_rate, hop_length=512)))

        return {
            'vocals': round(float(np.clip((vocal_rms / mix_rms) * 1.7, 0.05, 0.98)), 3),
            'drums': round(float(np.clip((drum_rms / mix_rms) * 1.8, 0.05, 0.98)), 3),
            'bass': round(float(np.clip((bass_rms / mix_rms) * 1.9, 0.05, 0.98)), 3),
            'guitar': round(float(np.clip((other_rms / mix_rms) * guitar_ratio * 2.2, 0.05, 0.95)), 3),
            'piano': round(float(np.clip((other_rms / mix_rms) * min(1.0, piano_attack * 0.4), 0.05, 0.92)), 3),
            'synthesizer': round(float(np.clip((centroid / 3500.0) * (other_rms / mix_rms) * 1.4, 0.05, 0.92)), 3),
            'strings': round(float(np.clip((other_rms / mix_rms) * sustained_smoothness * 0.8, 0.02, 0.88)), 3),
            'brass': round(float(np.clip((other_rms / mix_rms) * (1.0 - spectral_flatness) * 0.4, 0.02, 0.75)), 3),
        }

    def analyze_dimensions(
        self,
        audio_signal: np.ndarray,
        sample_rate: int,
        stems: dict[str, np.ndarray] | None = None,
        beat_times: np.ndarray | None = None,
    ) -> dict[str, Any]:
        """Analyzes all five core musical dimensions.

        beat_times: beats in seconds relative to this signal, from the track-level beat grid.
        When given, tempo and beat positions come from it instead of librosa on the drum stem.
        """
        if stems is None:
            stems = StemSeparator().separate_mir(audio_signal, sample_rate)

        mix_rms = float(np.mean(audio_signal ** 2) ** 0.5) or 1e-6
        vocal_rms = float(np.mean(stems['vocals'] ** 2) ** 0.5)
        drum_rms = float(np.mean(stems['drums'] ** 2) ** 0.5)
        bass_rms = float(np.mean(stems['bass'] ** 2) ** 0.5)
        other_rms = float(np.mean(stems['other'] ** 2) ** 0.5)

        # 1. Melody & Harmony
        chroma_stft = librosa.feature.chroma_stft(y=audio_signal, sr=sample_rate, hop_length=512)
        chroma_mean = np.mean(chroma_stft, axis=1) if chroma_stft.size else np.zeros(12)
        key, key_confidence = self.estimate_key(chroma_mean)
        chords = self.estimate_chords(chroma_stft)
        chroma_variance = float(np.mean(np.var(chroma_stft, axis=1))) if chroma_stft.size else 0.0
        harmonic_stability = round(float(np.clip(1.0 - chroma_variance * 4.0, 0.0, 1.0)), 3)

        melody_harmony = {
            'key': key,
            'keyConfidence': key_confidence,
            'chords': chords,
            'harmonicStability': harmonic_stability,
            'chroma': [round(float(x), 4) for x in chroma_mean],
        }

        # 2. Rhythm & Groove
        grid_tempo = tempo_from_beats(beat_times) if beat_times is not None else None
        if grid_tempo is not None:
            tempo_bpm = grid_tempo
            beat_frames = librosa.time_to_frames(np.asarray(beat_times), sr=sample_rate, hop_length=512)
        else:
            try:
                tempo_result, beat_frames = librosa.beat.beat_track(y=stems['drums'], sr=sample_rate, hop_length=512)
                tempo_bpm = float(tempo_result[0]) if isinstance(tempo_result, (list, np.ndarray)) else float(tempo_result)
            except Exception:
                tempo_bpm = 120.0
                beat_frames = np.array([])

        onset_drums = librosa.onset.onset_strength(y=stems['drums'], sr=sample_rate, hop_length=512)
        beat_count = len(beat_frames)

        if beat_count >= 2 and onset_drums.size > 0:
            beat_mask = np.zeros(len(onset_drums), dtype=bool)
            valid_beats = beat_frames[beat_frames < len(onset_drums)]
            beat_mask[valid_beats] = True
            on_beat_energy = float(np.sum(onset_drums[beat_mask])) or 1e-4
            off_beat_energy = float(np.sum(onset_drums[~beat_mask])) or 1e-4
            syncopation_index = round(float(np.clip(off_beat_energy / (on_beat_energy + off_beat_energy), 0.0, 1.0)), 3)
        else:
            syncopation_index = 0.35

        pulse_clarity = (
            round(float(np.clip(float(np.std(onset_drums)) / (float(np.mean(onset_drums)) + 1e-4) * 0.3, 0.0, 1.0)), 3)
            if onset_drums.size else 0.5
        )
        drum_fill = bool(
            pulse_clarity > 0.75 and
            float(np.max(onset_drums) if onset_drums.size else 0) > 3.0 * (float(np.mean(onset_drums)) + 1e-4)
        )

        rhythm_groove = {
            'tempoBpm': round(tempo_bpm, 1),
            'beatCount': int(beat_count),
            'syncopation': syncopation_index,
            'pulseClarity': pulse_clarity,
            'drumFillDetected': drum_fill,
        }

        # 3. Instrumentation & Timbre
        instrument_probabilities = self.predict_instruments_probabilistic(audio_signal, sample_rate, stems=stems)
        sorted_instruments = sorted(instrument_probabilities.items(), key=lambda item: item[1], reverse=True)
        top_instruments = [name for name, score in sorted_instruments if score >= 0.35][:4]
        if not top_instruments and sorted_instruments:
            top_instruments = [sorted_instruments[0][0]]

        spectral_centroid = float(np.mean(librosa.feature.spectral_centroid(y=audio_signal, sr=sample_rate, hop_length=512)))
        texture_type = 'acoustic' if spectral_centroid < 2200 and instrument_probabilities.get('synthesizer', 0) < 0.4 else ('electronic' if spectral_centroid > 3800 else 'hybrid')

        instrumentation_timbre = {
            'probabilities': instrument_probabilities,
            'topInstruments': top_instruments,
            'texture': texture_type,
            'brightnessHz': round(spectral_centroid, 1),
        }

        # 4. Vocals & Expression
        vocal_presence = round(float(np.clip(vocal_rms / mix_rms, 0.0, 1.0)), 3)
        vocal_flatness = float(np.mean(librosa.feature.spectral_flatness(y=stems['vocals'], hop_length=512))) if vocal_rms > 1e-4 else 0.0
        vocal_stft = np.abs(librosa.stft(stems['vocals'], n_fft=2048, hop_length=512))
        peak_bins = np.argmax(vocal_stft[10:150, :], axis=0) + 10 if vocal_stft.shape[1] > 0 else np.array([])
        pitch_variation = round(float(np.std(peak_bins)), 2) if len(peak_bins) > 4 else 0.0

        vocals_expression = {
            'presence': vocal_presence,
            'breathiness': round(float(vocal_flatness), 3),
            'pitchVariation': pitch_variation,
            'expressiveDynamic': round(float(np.clip(vocal_rms * 12.0, 0.0, 1.0)), 3),
        }

        # 5. Arrangement & Transitions
        stem_energies = {
            'vocals': round(vocal_rms, 5),
            'drums': round(drum_rms, 5),
            'bass': round(bass_rms, 5),
            'other': round(other_rms, 5),
        }
        for extra_stem in ('guitar', 'piano'):
            if extra_stem in stems:
                extra_rms = float(np.mean(stems[extra_stem] ** 2) ** 0.5)
                stem_energies[extra_stem] = round(extra_rms, 5)

        active_stems = [stem for stem, energy in stem_energies.items() if energy > mix_rms * 0.25]
        total_stems_count = max(4, len(stem_energies))
        layering_density = round(len(active_stems) / float(total_stems_count), 2)
        transition_type = 'drop' if ('drums' in active_stems and 'bass' in active_stems and layering_density >= 0.75) else (
            'breakdown' if layering_density <= 0.5 and ('vocals' in active_stems or 'other' in active_stems) else 'standard'
        )

        arrangement_transitions = {
            'activeStems': active_stems,
            'layeringDensity': layering_density,
            'transitionType': transition_type,
            'stemEnergies': stem_energies,
        }

        return {
            'melodyHarmony': melody_harmony,
            'rhythmGroove': rhythm_groove,
            'instrumentationTimbre': instrumentation_timbre,
            'vocalsExpression': vocals_expression,
            'arrangementTransitions': arrangement_transitions,
        }


def analyze_musical_dimensions(audio_signal: np.ndarray, sample_rate: int, stems: dict[str, np.ndarray] | None = None) -> dict[str, Any]:
    """Top-level functional interface for MusicalStructureAnalyzer.analyze_dimensions."""
    return MusicalStructureAnalyzer().analyze_dimensions(audio_signal, sample_rate, stems=stems)


__all__ = ['PITCH_CLASSES', 'MAJOR_PROFILE', 'MINOR_PROFILE', 'CHORD_TEMPLATES',
           'MusicalStructureAnalyzer', 'analyze_musical_dimensions']
