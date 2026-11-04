"""R01: do fine-grained vocal pitch features improve preference prediction over general embeddings?

Every system is a linear pairwise ranker (logistic regression on the feature difference between
the preferred and the passed-over window). Each one is tested only on songs, and then on artists,
it never saw in training. The primary metric is song-averaged pairwise accuracy, so one heavily
replayed song cannot dominate. Two untrained baselines (louder window, later window) guard
against a model that has only learned loudness or song position.

    python -m musicdna.experiments.r01 research-output/preference_pairs.json
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

from musicdna.config import DEFAULT, Config, RankerConfig
from musicdna.corpus.coke_studio import MANIFEST_PATH, CorpusManifest
from musicdna.corpus.feature_store import FeatureStore
from musicdna.features.spatial import SpatialDescriptors
from musicdna.features.vocal import VocalDescriptors

Features = dict[str, dict[str, np.ndarray]]  # song -> block -> (windows, dims)


@dataclass
class PairRow:
    song: str
    artist: str
    preferred: int
    passed_over: int
    weight: float
    strength: str

    @staticmethod
    def primary_artist(artists: str) -> str:
        """First credited performer, so collaborations group with that artist's other songs."""
        first = re.split(r'\s+(?:&|x|and|ft\.?|feat\.?)\s+|,', artists, maxsplit=1, flags=re.IGNORECASE)[0]
        return first.strip().lower() or 'unknown'


class PairwiseRanker:
    """Linear ranker over feature blocks: standardize (PCA for embeddings), then logistic regression on differences."""

    def __init__(self, blocks: tuple[str, ...], settings: RankerConfig = DEFAULT.ranker) -> None:
        self.blocks = blocks
        self.settings = settings
        self.steps: dict[str, tuple[StandardScaler, PCA | None]] = {}
        self.coefficients: np.ndarray | None = None

    def fit(self, rows: list[PairRow], features: Features) -> PairwiseRanker:
        songs = {r.song for r in rows}
        for block in self.blocks:
            stacked = np.vstack([features[song][block] for song in songs])
            scaler = StandardScaler().fit(stacked)
            pca = None
            if stacked.shape[1] > 32:
                pca = PCA(n_components=min(self.settings.embedding_pca_components, *stacked.shape),
                          random_state=self.settings.seed).fit(scaler.transform(stacked))
            self.steps[block] = (scaler, pca)
        deltas = self._differences(rows, features)
        weights = np.array([r.weight for r in rows])
        # Both orientations, so the ranker has no intercept to exploit and learns a pure direction.
        model = LogisticRegression(C=self.settings.regularization_c, fit_intercept=False, max_iter=2000)
        model.fit(np.vstack([deltas, -deltas]), np.r_[np.ones(len(rows)), np.zeros(len(rows))],
                  sample_weight=np.r_[weights, weights])
        self.coefficients = model.coef_[0]
        return self

    def outcomes(self, rows: list[PairRow], features: Features) -> np.ndarray:
        return pair_outcomes(self._differences(rows, features) @ self.coefficients)

    def _transform(self, song_features: dict[str, np.ndarray]) -> np.ndarray:
        parts = []
        for block in self.blocks:
            scaler, pca = self.steps[block]
            values = scaler.transform(song_features[block])
            parts.append(pca.transform(values) if pca else values)
        return np.nan_to_num(np.hstack(parts))

    def _differences(self, rows: list[PairRow], features: Features) -> np.ndarray:
        matrices = {song: self._transform(features[song]) for song in {r.song for r in rows}}
        return np.array([matrices[r.song][r.preferred] - matrices[r.song][r.passed_over] for r in rows])


def pair_outcomes(scores: np.ndarray) -> np.ndarray:
    """1 when the preferred window scores higher, 0.5 on a tie, 0 otherwise."""
    return np.where(scores > 0, 1.0, np.where(scores == 0, 0.5, 0.0))


class SongStatistics:
    """Song-level summaries and bootstrap intervals, so each song counts once."""

    def __init__(self, settings: RankerConfig = DEFAULT.ranker) -> None:
        self.settings = settings

    def per_song(self, outcomes: np.ndarray, rows: list[PairRow]) -> dict[str, float]:
        grouped: dict[str, list[float]] = {}
        for outcome, row in zip(outcomes, rows):
            if not np.isnan(outcome):
                grouped.setdefault(row.song, []).append(outcome)
        return {song: float(np.mean(values)) for song, values in grouped.items()}

    def interval(self, values: np.ndarray) -> tuple[float, float]:
        if values.size < 2:
            return (float('nan'), float('nan'))
        draws = self._resample(values)
        return (round(float(np.percentile(draws, 2.5)), 4), round(float(np.percentile(draws, 97.5)), 4))

    def summarize(self, outcomes: np.ndarray, rows: list[PairRow]) -> tuple[dict[str, Any], dict[str, float]]:
        per_song = self.per_song(outcomes, rows)
        valid = ~np.isnan(outcomes)
        strong = valid & np.array([r.strength == 'strong' for r in rows])
        summary = {
            'song_macro_accuracy': round(float(np.mean(list(per_song.values()))), 4) if per_song else None,
            'ci95': self.interval(np.array(list(per_song.values()))),
            'pair_accuracy': round(float(outcomes[valid].mean()), 4) if valid.any() else None,
            'strong_pair_accuracy': round(float(outcomes[strong].mean()), 4) if strong.any() else None,
            'evaluated_pairs': int(valid.sum()),
            'evaluated_songs': len(per_song),
            'worst_songs': sorted(per_song.items(), key=lambda item: item[1])[:3],
        }
        return summary, per_song

    def compare(self, a: dict[str, float], b: dict[str, float]) -> dict[str, Any]:
        """Paired bootstrap over shared songs: is system a better than b?"""
        songs = sorted(set(a) & set(b))
        if len(songs) < 2:
            return {'status': 'not_enough_shared_songs'}
        deltas = np.array([a[s] - b[s] for s in songs])
        low, high = np.percentile(self._resample(deltas), [2.5, 97.5])
        verdict = 'better' if low > 0 else 'worse' if high < 0 else 'no clear difference'
        return {'mean_difference': round(float(deltas.mean()), 4), 'ci95': [round(float(low), 4), round(float(high), 4)],
                'songs': len(songs), 'verdict': verdict}

    def _resample(self, values: np.ndarray) -> np.ndarray:
        rng = np.random.default_rng(self.settings.seed)
        return rng.choice(values, size=(self.settings.bootstrap_samples, values.size)).mean(axis=1)


class R01Experiment:
    """Runs every system and baseline on held-out songs and artists and compares them."""

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
    INTERPRETABLE = {'vocal': VocalDescriptors.NAMES, 'spatial': SpatialDescriptors.NAMES}
    SPLITS = (('held_out_song', 'song'), ('held_out_artist', 'artist'))

    def __init__(self, store: FeatureStore, corpus: CorpusManifest) -> None:
        self.store = store
        self.corpus = corpus
        self.settings = store.config.ranker
        self.statistics = SongStatistics(self.settings)

    def run(self, pairs: list[dict[str, Any]]) -> dict[str, Any]:
        rows = self.rows(pairs)
        songs = sorted({r.song for r in rows})
        report: dict[str, Any] = {'config': self.store.config.to_dict(), 'pairs_total': len(pairs),
                                  'pairs_on_corpus_songs': len(rows), 'songs': len(songs),
                                  'artists': len({r.artist for r in rows})}
        if len(songs) < self.settings.min_songs or len(rows) < self.settings.min_pairs:
            report['status'] = 'insufficient_data'
            report['needed'] = f'at least {self.settings.min_pairs} pairs across {self.settings.min_songs} corpus songs'
            return report

        features = self.load_features(songs)
        usable = [r for r in rows if max(r.preferred, r.passed_over) < len(features[r.song].get('loudness', []))]
        report['pairs_with_features'] = len(usable)

        systems: dict[str, Any] = {}
        per_song: dict[str, dict[str, float]] = {}
        for name in self.BASELINES:
            systems[name], per_song[name] = self.statistics.summarize(self.baseline_outcomes(name, usable, features), usable)
        for name, blocks in self.SYSTEMS.items():
            missing = sorted({b for b in blocks for s in songs if b not in features[s]})
            systems[name] = {'status': 'features_missing', 'blocks': missing} if missing else \
                self.evaluate_system(blocks, usable, features, per_song, name)
        report['systems'] = systems
        report['comparisons'] = {f'{a} vs {b}': self.statistics.compare(per_song[a], per_song[b])
                                 for a, b in self.COMPARISONS if a in per_song and b in per_song}
        report['experiment_D'] = self.experiment_d_status(len(usable))
        report['status'] = 'evaluated'
        return report

    def rows(self, pairs: list[dict[str, Any]]) -> list[PairRow]:
        artists = {e.video_id: PairRow.primary_artist(e.artists) for e in self.corpus.entries}
        return [PairRow(p['corpus_video_id'], artists[p['corpus_video_id']],
                        self.store.window_index(p['preferred'][0]), self.store.window_index(p['passed_over'][0]),
                        float(p['weight']), p['strength'])
                for p in pairs if p.get('corpus_video_id') in artists]

    def load_features(self, songs: list[str]) -> Features:
        blocks_needed = {b for blocks in self.SYSTEMS.values() for b in blocks} | {'loudness'}
        features = {song: {b: self.store.load(song, b) for b in blocks_needed if self.store.has(song, b)} for song in songs}
        for blocks in features.values():  # every block shares the grid; trim any tail-window mismatch
            available = min((len(v) for v in blocks.values()), default=0)
            for name in blocks:
                blocks[name] = blocks[name][:available]
        return features

    def evaluate_system(self, blocks: tuple[str, ...], rows: list[PairRow], features: Features,
                        per_song: dict[str, dict[str, float]], name: str) -> dict[str, Any]:
        result: dict[str, Any] = {}
        for split, group_of in self.SPLITS:
            if len({getattr(r, group_of) for r in rows}) < self.settings.min_songs:
                result[split] = {'status': f'fewer than {self.settings.min_songs} groups'}
                continue
            outcomes, coefficients = self.held_out_outcomes(blocks, rows, features, group_of)
            result[split], scores = self.statistics.summarize(outcomes, rows)
            if split == 'held_out_song':
                per_song[name] = scores
                result['feature_directions'] = self.feature_directions(blocks, coefficients)
        return result

    def held_out_outcomes(self, blocks: tuple[str, ...], rows: list[PairRow], features: Features,
                          group_of: str) -> tuple[np.ndarray, list[np.ndarray]]:
        """Leave-one-group-out outcome per pair, plus the coefficients of every fold."""
        outcomes = np.full(len(rows), np.nan)
        coefficients = []
        for held_out in sorted({getattr(r, group_of) for r in rows}):
            train = [r for r in rows if getattr(r, group_of) != held_out]
            test_index = [i for i, r in enumerate(rows) if getattr(r, group_of) == held_out]
            if len({r.song for r in train}) < 2:
                continue
            ranker = PairwiseRanker(blocks, self.settings).fit(train, features)
            coefficients.append(ranker.coefficients)
            outcomes[test_index] = ranker.outcomes([rows[i] for i in test_index], features)
        return outcomes, coefficients

    @staticmethod
    def baseline_outcomes(name: str, rows: list[PairRow], features: Features) -> np.ndarray:
        if name == 'baseline_later':
            return pair_outcomes(np.array([r.preferred - r.passed_over for r in rows], dtype=float))
        loudness = [features[r.song]['loudness'][r.preferred, 0] - features[r.song]['loudness'][r.passed_over, 0]
                    for r in rows]
        return pair_outcomes(np.array(loudness))

    def feature_directions(self, blocks: tuple[str, ...], coefficients: list[np.ndarray]) -> dict[str, float] | None:
        """Mean standardized coefficient per named feature: positive = more of it is preferred."""
        if not coefficients or not all(block in self.INTERPRETABLE for block in blocks):
            return None
        names = [name for block in blocks for name in self.INTERPRETABLE[block]]
        mean = np.mean(coefficients, axis=0)
        return dict(sorted(((n, round(float(c), 4)) for n, c in zip(names, mean)), key=lambda item: -abs(item[1])))

    def experiment_d_status(self, pairs: int) -> dict[str, Any]:
        if pairs < self.settings.experiment_d_min_pairs:
            return {'status': 'not_run', 'reason': f'needs at least {self.settings.experiment_d_min_pairs} pairs to train '
                                                   f'a temporal vocal encoder without overfitting; have {pairs}'}
        return {'status': 'ready', 'input': 'pitch_contour artifact per song'}


def main() -> None:
    parser = argparse.ArgumentParser(description='Run research question R01')
    parser.add_argument('pairs', type=Path, help='Output of musicdna.preference.implicit_pairs')
    parser.add_argument('--out', type=Path, default=Path('research-output/r01_report.json'))
    Config.add_arguments(parser)
    arguments = parser.parse_args()

    sha256 = lambda path: hashlib.sha256(path.read_bytes()).hexdigest()  # noqa: E731
    experiment = R01Experiment(FeatureStore(Config.from_arguments(arguments)), CorpusManifest.load())
    report = {
        'experiment': 'R01 vocal pitch features vs general audio embeddings',
        'created_at': datetime.now(timezone.utc).isoformat(timespec='seconds'),
        'inputs': {'pairs_sha256': sha256(arguments.pairs), 'manifest_sha256': sha256(MANIFEST_PATH)},
        **experiment.run(json.loads(arguments.pairs.read_text(encoding='utf8'))),
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
