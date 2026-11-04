"""Listening-behaviour summaries and evidence-backed insights for the player.

1. `ListeningBehaviorAggregator`: per-window behaviour counts, read from `preference.signals`.
2. `behavior_only_auc`: does implicit attention alone rank saved moments above other windows?
3. `EvidenceInsightSynthesizer`: explanations linking saved moments, repeat listening and acoustics.

Model comparisons (DSP vs CLAP vs MERT vs vocal features) live in `experiments.r01`, which tests
on held-out songs and artists.
"""
from __future__ import annotations
from typing import Any
import numpy as np
from musicdna.config import DEFAULT, Config
from musicdna.preference.favorite_passages import FavoritePassageTaxonomy, AcousticContrastAnalyzer
from musicdna.preference.signals import collect_evidence, durations_from_events


class ListeningBehaviorAggregator:
    """Behaviour counts per grid window that saw any activity, keyed '<trackId>:<startSec>'."""

    def __init__(self, config: Config = DEFAULT) -> None:
        self.config = config

    def extract_passage_behaviors(
        self,
        events: list[dict[str, Any]],
        durations: dict[str, float] | None = None,
    ) -> dict[str, dict[str, Any]]:
        durations = durations or durations_from_events(events, self.config.windows.window_sec)
        result: dict[str, dict[str, Any]] = {}
        for track_id, windows in collect_evidence(durations, events, config=self.config).items():
            for w in windows:
                if not w.active:
                    continue
                result[f'{track_id}:{int(w.start_sec)}'] = {
                    'trackId': track_id,
                    'startSec': w.start_sec,
                    'endSec': w.end_sec,
                    'manualRewinds': w.rewound_into,
                    'manualLoopStarts': w.loop_starts,
                    'loopCycles': w.loop_cycles,
                    'seekArrivals': w.seek_arrivals,
                    'skipDepartures': w.left_early,
                    'relativeVolumeChanges': w.volume_changes,
                    'listenedPasses': w.listen_passes,
                    'distinctSessions': len(w.sessions),
                    'attentionScore': round(w.attention_score(self.config.signals), 4),
                }
        return result

    @staticmethod
    def calculate_behavior_score(passage_bin: dict[str, Any]) -> float:
        return float(passage_bin.get('attentionScore', 0.0))


def behavior_only_auc(events: list[dict[str, Any]], moments: list[dict[str, Any]],
                      config: Config = DEFAULT) -> dict[str, Any]:
    """Probability that a window inside a saved moment has higher implicit attention than one outside."""
    behavior_map = ListeningBehaviorAggregator(config).extract_passage_behaviors(events) if events else {}
    if not behavior_map or not moments:
        return {'status': 'insufficient_data', 'auc': None, 'samples': 0}
    scores, labels = [], []
    for passage in behavior_map.values():
        inside = any(m['trackId'] == passage['trackId'] and max(m['startSec'], passage['startSec']) < min(m['endSec'], passage['endSec'])
                     for m in moments)
        scores.append(passage['attentionScore'])
        labels.append(inside)
    positives = [s for s, inside in zip(scores, labels) if inside]
    negatives = [s for s, inside in zip(scores, labels) if not inside]
    if not positives or not negatives:
        return {'status': 'need_both_classes', 'positives': len(positives), 'negatives': len(negatives)}
    concordant = sum(1.0 if p > n else 0.5 if p == n else 0.0 for p in positives for n in negatives)
    auc = concordant / (len(positives) * len(negatives))
    return {
        'status': 'evaluated', 'auc': round(auc, 4), 'positives': len(positives), 'negatives': len(negatives),
        'note': (f'Implicit attention ranks saved-moment windows above other windows {auc:.0%} of the time '
                 '(50% = chance). Single-listener descriptive figure, no confidence interval.'),
    }


class EvidenceInsightSynthesizer:
    """Synthesizes verifiable, human-readable insights connecting acoustic measurements with confirmed moments and behavior."""

    def __init__(
        self,
        behavior_aggregator: ListeningBehaviorAggregator | None = None,
        taxonomy: FavoritePassageTaxonomy | None = None,
        contrast_analyzer: AcousticContrastAnalyzer | None = None
    ) -> None:
        self.behavior_aggregator = behavior_aggregator or ListeningBehaviorAggregator()
        self.taxonomy = taxonomy or FavoritePassageTaxonomy()
        self.contrast_analyzer = contrast_analyzer or AcousticContrastAnalyzer()

    def synthesize(
        self,
        analyses: list[dict[str, Any]],
        moments: list[dict[str, Any]],
        ratings: list[dict[str, Any]],
        events: list[dict[str, Any]]
    ) -> dict[str, Any]:
        """Generates evidence-backed insight report."""
        if not moments:
            return {
                'status': 'insufficient_observations',
                'headline': 'Save and describe favorite moments to unlock evidence-backed insights.',
                'evidence': [],
                'disclaimer': 'Actual claims require sufficient supporting observations and verified model outputs.',
            }

        behavior_map = self.behavior_aggregator.extract_passage_behaviors(events)
        analyses_by_track: dict[str, dict[str, Any]] = {}
        for analysis in analyses:
            if analysis['trackId'] not in analyses_by_track or analysis.get('method') == 'multimodal':
                analyses_by_track[analysis['trackId']] = analysis

        vocal_buildup_moments = []
        reason_counts: dict[str, int] = {}
        returned_count = 0
        measured_slopes: list[float] = []
        measured_vocals: list[float] = []

        for moment in moments:
            reasons = self.taxonomy.classify(
                str(moment.get('note', '') or moment.get('explanation', '')),
                list(moment.get('qualities', []) or moment.get('reasons', []))
            )
            for reason in reasons:
                reason_counts[reason] = reason_counts.get(reason, 0) + 1

            track_id = moment['trackId']
            start_sec = float(moment['startSec'])
            end_sec = float(moment['endSec'])
            has_return = False
            for passage_bin in behavior_map.values():
                if passage_bin['trackId'] == track_id and max(start_sec, passage_bin['startSec']) < min(end_sec, passage_bin['endSec']):
                    if passage_bin['manualRewinds'] + passage_bin['manualLoopStarts'] >= 1 or passage_bin['distinctSessions'] >= 2:
                        has_return = True
                        break

            track_analysis = analyses_by_track.get(track_id)
            contrast = self.contrast_analyzer.analyze_contrast(track_analysis, start_sec, end_sec) if track_analysis else {}
            slope = float(contrast.get('energy_slope', 0.0))
            vocal_presence = float(contrast.get('vocal_presence', 0.0))
            if track_analysis:
                measured_slopes.append(slope)
                measured_vocals.append(vocal_presence)

            is_vocal_buildup = (
                ('Vocals' in reasons and ('Build-up' in reasons or slope > 0.02))
                or ('Vocals' in reasons and 'Instruments' in reasons and slope > 0.01)
            )
            if is_vocal_buildup:
                vocal_buildup_moments.append((moment, has_return, contrast))
                if has_return:
                    returned_count += 1

        saved_tracks = {m['trackId'] for m in moments}
        candidate_recommendation = None
        if vocal_buildup_moments and analyses:
            anchor_embeddings = []
            for moment, _, _ in vocal_buildup_moments:
                ta = analyses_by_track.get(moment['trackId'])
                if ta:
                    for segment in ta.get('segments', []):
                        overlap = min(float(moment['endSec']), float(segment['endSec'])) - max(float(moment['startSec']), float(segment['startSec']))
                        if overlap >= 6.0:
                            vector = np.asarray(segment['embedding'], dtype=np.float64)
                            anchor_embeddings.append((vector / (np.linalg.norm(vector) or 1.0)) * overlap)
            if anchor_embeddings:
                prototype = np.sum(anchor_embeddings, axis=0)
                prototype = prototype / (np.linalg.norm(prototype) or 1.0)
                best_similarity = -1.0
                for track_id, track_analysis in analyses_by_track.items():
                    if track_id in saved_tracks and len(analyses_by_track) > len(saved_tracks):
                        continue
                    for segment in track_analysis.get('segments', []):
                        vector = np.asarray(segment['embedding'], dtype=np.float64)
                        similarity = float(np.dot(prototype, vector / (np.linalg.norm(vector) or 1.0)))
                        if similarity > best_similarity:
                            best_similarity = similarity
                            candidate_recommendation = {
                                'trackId': track_id,
                                'startSec': segment['startSec'],
                                'endSec': segment['endSec'],
                                'similarity': round(similarity, 4),
                                'descriptors': segment.get('descriptors', {}),
                                'modelId': track_analysis.get('modelId', 'unknown'),
                            }

        count_vocal_buildup = len(vocal_buildup_moments)
        number_words = {1: 'one', 2: 'two', 3: 'three', 4: 'four', 5: 'five'}
        vb_word = number_words.get(count_vocal_buildup, str(count_vocal_buildup))
        ret_word = number_words.get(returned_count, str(returned_count))

        if count_vocal_buildup >= 2:
            headline = 'You seem to enjoy vocal passages that become more intense as the music builds.'
            evidence = [
                f"You confirmed liking {vb_word} such {'passage' if count_vocal_buildup == 1 else 'passages'}.",
                f"You repeatedly returned to {ret_word} of them.",
                'DSP and deep audio analysis identified candidate similarities.',
            ]
        else:
            top_reasons = sorted(reason_counts.items(), key=lambda x: x[1], reverse=True)
            top_names = ' and '.join(k.lower() for k, _ in top_reasons[:2]) if top_reasons else 'distinctive musical moments'
            total_moments = len(moments)
            moments_word = number_words.get(total_moments, str(total_moments))
            headline = f"You often gravitate toward passages featuring {top_names}."
            evidence = [
                f"You confirmed liking {moments_word} saved {'passage' if total_moments == 1 else 'passages'}.",
                'DSP and deep audio analysis identified candidate similarities.',
            ]

        return {
            'status': 'verified' if count_vocal_buildup >= 3 and candidate_recommendation else 'developing',
            'headline': headline,
            'evidence': evidence,
            'try_this_moment': (
                'Try this moment: A passage in an unfamiliar song with related musical characteristics.'
                if candidate_recommendation else None
            ),
            'recommended_passage': candidate_recommendation,
            'python_verification': {
                'total_saved_moments': len(moments),
                'matching_pattern_moments': count_vocal_buildup,
                'repeated_return_moments': returned_count,
                'mean_vocal_presence': round(float(np.mean(measured_vocals)), 4) if measured_vocals else None,
                'mean_energy_slope': round(float(np.mean(measured_slopes)), 4) if measured_slopes else None,
            },
            'disclaimer': 'Actual claims require sufficient supporting observations and verified model outputs.',
        }


__all__ = [
    'ListeningBehaviorAggregator',
    'behavior_only_auc',
    'EvidenceInsightSynthesizer',
]
