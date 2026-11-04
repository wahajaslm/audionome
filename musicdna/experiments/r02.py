"""R02: does microtonal intonation improve preference prediction beyond generic embeddings?

Hypothesis: where a singer places held notes relative to the song's own tonic (and how they slide
into them) helps predict which passages a listener prefers, beyond what CLAP or MERT capture.

Same method as R01 (pairwise rankers, held-out songs then held-out singers, song-level bootstrap
CIs, loudness and position baselines). The comparisons that answer R02:
  - B_mert + intonation   vs  B_mert                    does intonation add to MERT?
  - A_clap + intonation   vs  A_clap                    ... to CLAP?
  - B_mert + ornament + intonation  vs  B_mert + ornament   does intonation add beyond vibrato/slides?
  - intonation only       vs  louder-window baseline    is intonation alone informative?

The report also states how reliable the tonic was: detection confidence per song, and the cents
error against hand-annotated tonics (<corpus folder>/tonic_annotations.json) when there are any.
Without annotations, tonic accuracy is unmeasured and the report says so.

    python -m musicdna.experiments.r02 research-output/preference_pairs_<hash>.json
"""
from __future__ import annotations
import argparse
import json
from pathlib import Path
from typing import Any

import numpy as np

from musicdna.config import Config
from musicdna.corpus.registry import CORPORA, DEFAULT_CORPUS, get_corpus
from musicdna.corpus.feature_store import FeatureStore
from musicdna.experiments.r01 import R01Experiment
from musicdna.features.intonation import IntonationDescriptors


class R02Experiment(R01Experiment):
    """R01's evaluation with intonation (I) and ornamentation (O = vocal pitch movement) feature sets."""

    SYSTEMS: dict[str, tuple[str, ...]] = {
        'A_clap': ('clap',),
        'B_mert': ('mert',),
        'I_intonation': ('intonation',),
        'P_pitch_profile': ('intonation_profile',),
        'O_ornament': ('vocal',),
        'A_clap_intonation': ('clap', 'intonation'),
        'B_mert_intonation': ('mert', 'intonation'),
        'B_mert_ornament': ('mert', 'vocal'),
        'B_mert_ornament_intonation': ('mert', 'vocal', 'intonation'),
        'A_clap_ornament_intonation': ('clap', 'vocal', 'intonation'),
    }
    COMPARISONS = (
        ('B_mert_intonation', 'B_mert'),
        ('A_clap_intonation', 'A_clap'),
        ('B_mert_ornament_intonation', 'B_mert_ornament'),
        ('A_clap_ornament_intonation', 'A_clap'),
        ('I_intonation', 'baseline_louder'),
        ('I_intonation', 'O_ornament'),
    )
    INTERPRETABLE = {**R01Experiment.INTERPRETABLE, 'intonation': IntonationDescriptors.NAMES}

    def run(self, pairs: list[dict[str, Any]]) -> dict[str, Any]:
        report = super().run(pairs)
        songs = sorted({p['corpus_video_id'] for p in pairs if p.get('corpus_video_id')})
        report['tonic'] = self.tonic_reliability(songs)
        report['singing_gate'] = self.gate_summary(songs)
        return report

    def gate_summary(self, songs: list[str]) -> dict[str, Any]:
        """Share of tracked pitch frames kept as singing. Example: 0.91 means 9% of frames pYIN called
        voiced were dropped as likely accompaniment leaking into the vocal stem."""
        kept = [self.store.load_json(s, 'vocal_gate')['kept_fraction'] for s in songs if self.store.has(s, 'vocal_gate')]
        return {'songs': len(kept),
                'median_kept_fraction': round(float(np.median(kept)), 3) if kept else None,
                'lowest_kept_fraction': round(float(np.min(kept)), 3) if kept else None}

    def tonic_reliability(self, songs: list[str]) -> dict[str, Any]:
        """Detection confidence, and error against hand-annotated tonics where they exist."""
        confidences, errors = [], []
        for song in songs:
            if not self.store.has(song, 'tonic'):
                continue
            tonic = self.store.load_json(song, 'tonic')
            confidences.append(tonic['detected']['confidence'])
            if tonic.get('annotated_hz') and np.isfinite(tonic['detected']['midi']):
                annotated_midi = 69 + 12 * np.log2(tonic['annotated_hz'] / 440.0)
                # Pitch-class error in cents, ignoring octave: 1190 cents off is really 10 cents off.
                error = ((tonic['detected']['midi'] - annotated_midi) * 100 + 600) % 1200 - 600
                errors.append(abs(float(error)))
        return {
            'songs_with_tonic': len(confidences),
            'median_detection_confidence': round(float(np.median(confidences)), 3) if confidences else None,
            'annotated_songs': len(errors),
            'median_detection_error_cents': round(float(np.median(errors)), 1) if errors else None,
            'within_25_cents': round(float(np.mean(np.array(errors) <= 25)), 3) if errors else None,
            'note': None if errors else 'No hand-annotated tonics: detection accuracy is unmeasured. '
                                        f'Add {{"<video_id>": <tonic Hz>}} entries to {self.store.tonic_annotations}.',
        }


def main() -> None:
    parser = argparse.ArgumentParser(description='Run research question R02 (microtonal intonation)')
    parser.add_argument('pairs', type=Path, help='Output of musicdna.preference.implicit_pairs / the pipeline')
    parser.add_argument('--out', type=Path, default=Path('research-output/r02_report.json'))
    parser.add_argument('--corpus', choices=list(CORPORA), default=DEFAULT_CORPUS)
    Config.add_arguments(parser)
    arguments = parser.parse_args()
    corpus = get_corpus(arguments.corpus)
    report = R02Experiment(corpus.feature_store(Config.from_arguments(arguments)), corpus.load()).run(
        json.loads(arguments.pairs.read_text(encoding='utf8')))
    arguments.out.parent.mkdir(parents=True, exist_ok=True)
    arguments.out.write_text(json.dumps(report, indent=2) + '\n', encoding='utf8')
    print(f"{report['status']} -> {arguments.out}")


if __name__ == '__main__':
    main()
