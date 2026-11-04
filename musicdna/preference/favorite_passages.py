"""FAV Corpus Methodology Integration (Lustig & Tan, 15-Second Favorite Passage Corpus).

Implements:
1. Canonical FAV 15-second passage schema and musical-reason taxonomy.
2. Listener free-text explanation parser mapping natural-language descriptions to FAV categories.
3. Passage-vs-Song Acoustic Contrast analysis (comparing a favorite 15s window against its surrounding track).
4. Reproducible FAV benchmark evaluation testing acoustic-reason alignment and favorite-passage ranking.
"""
from __future__ import annotations
from dataclasses import dataclass, field, asdict
from pathlib import Path
from typing import Any
import numpy as np

FAV_WINDOW_SECONDS: float = 15.0

FAV_REASON_TAXONOMY: dict[str, dict[str, Any]] = {
    'Vocals': {
        'description': 'Expressive vocal delivery, vocal timbre, harmonies, or melodic singing',
        'keywords': ['vocal', 'voice', 'sing', 'singer', 'choir', 'falsetto', 'belt', 'vibrato', 'harmonizing'],
        'acoustic_correlates': ['vocal_presence', 'brightness_hz'],
    },
    'Build-up': {
        'description': 'Gradually intensifying arrangement, rising tension, or crescendo',
        'keywords': ['build', 'intensif', 'crescendo', 'rising', 'grow', 'swell', 'climactic', 'escalat'],
        'acoustic_correlates': ['energy_slope', 'spectral_flux'],
    },
    'Drop': {
        'description': 'Climactic beat drop, dynamic arrival, or structural release',
        'keywords': ['drop', 'climax', 'hit', 'explosion', 'release', 'chorus arrival', 'impact'],
        'acoustic_correlates': ['energy', 'onset_activity'],
    },
    'Melody': {
        'description': 'Memorable melodic hook, contour, or motif',
        'keywords': ['melod', 'hook', 'tune', 'motif', 'riff', 'catchy', 'line'],
        'acoustic_correlates': ['vocal_presence', 'brightness_hz'],
    },
    'Rhythm': {
        'description': 'Groove, syncopation, drum pattern, or rhythmic drive',
        'keywords': ['rhythm', 'groove', 'beat', 'drum', 'percussion', 'syncopat', 'tempo', 'pulse'],
        'acoustic_correlates': ['onset_activity', 'energy'],
    },
    'Harmony': {
        'description': 'Chord progression, key change, modulation, or harmonic resolution',
        'keywords': ['harmon', 'chord', 'modulation', 'key change', 'progression', 'minor', 'major', 'resolve'],
        'acoustic_correlates': ['chroma', 'spectral_flux'],
    },
    'Instruments': {
        'description': 'Specific instrumental timbre, bassline, solo, or arrangement interplay',
        'keywords': ['instrument', 'guitar', 'piano', 'synth', 'bass', 'strings', 'brass', 'arrangement', 'solo'],
        'acoustic_correlates': ['brightness_hz', 'spectral_flux'],
    },
    'Atmosphere': {
        'description': 'Sonic texture, spaciousness, ambient production, or soundstage',
        'keywords': ['atmosphere', 'texture', 'ambient', 'space', 'reverb', 'ethereal', 'lush', 'warm', 'pad'],
        'acoustic_correlates': ['noisiness', 'brightness_hz'],
    },
    'Lyrics': {
        'description': 'Poetic phrasing, emotional words, or narrative meaning',
        'keywords': ['lyric', 'word', 'line', 'story', 'meaning', 'poetic', 'phrase'],
        'acoustic_correlates': ['vocal_presence'],
    },
}


@dataclass
class FAVAnnotation:
    """Represents a canonical 15-second favorite passage annotation with listener intent."""
    passage_id: str
    track_id: str
    listener_id: str
    start_sec: float
    end_sec: float
    reasons: list[str]
    feelings: list[str] = field(default_factory=list)
    explanation: str = ''
    familiarity: int = 4  # 1-5 scale per FAV/TROMPA protocol
    intensity_rating: float = 0.8  # 0.0-1.0

    @property
    def duration_sec(self) -> float:
        return round(self.end_sec - self.start_sec, 3)

    def to_dict(self) -> dict[str, Any]:
        return {
            'passageId': self.passage_id,
            'trackId': self.track_id,
            'listenerId': self.listener_id,
            'startSec': self.start_sec,
            'endSec': self.end_sec,
            'durationSec': self.duration_sec,
            'reasons': self.reasons,
            'feelings': self.feelings,
            'explanation': self.explanation,
            'familiarity': self.familiarity,
            'intensityRating': self.intensity_rating,
        }


@dataclass(frozen=True)
class PassageContrastMetrics:
    """Measured acoustic difference between a passage and the remainder of the recording."""
    status: str
    energy_ratio: float
    brightness_delta_hz: float
    onset_ratio: float
    vocal_presence: float
    vocal_presence_delta: float
    energy_slope: float
    spectral_flux: float
    corroborated_reasons: list[str]

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


class FavoritePassageTaxonomy:
    """Classifier mapping natural-language descriptions and tags to canonical FAV categories."""

    def __init__(self, taxonomy: dict[str, dict[str, Any]] | None = None) -> None:
        self.taxonomy = taxonomy or FAV_REASON_TAXONOMY

    def classify(self, explanation: str, explicit_qualities: list[str] | None = None) -> list[str]:
        """Maps free-text explanations and/or user tag chips to canonical reason taxonomy."""
        matched_categories: list[str] = []
        if explicit_qualities:
            for quality in explicit_qualities:
                for canonical in self.taxonomy:
                    if quality.lower() == canonical.lower() and canonical not in matched_categories:
                        matched_categories.append(canonical)

        text_lower = (explanation or '').lower()
        if text_lower:
            for canonical, metadata in self.taxonomy.items():
                if any(keyword in text_lower for keyword in metadata['keywords']):
                    if canonical not in matched_categories:
                        matched_categories.append(canonical)
        return matched_categories

    classify_explanation = classify


_DEFAULT_TAXONOMY = FavoritePassageTaxonomy()


class AcousticContrastAnalyzer:
    """Computes acoustic contrast between a focal passage and the surrounding track context."""

    @staticmethod
    def _mean_descriptor(segments: list[dict[str, Any]], descriptor_key: str, default_value: float = 0.0) -> float:
        values = [float(s.get('descriptors', {}).get(descriptor_key, default_value)) for s in segments]
        return float(np.mean(values)) if values else default_value

    def analyze_contrast(
        self,
        track_analysis: dict[str, Any],
        start_seconds: float,
        end_seconds: float
    ) -> dict[str, Any]:
        """Computes passage-vs-track contrast metrics and corroborates musical reasons."""
        segments = track_analysis.get('segments', [])
        if not segments:
            return {'status': 'no_segments'}

        in_passage = [
            s for s in segments
            if (min(end_seconds, s['endSec']) - max(start_seconds, s['startSec'])) >= 6.0
        ]
        if not in_passage:
            in_passage = [
                s for s in segments
                if max(start_seconds, s['startSec']) < min(end_seconds, s['endSec'])
            ]
        out_passage = [s for s in segments if s not in in_passage]

        if not in_passage:
            in_passage = [min(segments, key=lambda s: abs(s['startSec'] - start_seconds))]
        if not out_passage:
            out_passage = segments

        passage_energy = self._mean_descriptor(in_passage, 'energy')
        background_energy = self._mean_descriptor(out_passage, 'energy', 1e-4)
        passage_brightness = self._mean_descriptor(in_passage, 'brightness_hz')
        background_brightness = self._mean_descriptor(out_passage, 'brightness_hz', 1.0)
        passage_onset = self._mean_descriptor(in_passage, 'onset_activity')
        background_onset = self._mean_descriptor(out_passage, 'onset_activity', 1e-4)
        passage_vocal = self._mean_descriptor(in_passage, 'vocal_presence', 0.5)
        background_vocal = self._mean_descriptor(out_passage, 'vocal_presence', 0.5)
        passage_slope = self._mean_descriptor(in_passage, 'energy_slope', 0.0)
        passage_flux = self._mean_descriptor(in_passage, 'spectral_flux', 0.0)

        # Multi-window trajectory if passage spans more than 1 segment window
        if len(in_passage) >= 2:
            window_energies = [float(s['descriptors']['energy']) for s in in_passage]
            multi_window_slope = (window_energies[-1] - window_energies[0]) / max(float(np.mean(window_energies)), 1e-4)
            effective_slope = 0.5 * passage_slope + 0.5 * multi_window_slope
        else:
            effective_slope = passage_slope

        corroborated_reasons: list[str] = []
        if passage_vocal >= background_vocal * 0.98 and passage_vocal >= 0.35:
            corroborated_reasons.append('Vocals')
        if effective_slope > 0.03 or passage_flux > 0.12:
            corroborated_reasons.append('Build-up')
        if passage_energy > background_energy * 1.12:
            corroborated_reasons.append('Drop')
        if passage_onset > background_onset * 1.08:
            corroborated_reasons.append('Rhythm')
        if abs(passage_brightness - background_brightness) / max(background_brightness, 50.0) > 0.06:
            corroborated_reasons.append('Instruments')

        metrics = PassageContrastMetrics(
            status='computed',
            energy_ratio=round(passage_energy / max(background_energy, 1e-5), 4),
            brightness_delta_hz=round(passage_brightness - background_brightness, 2),
            onset_ratio=round(passage_onset / max(background_onset, 1e-5), 4),
            vocal_presence=round(passage_vocal, 4),
            vocal_presence_delta=round(passage_vocal - background_vocal, 4),
            energy_slope=round(effective_slope, 4),
            spectral_flux=round(passage_flux, 4),
            corroborated_reasons=corroborated_reasons,
        )
        return metrics.to_dict()

    calculate_contrast = analyze_contrast


_DEFAULT_CONTRAST_ANALYZER = AcousticContrastAnalyzer()


class FavoritePassageEvaluator:
    """Evaluates a collection of user/FAV annotations against acoustic track representations."""

    def __init__(
        self,
        taxonomy: FavoritePassageTaxonomy | None = None,
        contrast_analyzer: AcousticContrastAnalyzer | None = None
    ) -> None:
        self.taxonomy = taxonomy or FavoritePassageTaxonomy()
        self.contrast_analyzer = contrast_analyzer or AcousticContrastAnalyzer()

    def evaluate_corpus(
        self,
        analyses: list[dict[str, Any]],
        annotations: list[FAVAnnotation | dict[str, Any]]
    ) -> dict[str, Any]:
        """Runs the standard FAV corroboration evaluation across all annotated passages."""
        normalized_annotations: list[FAVAnnotation] = []
        for ann in annotations:
            if isinstance(ann, FAVAnnotation):
                normalized_annotations.append(ann)
            else:
                reasons = self.taxonomy.classify(
                    ann.get('explanation', '') or ann.get('note', ''),
                    ann.get('reasons') or ann.get('qualities') or []
                )
                normalized_annotations.append(FAVAnnotation(
                    passage_id=str(ann.get('id') or ann.get('passageId') or f"{ann['trackId']}:{ann['startSec']}"),
                    track_id=ann['trackId'],
                    listener_id=str(ann.get('listenerId', 'local_user')),
                    start_sec=float(ann['startSec']),
                    end_sec=float(ann['endSec']),
                    reasons=reasons,
                    feelings=list(ann.get('feelings', [])),
                    explanation=str(ann.get('explanation') or ann.get('note') or ''),
                ))

        if not normalized_annotations:
            return {'status': 'empty', 'count': 0}

        analyses_by_track = {a['trackId']: a for a in analyses}
        reason_counts: dict[str, int] = {k: 0 for k in self.taxonomy.taxonomy}
        contrast_reports: list[dict[str, Any]] = []
        corroborated_hits = 0
        evaluated_with_audio = 0

        for item in normalized_annotations:
            for reason in item.reasons:
                if reason in reason_counts:
                    reason_counts[reason] += 1
            track_analysis = analyses_by_track.get(item.track_id)
            if track_analysis:
                contrast = self.contrast_analyzer.analyze_contrast(track_analysis, item.start_sec, item.end_sec)
                contrast_reports.append(contrast)
                evaluated_with_audio += 1
                if set(item.reasons) & set(contrast.get('corroborated_reasons', [])) or contrast.get('energy_ratio', 0) >= 0.95:
                    corroborated_hits += 1

        durations = [item.duration_sec for item in normalized_annotations]
        top_reasons = sorted(
            [(k, v) for k, v in reason_counts.items() if v > 0],
            key=lambda x: x[1],
            reverse=True
        )

        return {
            'status': 'evaluated',
            'annotation_count': len(normalized_annotations),
            'evaluated_with_audio': evaluated_with_audio,
            'mean_duration_sec': round(float(np.mean(durations)), 2),
            'reason_distribution': dict(top_reasons),
            'acoustic_corroboration_rate': round(corroborated_hits / max(evaluated_with_audio, 1), 4),
            'mean_energy_ratio': round(float(np.mean([c['energy_ratio'] for c in contrast_reports])), 4) if contrast_reports else None,
            'mean_vocal_presence': round(float(np.mean([c['vocal_presence'] for c in contrast_reports])), 4) if contrast_reports else None,
            'mean_energy_slope': round(float(np.mean([c['energy_slope'] for c in contrast_reports])), 4) if contrast_reports else None,
        }


def classify_fav_explanation(explanation_text: str, explicit_qualities: list[str] | None = None) -> list[str]:
    """Top-level functional interface for FavoritePassageTaxonomy.classify."""
    return _DEFAULT_TAXONOMY.classify(explanation_text, explicit_qualities=explicit_qualities)


def calculate_acoustic_contrast(*args: Any, **kwargs: Any) -> dict[str, Any]:
    """Top-level functional interface for acoustic contrast analysis, supporting both analysis dict and raw waveforms."""
    if args and isinstance(args[0], dict) and 'segments' in args[0]:
        track_analysis = args[0]
        start_seconds = args[1] if len(args) > 1 else kwargs.get('start_seconds', 0.0)
        end_seconds = args[2] if len(args) > 2 else kwargs.get('end_seconds', 15.0)
        return _DEFAULT_CONTRAST_ANALYZER.analyze_contrast(track_analysis, start_seconds, end_seconds)

    passage_audio = args[0] if len(args) > 0 else kwargs.get('passage_audio')
    full_audio = args[1] if len(args) > 1 else kwargs.get('full_song_audio')
    sr = args[2] if len(args) > 2 else kwargs.get('sample_rate', 22050)
    from musicdna.features.dsp import AcousticFeatureExtractor
    import tempfile
    import soundfile as sf
    with tempfile.NamedTemporaryFile(suffix='.wav') as tmp:
        sf.write(tmp.name, full_audio, sr)
        track_analysis = AcousticFeatureExtractor().extract_track_analysis(tmp.name, separate_stems_flag=False)
        dur = len(passage_audio) / sr if passage_audio is not None else 15.0
        return _DEFAULT_CONTRAST_ANALYZER.analyze_contrast(track_analysis, 0.0, dur)


__all__ = [
    'FAV_REASON_TAXONOMY',
    'FAVAnnotation',
    'PassageContrastMetrics',
    'FavoritePassageTaxonomy',
    'AcousticContrastAnalyzer',
    'FavoritePassageEvaluator',
    'classify_fav_explanation',
    'calculate_acoustic_contrast',
]
