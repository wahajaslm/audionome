"""Moment model: which windows of a song do people return to? A hybrid CNN + feature + transformer ranker.

Per 12-second window the model gets up to three inputs:
    1. a fine-pitch CQT picture of the mix and the vocal, drum and other stems (features.cqt), either the
       tonic-aligned 20-cent view ("eastern") or the equal-tempered semitone view ("western");
    2. CLAP's 512-number embedding;
    3. hand-built features: DSP, spatial, vocal, intonation (+ profile) and eastern.
A transformer then reads all windows of the song in order, so a window's score can depend on the build-up
before it. The target is residual replay (replay minus what position in the song predicts,
experiments.replay_targets) and the loss is within-song pairwise: of two windows from the same song, the
more replayed one should score higher.

Variants differ only in their inputs, so comparing them on Eastern vs. Western songs tests the hypothesis:
    full      tonic CQT + all features + CLAP
    western   semitone CQT + DSP + spatial + CLAP (no vocal, intonation or eastern features)
Evaluation uses folds grouped by artist: a test song's artist is never in training.

    python -m musicdna.experiments.moment_model --variants full western --folds 5
"""
from __future__ import annotations
import argparse
import json
import math
import time
from dataclasses import dataclass, field
from typing import Any

import numpy as np
import torch
from torch import nn

from musicdna.corpus.genre_mix import GenreMixEntry
from musicdna.corpus.registry import get_corpus
from musicdna.experiments.replay_targets import PositionPrior, SongTargets
from musicdna.features.cqt import HOP, tonic_view, western_view
from musicdna.paths import RESEARCH_OUTPUT_DIR

FEATURE_GROUPS = ('dsp', 'spatial', 'vocal', 'intonation', 'intonation_profile', 'eastern')
VARIANTS: dict[str, dict[str, Any]] = {
    'full':    {'cqt': 'tonic', 'features': FEATURE_GROUPS, 'clap': True},
    'western': {'cqt': 'western', 'features': ('dsp', 'spatial'), 'clap': True},
    # Ablations: remove one input family at a time from the full model.
    'full_no_cnn':      {'cqt': None, 'features': FEATURE_GROUPS, 'clap': True},
    'full_no_clap':     {'cqt': 'tonic', 'features': FEATURE_GROUPS, 'clap': False},
    'full_no_features': {'cqt': 'tonic', 'features': (), 'clap': True},
}
CLEAR_GAP = 0.1   # residual-replay gap for a pair to count (as in notebook 02, Step 2d)


@dataclass
class Song:
    video_id: str
    region: str
    genre: str
    artist: str
    targets: SongTargets
    features: dict[str, np.ndarray]        # group -> (windows, dims), kept windows only
    cqt: dict[str, np.ndarray] = field(default_factory=dict)  # view -> (windows, channels, rows, frames)


def load_songs(variants: list[str], corpus_name: str = 'genre_mix') -> list[Song]:
    corpus = get_corpus(corpus_name)
    store = corpus.feature_store()
    views = {VARIANTS[v]['cqt'] for v in variants} - {None}
    groups = {g for v in variants for g in VARIANTS[v]['features']} | ({'clap'} if any(VARIANTS[v]['clap'] for v in variants) else set())
    frames = int(math.ceil(store.config.windows.window_sec * store.config.vocal.sample_rate / HOP))
    songs = []
    for entry in corpus.load().entries:
        assert isinstance(entry, GenreMixEntry)
        if not entry.replay_curve or not all(store.has(entry.video_id, g) for g in groups):
            continue
        if views and not store.has(entry.video_id, 'cqt'):
            continue
        windows = store.windows(entry)
        targets = SongTargets.build(entry.video_id, entry.replay_curve, windows, store.duration(entry))
        if len(targets.index) < 8:
            continue
        song = Song(entry.video_id, entry.region, entry.genre, entry.artists, targets,
                    # Windows without singing have NaN vocal/intonation descriptors; 0 = "nothing measured".
                    {g: np.nan_to_num(store.load(entry.video_id, g)[targets.index].astype(np.float32)) for g in groups})
        if views:
            stored = np.load(store.path(entry.video_id, 'cqt'))
            meta = store.load_json(entry.video_id, 'cqt_meta')
            rate = store.config.vocal.sample_rate
            for view in views:
                picture = tonic_view(stored, meta['tonic_offset']) if view == 'tonic' else western_view(stored)
                crops = []
                for i in targets.index:
                    start = int(windows[i][0] * rate / HOP)
                    crop = picture[:, :, start:start + frames].astype(np.float16)
                    crops.append(np.pad(crop, ((0, 0), (0, 0), (0, frames - crop.shape[-1]))))
                song.cqt[view] = np.stack(crops)
        songs.append(song)
    return songs


class WindowCNN(nn.Module):
    """(channels, rows, frames) -> 128. Kernels span 5 rows (one semitone at 20 cents) by 3 frames.

    The first layer keeps every pitch row but halves time (128 ms -> 256 ms steps): pitch detail is the
    point of the fine CQT. Measured on one 45-window song, CPU, Demucs running alongside: 3.7 s -> 1.6 s per step.
    """

    def __init__(self, channels: int) -> None:
        super().__init__()
        layers = [nn.Conv2d(channels, 16, (5, 3), stride=(1, 2), padding=(2, 1)), nn.BatchNorm2d(16), nn.GELU(), nn.MaxPool2d(2)]
        width = 16
        for out in (32, 64, 128):
            layers += [nn.Conv2d(width, out, (5, 3), padding=(2, 1)), nn.BatchNorm2d(out), nn.GELU(), nn.MaxPool2d(2)]
            width = out
        self.body = nn.Sequential(*layers)
        self.out = nn.Linear(128 * 4, 128)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        # Average over time, then over 4 pitch bands (low to high). Written out because adaptive pooling
        # with uneven sizes is not implemented on Apple's MPS backend.
        x = self.body(x).mean(dim=-1)
        bands = torch.stack([band.mean(dim=-1) for band in torch.tensor_split(x, 4, dim=-1)], dim=-1)
        return self.out(bands.flatten(1))


class MomentModel(nn.Module):
    def __init__(self, cnn_channels: int | None, feature_dims: int, width: int = 128) -> None:
        super().__init__()
        self.cnn = WindowCNN(cnn_channels) if cnn_channels else None
        self.mlp = nn.Sequential(nn.Linear(feature_dims, width), nn.GELU(), nn.Dropout(0.2), nn.Linear(width, width)) if feature_dims else None
        parts = (width if self.cnn else 0) + (width if self.mlp else 0)
        self.fuse = nn.Sequential(nn.LayerNorm(parts), nn.Linear(parts, width))
        layer = nn.TransformerEncoderLayer(width, nhead=4, dim_feedforward=2 * width, dropout=0.1, batch_first=True)
        self.sequence = nn.TransformerEncoder(layer, num_layers=2)
        self.head = nn.Linear(width, 1)
        self.width = width

    def positional(self, n: int) -> torch.Tensor:
        position = torch.arange(n).unsqueeze(1)
        rate = torch.exp(torch.arange(0, self.width, 2) * (-math.log(10000.0) / self.width))
        table = torch.zeros(n, self.width)
        table[:, 0::2], table[:, 1::2] = torch.sin(position * rate), torch.cos(position * rate)
        return table

    def forward(self, cqt: torch.Tensor | None, features: torch.Tensor | None) -> torch.Tensor:
        parts = []
        if self.cnn is not None:
            parts.append(self.cnn(cqt))
        if self.mlp is not None:
            parts.append(self.mlp(features))
        tokens = self.fuse(torch.cat(parts, dim=-1))
        tokens = tokens + self.positional(len(tokens)).to(tokens.device)
        return self.head(self.sequence(tokens.unsqueeze(0))).squeeze(0).squeeze(-1)


def pairwise_loss(scores: torch.Tensor, residual: torch.Tensor) -> torch.Tensor:
    gap = residual.unsqueeze(1) - residual.unsqueeze(0)
    mask = gap > CLEAR_GAP
    if not mask.any():
        return scores.sum() * 0.0
    diff = scores.unsqueeze(1) - scores.unsqueeze(0)
    return (nn.functional.softplus(-diff[mask]) * gap[mask]).sum() / gap[mask].sum()


def song_metrics(scores: np.ndarray, residual: np.ndarray) -> dict[str, float]:
    """Pairwise accuracy on clear pairs, Spearman, and whether the top-scored window is within one hop of the top one."""
    from scipy.stats import spearmanr
    gap = residual[:, None] - residual[None, :]
    mask = gap > CLEAR_GAP
    accuracy = float(np.mean((scores[:, None] - scores[None, :])[mask] > 0)) if mask.any() else float('nan')
    rho = spearmanr(scores, residual).statistic
    return {'pairwise_accuracy': accuracy, 'spearman': float(rho) if np.isfinite(rho) else float('nan'),
            'top1_within_1': float(abs(int(np.argmax(scores)) - int(np.argmax(residual))) <= 1)}


class Trainer:
    def __init__(self, variant: str, epochs: int = 40, patience: int = 6, lr: float = 3e-4, seed: int = 0,
                 device: str = 'cpu') -> None:
        self.spec, self.variant = VARIANTS[variant], variant
        self.epochs, self.patience, self.lr, self.seed, self.device = epochs, patience, lr, seed, torch.device(device)

    def inputs(self, song: Song, mean: np.ndarray | None, std: np.ndarray | None) -> tuple[torch.Tensor | None, torch.Tensor | None]:
        cqt = torch.from_numpy(song.cqt[self.spec['cqt']].astype(np.float32)).to(self.device) if self.spec['cqt'] else None
        groups = list(self.spec['features']) + (['clap'] if self.spec['clap'] else [])
        if not groups:
            return cqt, None
        x = np.concatenate([song.features[g] for g in groups], axis=1)
        return cqt, torch.from_numpy((x - mean) / std).float().to(self.device)

    def fit_predict(self, train: list[Song], test: list[Song]) -> tuple[dict[str, np.ndarray], dict[str, np.ndarray]]:
        """Scores and residual targets per test song. The position prior and feature scaling come from the
        training songs only; a seventh of them is held back for early stopping."""
        torch.manual_seed(self.seed)
        rng = np.random.default_rng(self.seed)
        order = rng.permutation(len(train))
        n_val = max(1, len(train) // 7)
        val, fit = [train[i] for i in order[:n_val]], [train[i] for i in order[n_val:]]
        prior = PositionPrior().fit([s.targets for s in fit])
        residual = {s.video_id: prior.residual(s.targets).astype(np.float32) for s in train + test}
        groups = list(self.spec['features']) + (['clap'] if self.spec['clap'] else [])
        mean = std = None
        if groups:
            stacked = np.concatenate([np.concatenate([s.features[g] for g in groups], axis=1) for s in fit])
            mean, std = stacked.mean(axis=0), stacked.std(axis=0) + 1e-6
        channels = fit[0].cqt[self.spec['cqt']].shape[1] if self.spec['cqt'] else None
        dims = int(mean.shape[0]) if mean is not None else 0
        model = MomentModel(channels, dims).to(self.device)
        optimizer = torch.optim.AdamW(model.parameters(), lr=self.lr, weight_decay=1e-2)
        best, best_state, waited = float('inf'), None, 0
        for _ in range(self.epochs):
            model.train()
            for i in rng.permutation(len(fit)):
                song = fit[i]
                loss = pairwise_loss(model(*self.inputs(song, mean, std)), torch.from_numpy(residual[song.video_id]).to(self.device))
                optimizer.zero_grad()
                loss.backward()
                optimizer.step()
            model.eval()
            with torch.no_grad():
                val_loss = float(np.mean([pairwise_loss(model(*self.inputs(s, mean, std)),
                                                        torch.from_numpy(residual[s.video_id]).to(self.device)).item() for s in val]))
            if val_loss < best - 1e-4:
                best, best_state, waited = val_loss, {k: v.detach().clone() for k, v in model.state_dict().items()}, 0
            else:
                waited += 1
                if waited >= self.patience:
                    break
        model.load_state_dict(best_state)
        model.eval()
        with torch.no_grad():
            scores = {s.video_id: model(*self.inputs(s, mean, std)).cpu().numpy() for s in test}
        return scores, {s.video_id: residual[s.video_id] for s in test}


def artist_folds(songs: list[Song], k: int, seed: int = 0) -> list[list[int]]:
    """Song indices per fold; all songs by one artist share a fold."""
    artists = sorted({s.artist for s in songs})
    rng = np.random.default_rng(seed)
    assignment = {a: i % k for i, a in enumerate(rng.permutation(artists))}
    return [[i for i, s in enumerate(songs) if assignment[s.artist] == f] for f in range(k)]


def summarize(per_song: list[dict[str, Any]], seed: int = 0) -> dict[str, Any]:
    rng = np.random.default_rng(seed)
    out: dict[str, Any] = {}
    for region in ('all', 'eastern', 'western', 'house'):
        rows = [r for r in per_song if region == 'all' or r['region'] == region]
        if not rows:
            continue
        out[region] = {'songs': len(rows)}
        for metric in ('pairwise_accuracy', 'spearman', 'top1_within_1'):
            values = np.array([r[metric] for r in rows if np.isfinite(r[metric])])
            boots = [np.mean(rng.choice(values, len(values))) for _ in range(2000)]
            out[region][metric] = {'mean': float(values.mean()), 'ci95': [float(x) for x in np.percentile(boots, [2.5, 97.5])]}
    return out


def evaluate(variant: str, songs: list[Song], folds: int, epochs: int, device: str) -> dict[str, Any]:
    per_song, started = [], time.time()
    for f, test_idx in enumerate(artist_folds(songs, folds)):
        held_out = set(test_idx)
        test = [songs[i] for i in test_idx]
        train = [s for i, s in enumerate(songs) if i not in held_out]
        scores, residual = Trainer(variant, epochs=epochs, device=device).fit_predict(train, test)
        for s in test:
            per_song.append({'video_id': s.video_id, 'region': s.region, 'genre': s.genre,
                             **song_metrics(scores[s.video_id], residual[s.video_id])})
        print(f'  {variant} fold {f + 1}/{folds} done ({time.time() - started:.0f} s)', flush=True)
    return {'variant': variant, 'spec': {k: (list(v) if isinstance(v, tuple) else v) for k, v in VARIANTS[variant].items()},
            'summary': summarize(per_song), 'per_song': per_song}


def baselines(songs: list[Song], folds: int) -> dict[str, Any]:
    """Untrained rules scored on the same residual targets (prior fitted per fold on the training songs)."""
    rules = {'loudest': lambda s: s.features['dsp'][:, 0], 'brightest': lambda s: s.features['dsp'][:, 1],
             'busiest (onsets)': lambda s: s.features['dsp'][:, 2]}
    rng = np.random.default_rng(0)
    rows: dict[str, list[dict[str, Any]]] = {name: [] for name in [*rules, 'random']}
    for test_idx in artist_folds(songs, folds):
        train = [s for i, s in enumerate(songs) if i not in set(test_idx)]
        prior = PositionPrior().fit([s.targets for s in train])
        for i in test_idx:
            s = songs[i]
            residual = prior.residual(s.targets)
            for name, rule in rules.items():
                rows[name].append({'region': s.region, **song_metrics(rule(s), residual)})
            rows['random'].append({'region': s.region, **song_metrics(rng.random(len(residual)), residual)})
    return {name: summarize(r) for name, r in rows.items()}


def main() -> None:
    parser = argparse.ArgumentParser(description='Train and evaluate the moment model variants')
    parser.add_argument('--variants', nargs='+', choices=list(VARIANTS), default=['full', 'western'])
    parser.add_argument('--folds', type=int, default=5)
    parser.add_argument('--epochs', type=int, default=40)
    parser.add_argument('--device', default='cpu')
    arguments = parser.parse_args()
    songs = load_songs(arguments.variants)
    print(f'{len(songs)} songs ({sum(len(s.targets.index) for s in songs)} windows)', flush=True)
    report: dict[str, Any] = {'songs': len(songs), 'baselines': baselines(songs, arguments.folds), 'variants': {}}
    for variant in arguments.variants:
        report['variants'][variant] = evaluate(variant, songs, arguments.folds, arguments.epochs, arguments.device)
    RESEARCH_OUTPUT_DIR.mkdir(exist_ok=True)
    path = RESEARCH_OUTPUT_DIR / 'moment_model_report.json'
    path.write_text(json.dumps(report, indent=2) + '\n', encoding='utf8')
    for name, entry in [*[(f'baseline {k}', v) for k, v in report['baselines'].items()],
                        *[(k, v['summary']) for k, v in report['variants'].items()]]:
        cells = '  '.join(f"{r}: {entry[r]['pairwise_accuracy']['mean']:.3f}" for r in ('all', 'eastern', 'western', 'house') if r in entry)
        print(f'{name:<26} pairwise accuracy  {cells}')
    print(f'-> {path}')


if __name__ == '__main__':
    main()
