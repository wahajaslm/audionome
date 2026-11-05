"""Moment model on synthetic songs: shapes, loss, and that it learns a planted signal (no corpus needed)."""
import numpy as np
import torch
from musicdna.experiments.moment_model import MomentModel, Song, Trainer, pairwise_loss, song_metrics, summarize
from musicdna.experiments.replay_targets import SongTargets


def synthetic_song(i, rng, windows=20):
    # Replay follows feature 0 of the "eastern" block plus noise; position adds a hump the prior removes.
    signal = rng.normal(size=windows)
    position = np.linspace(0.05, 0.95, windows)
    replay = 0.5 + 0.15 * signal + 0.3 * np.sin(np.pi * position) + 0.02 * rng.normal(size=windows)
    targets = SongTargets(f's{i}', np.arange(windows), position, replay)
    features = {g: rng.normal(size=(windows, d)).astype(np.float32) for g, d in
                (('dsp', 25), ('spatial', 7), ('vocal', 9), ('intonation', 8), ('intonation_profile', 24), ('clap', 16))}
    eastern = rng.normal(size=(windows, 12)).astype(np.float32)
    eastern[:, 0] = signal
    features['eastern'] = eastern
    cqt = {'tonic': rng.random((windows, 4, 360, 12)).astype(np.float16)}
    return Song(f's{i}', 'eastern' if i % 2 else 'western', 'g', f'artist{i}', targets, features, cqt)


def test_shapes_and_loss():
    model = MomentModel(cnn_channels=4, hand_dims=10, embedding_dims=16)
    scores = model(torch.rand(15, 4, 360, 32), torch.rand(15, 10), torch.rand(15, 16))  # real windows have 94 frames
    assert scores.shape == (15,)
    loss = pairwise_loss(scores, torch.linspace(0, 1, 15))
    loss.backward()
    assert loss.item() > 0


def test_learns_a_planted_signal_without_the_cnn():
    rng = np.random.default_rng(0)
    songs = [synthetic_song(i, rng) for i in range(24)]
    scores, residual = Trainer('full_no_cnn', epochs=15, patience=15).fit_predict(songs[:18], songs[18:])
    accuracy = np.mean([song_metrics(scores[s.video_id], residual[s.video_id])['pairwise_accuracy'] for s in songs[18:]])
    assert accuracy > 0.75, accuracy


def test_summary_reports_regions_with_intervals():
    rows = [{'region': r, 'pairwise_accuracy': a, 'spearman': 0.1, 'top1_within_1': 1.0}
            for r, a in (('eastern', 0.7), ('eastern', 0.8), ('western', 0.6))]
    out = summarize(rows)
    assert out['all']['songs'] == 3 and out['eastern']['pairwise_accuracy']['mean'] == 0.75


def test_shuffling_the_planted_block_hurts_most():
    from musicdna.experiments.moment_model import importance_summary
    rng = np.random.default_rng(1)
    songs = [synthetic_song(i, rng) for i in range(24)]
    trainer = Trainer('full_no_cnn', epochs=15, patience=15)
    scores, residual = trainer.fit_predict(songs[:18], songs[18:])
    per_song = [{'video_id': s.video_id, 'region': s.region,
                 **song_metrics(scores[s.video_id], residual[s.video_id])} for s in songs[18:]]
    drops = importance_summary(per_song, trainer.importance(songs[18:], residual))
    # The replay signal was planted in the eastern block, so shuffling it costs the most.
    assert max(drops, key=lambda name: drops[name]['all']['drop']) == 'eastern ensemble'


def test_paired_comparison_reports_difference_per_region():
    from musicdna.experiments.moment_model import comparisons
    a = {'per_song': [{'video_id': 'x', 'region': 'eastern', 'pairwise_accuracy': 0.7},
                      {'video_id': 'y', 'region': 'eastern', 'pairwise_accuracy': 0.6}]}
    b = {'per_song': [{'video_id': 'x', 'region': 'eastern', 'pairwise_accuracy': 0.6},
                      {'video_id': 'y', 'region': 'eastern', 'pairwise_accuracy': 0.6}]}
    out = comparisons({'full': a, 'western': b})
    assert abs(out['full - western']['eastern']['diff'] - 0.05) < 1e-9 and out['full - western']['eastern']['songs'] == 2
