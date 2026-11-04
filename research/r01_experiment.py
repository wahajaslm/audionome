"""R01: do fine-grained vocal pitch features improve preference prediction over general embeddings?

Every system is a linear pairwise ranker (logistic regression on the feature difference between
the preferred and the passed-over window). Each one is tested only on songs, and then on artists,
it never saw in training. The primary metric is song-averaged pairwise accuracy, so one heavily
replayed song cannot dominate. Two untrained baselines (louder window, later window) guard
against a model that has only learned loudness or song position.

    python -m research.r01_experiment research-output/preference_pairs.json
"""
from __future__ import annotations
import argparse
import hashlib
import json
import re
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import numpy as np
from sklearn.decomposition import PCA
from sklearn.linear_model import LogisticRegression
from sklearn.preprocessing import StandardScaler

from .coke_studio_dataset import MANIFEST_PATH, CorpusManifest
from .feature_store import FeatureStore
from .spatial_features import SpatialDescriptors
from .vocal_pitch import VocalDescriptors

# Learned systems: name -> feature blocks. A and B are the R01 embeddings; C adds measured vocal
# pitch; the remaining rows are ablations that isolate each block.
SYSTEMS: dict[str, tuple[str, ...]] = {
    'dsp': ('dsp',),
    'A_clap': ('clap',),
    'B_mert': ('mert',),
    'C_mert_vocal': ('mert', 'vocal'),
    'C_clap_vocal': ('clap', 'vocal'),
    'C_mert_vocal_spatial': ('mert', 'vocal', 'spatial'),
    'vocal_only': ('vocal',),
    'spatial_only': ('spatial',),
}
BASELINES = ('baseline_louder', 'baseline_later')
COMPARISONS = (
    ('C_mert_vocal', 'B_mert'), ('C_clap_vocal', 'A_clap'), ('B_mert', 'A_clap'),
    ('A_clap', 'dsp'), ('C_mert_vocal_spatial', 'C_mert_vocal'), ('vocal_only', 'baseline_louder'),
)
INTERPRETABLE_NAMES = {'vocal': VocalDescriptors.NAMES, 'spatial': SpatialDescriptors.NAMES}
EMBEDDING_COMPONENTS = 16
REGULARIZATION_C = 0.1
MIN_SONGS = 3
MIN_PAIRS = 20
EXPERIMENT_D_MIN_PAIRS = 500
BOOTSTRAP_SAMPLES = 2000


@dataclass
class PairRow:
    song: str
    artist: str
    preferred: int
    passed_over: int
    weight: float
    strength: str


def primary_artist(artists: str) -> str:
    """First credited performer, so collaborations group with that artist's other songs."""
    first = re.split(r'\s+(?:&|x|and|ft\.?|feat\.?)\s+|,', artists, maxsplit=1, flags=re.IGNORECASE)[0]
    return first.strip().lower() or 'unknown'


def load_rows(pairs: list[dict[str, Any]], store: FeatureStore, corpus: CorpusManifest) -> list[PairRow]:
    artists = {e.video_id: primary_artist(e.artists) for e in corpus.entries}
    rows = []
    for pair in pairs:
        video_id = pair.get('corpus_video_id')
        if video_id not in artists:
            continue
        rows.append(PairRow(video_id, artists[video_id], store.window_index(pair['preferred'][0]),
                            store.window_index(pair['passed_over'][0]), float(pair['weight']), pair['strength']))
    return rows


class BlockTransform:
    """Standardizes each block on training windows; embeddings are also reduced with PCA."""

    def __init__(self, blocks: tuple[str, ...]) -> None:
        self.blocks = blocks
        self.steps: dict[str, tuple[StandardScaler, PCA | None]] = {}

    def fit(self, features: dict[str, dict[str, np.ndarray]], songs: set[str]) -> BlockTransform:
        for block in self.blocks:
            stacked = np.vstack([features[song][block] for song in songs])
            scaler = StandardScaler().fit(stacked)
            pca = None
            if stacked.shape[1] > 32:
                pca = PCA(n_components=min(EMBEDDING_COMPONENTS, *stacked.shape), random_state=0)
                pca.fit(scaler.transform(stacked))
            self.steps[block] = (scaler, pca)
        return self

    def transform(self, features: dict[str, np.ndarray]) -> np.ndarray:
        parts = []
        for block in self.blocks:
            scaler, pca = self.steps[block]
            values = scaler.transform(features[block])
            parts.append(pca.transform(values) if pca else values)
        return np.nan_to_num(np.hstack(parts))


def _differences(rows: list[PairRow], matrices: dict[str, np.ndarray]) -> np.ndarray:
    return np.array([matrices[r.song][r.preferred] - matrices[r.song][r.passed_over] for r in rows])


def fit_ranker(rows: list[PairRow], matrices: dict[str, np.ndarray]) -> LogisticRegression:
    deltas = _differences(rows, matrices)
    weights = np.array([r.weight for r in rows])
    # Both orientations, so the ranker has no intercept to exploit and learns a pure direction.
    model = LogisticRegression(C=REGULARIZATION_C, fit_intercept=False, max_iter=2000)
    model.fit(np.vstack([deltas, -deltas]), np.r_[np.ones(len(rows)), np.zeros(len(rows))],
              sample_weight=np.r_[weights, weights])
    return model


def pair_outcomes(scores: np.ndarray) -> np.ndarray:
    """1 when the preferred window scores higher, 0.5 on a tie, 0 otherwise."""
    return np.where(scores > 0, 1.0, np.where(scores == 0, 0.5, 0.0))


def evaluate_learned(blocks: tuple[str, ...], rows: list[PairRow], features: dict[str, dict[str, np.ndarray]],
                     group_of: str) -> tuple[np.ndarray, list[np.ndarray]]:
    """Leave-one-group-out outcome per pair, plus the fitted coefficients of every fold."""
    groups = sorted({getattr(r, group_of) for r in rows})
    outcomes = np.full(len(rows), np.nan)
    coefficients = []
    for held_out in groups:
        train = [r for r in rows if getattr(r, group_of) != held_out]
        test_index = [i for i, r in enumerate(rows) if getattr(r, group_of) == held_out]
        if not train or len({r.song for r in train}) < 2:
            continue
        transform = BlockTransform(blocks).fit(features, {r.song for r in train})
        matrices = {song: transform.transform(features[song]) for song in {r.song for r in rows}}
        model = fit_ranker(train, matrices)
        coefficients.append(model.coef_[0])
        test_rows = [rows[i] for i in test_index]
        outcomes[test_index] = pair_outcomes(_differences(test_rows, matrices) @ model.coef_[0])
    return outcomes, coefficients


def evaluate_baseline(name: str, rows: list[PairRow], features: dict[str, dict[str, np.ndarray]]) -> np.ndarray:
    if name == 'baseline_later':
        return pair_outcomes(np.array([r.preferred - r.passed_over for r in rows], dtype=float))
    loudness = [features[r.song]['loudness'][r.preferred, 0] - features[r.song]['loudness'][r.passed_over, 0]
                for r in rows]
    return pair_outcomes(np.array(loudness))


def song_macro(outcomes: np.ndarray, rows: list[PairRow]) -> dict[str, float]:
    per_song: dict[str, list[float]] = {}
    for outcome, row in zip(outcomes, rows):
        if not np.isnan(outcome):
            per_song.setdefault(row.song, []).append(outcome)
    return {song: float(np.mean(values)) for song, values in per_song.items()}


def bootstrap_ci(per_song: dict[str, float], seed: int = 0) -> tuple[float, float]:
    values = np.array(list(per_song.values()))
    if values.size < 2:
        return (float('nan'), float('nan'))
    draws = np.random.default_rng(seed).choice(values, size=(BOOTSTRAP_SAMPLES, values.size)).mean(axis=1)
    return (round(float(np.percentile(draws, 2.5)), 4), round(float(np.percentile(draws, 97.5)), 4))


def paired_difference(a: dict[str, float], b: dict[str, float], seed: int = 0) -> dict[str, Any]:
    songs = sorted(set(a) & set(b))
    if len(songs) < 2:
        return {'status': 'not_enough_shared_songs'}
    deltas = np.array([a[s] - b[s] for s in songs])
    draws = np.random.default_rng(seed).choice(deltas, size=(BOOTSTRAP_SAMPLES, deltas.size)).mean(axis=1)
    low, high = np.percentile(draws, [2.5, 97.5])
    verdict = 'better' if low > 0 else 'worse' if high < 0 else 'no clear difference'
    return {'mean_difference': round(float(deltas.mean()), 4), 'ci95': [round(float(low), 4), round(float(high), 4)],
            'songs': len(songs), 'verdict': verdict}


def summarize(outcomes: np.ndarray, rows: list[PairRow]) -> tuple[dict[str, Any], dict[str, float]]:
    per_song = song_macro(outcomes, rows)
    valid = ~np.isnan(outcomes)
    strong = valid & np.array([r.strength == 'strong' for r in rows])
    summary = {
        'song_macro_accuracy': round(float(np.mean(list(per_song.values()))), 4) if per_song else None,
        'ci95': bootstrap_ci(per_song),
        'pair_accuracy': round(float(outcomes[valid].mean()), 4) if valid.any() else None,
        'strong_pair_accuracy': round(float(outcomes[strong].mean()), 4) if strong.any() else None,
        'evaluated_pairs': int(valid.sum()),
        'evaluated_songs': len(per_song),
        'worst_songs': sorted(per_song.items(), key=lambda item: item[1])[:3],
    }
    return summary, per_song


def feature_directions(blocks: tuple[str, ...], coefficients: list[np.ndarray]) -> dict[str, float] | None:
    """Mean standardized coefficient per named feature: positive = more of it is preferred."""
    if not coefficients or not all(block in INTERPRETABLE_NAMES for block in blocks):
        return None
    names = [name for block in blocks for name in INTERPRETABLE_NAMES[block]]
    mean = np.mean(coefficients, axis=0)
    return dict(sorted(((n, round(float(c), 4)) for n, c in zip(names, mean)), key=lambda item: -abs(item[1])))


def run(pairs: list[dict[str, Any]], store: FeatureStore, corpus: CorpusManifest) -> dict[str, Any]:
    rows = load_rows(pairs, store, corpus)
    songs = sorted({r.song for r in rows})
    report: dict[str, Any] = {'pairs_total': len(pairs), 'pairs_on_corpus_songs': len(rows), 'songs': len(songs),
                              'artists': len({r.artist for r in rows})}
    if len(songs) < MIN_SONGS or len(rows) < MIN_PAIRS:
        report['status'] = 'insufficient_data'
        report['needed'] = f'at least {MIN_PAIRS} pairs across {MIN_SONGS} corpus songs'
        return report

    blocks_needed = {b for blocks in SYSTEMS.values() for b in blocks} | {'loudness'}
    features = {song: {b: store.load(song, b) for b in blocks_needed if store.has(song, b)} for song in songs}
    usable = [r for r in rows if max(r.preferred, r.passed_over) < len(features[r.song].get('loudness', []))]
    report['pairs_with_features'] = len(usable)

    systems: dict[str, Any] = {}
    per_song_scores: dict[str, dict[str, float]] = {}
    for name in BASELINES:
        systems[name], per_song_scores[name] = summarize(evaluate_baseline(name, usable, features), usable)
    for name, blocks in SYSTEMS.items():
        missing = sorted({b for b in blocks for s in songs if b not in features[s]})
        if missing:
            systems[name] = {'status': 'features_missing', 'blocks': missing}
            continue
        result: dict[str, Any] = {}
        for split, group_of in (('held_out_song', 'song'), ('held_out_artist', 'artist')):
            if len({getattr(r, group_of) for r in usable}) < MIN_SONGS:
                result[split] = {'status': f'fewer than {MIN_SONGS} groups'}
                continue
            outcomes, coefficients = evaluate_learned(blocks, usable, features, group_of)
            result[split], scores = summarize(outcomes, usable)
            if split == 'held_out_song':
                per_song_scores[name] = scores
                result['feature_directions'] = feature_directions(blocks, coefficients)
        systems[name] = result
    report['systems'] = systems

    report['comparisons'] = {
        f'{a} vs {b}': paired_difference(per_song_scores[a], per_song_scores[b])
        for a, b in COMPARISONS if a in per_song_scores and b in per_song_scores
    }
    report['experiment_D'] = (
        {'status': 'not_run', 'reason': f'needs at least {EXPERIMENT_D_MIN_PAIRS} pairs to train a temporal vocal '
                                        f'encoder without overfitting; have {len(usable)}'}
        if len(usable) < EXPERIMENT_D_MIN_PAIRS else {'status': 'ready', 'input': 'pitch_contour.npy per song'})
    report['status'] = 'evaluated'
    return report


def _sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main() -> None:
    parser = argparse.ArgumentParser(description='Run research question R01')
    parser.add_argument('pairs', type=Path, help='Output of research.implicit_pairs')
    parser.add_argument('--out', type=Path, default=Path('research-output/r01_report.json'))
    arguments = parser.parse_args()

    report = {
        'experiment': 'R01 vocal pitch features vs general audio embeddings',
        'created_at': datetime.now(timezone.utc).isoformat(timespec='seconds'),
        'inputs': {'pairs_sha256': _sha256(arguments.pairs), 'manifest_sha256': _sha256(MANIFEST_PATH)},
        'config': {'ranker': 'pairwise logistic regression', 'C': REGULARIZATION_C,
                   'embedding_pca_components': EMBEDDING_COMPONENTS, 'bootstrap_samples': BOOTSTRAP_SAMPLES},
        **run(json.loads(arguments.pairs.read_text(encoding='utf8')), FeatureStore(), CorpusManifest.load()),
    }
    arguments.out.parent.mkdir(parents=True, exist_ok=True)
    arguments.out.write_text(json.dumps(report, indent=2) + '\n', encoding='utf8')
    print(f"{report['status']}: {report.get('pairs_with_features', report['pairs_on_corpus_songs'])} pairs, "
          f"{report['songs']} songs -> {arguments.out}")
    for name, result in report.get('systems', {}).items():
        summary = result.get('held_out_song', result)
        print(f"  {name:<22} {summary.get('song_macro_accuracy', summary.get('status'))} {summary.get('ci95', '')}")


if __name__ == '__main__':
    main()
