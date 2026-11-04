"""Time-continuous description of a song for the player's Explore view.

The window analysis (12 s windows, one every 6 s) cannot follow the playhead. This module makes
curves and events on the song's own time axis instead:

  quick tier (mix only, seconds):  beats and bars, one chord per beat, song parts, repeated
                                   chord patterns, loudness and brightness at 10 frames/s
  full tier (needs stems, minutes): loudness of each Demucs stem at 10 frames/s, chords again
                                   from bass + other (no voice or drums in the chroma), and the
                                   vocal melody from the vocal stem

Everything is a measurement of the audio; nothing here describes the listener.
"""
from __future__ import annotations
from typing import Any
import numpy as np
import librosa

FPS = 10                      # curve frame rate
SR = 22050                    # analysis sample rate
PITCH_CLASSES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
CHORD_QUALITIES = {'': [0, 4, 7], 'm': [0, 3, 7], '7': [0, 4, 7, 10]}
STEM_NAMES = ('vocals', 'drums', 'bass', 'other')


def _chord_templates() -> tuple[list[str], np.ndarray]:
    """36 unit templates (12 roots x major, minor, dominant 7th); the root is weighted up."""
    names, rows = [], []
    for root in range(12):
        for quality, intervals in CHORD_QUALITIES.items():
            v = np.zeros(12)
            v[[(root + i) % 12 for i in intervals]] = 1.0
            v[root] += 0.5
            names.append(PITCH_CLASSES[root] + quality)
            rows.append(v / np.linalg.norm(v))
    return names, np.array(rows)


def _beat_edges(beats: np.ndarray, duration: float) -> np.ndarray:
    """librosa.util.sync adds one column before the first and after the last beat."""
    return np.concatenate([[0.0], beats, [duration]])


def beat_chroma(harmony: np.ndarray, sr: int, beats: np.ndarray, hop: int = 512) -> np.ndarray:
    """Harmonic chroma, one median column per beat interval. Shape (12, len(beats) + 1)."""
    chroma = librosa.feature.chroma_cqt(y=librosa.effects.harmonic(harmony), sr=sr, hop_length=hop)
    frames = librosa.time_to_frames(beats, sr=sr, hop_length=hop)
    return librosa.util.sync(chroma, frames, aggregate=np.median)


def beat_chords(bchroma: np.ndarray, beats: np.ndarray, duration: float,
                sharpness: float = 20.0, stay: float = 0.5) -> list[dict[str, Any]]:
    """
    One chord per beat, Viterbi-smoothed, merged into blocks with real start and end times.

    CHORD TIMING FIX - the window analysis matched a chord every ~0.2 s with no smoothing, kept
    only the first 8 changes of each 12 s window and the player then spread those 8 evenly over
    the 12 s. Chords flickered and sat at the wrong time.
    Example (song 5580a385, 1:35-2:41): 44 chords listed before; on the beat it is 31 changes,
    a steady Dm-C loop, each block starting on a beat.
    """
    names, templates = _chord_templates()
    unit = bchroma / (np.linalg.norm(bchroma, axis=0, keepdims=True) + 1e-9)
    similarity = templates @ unit
    prob = np.exp(similarity * sharpness)
    prob /= prob.sum(axis=0, keepdims=True)
    path = librosa.sequence.viterbi_discriminative(prob, librosa.sequence.transition_loop(len(names), stay))
    edges = _beat_edges(beats, duration)
    blocks: list[dict[str, Any]] = []
    for i, k in enumerate(path):
        a, b = float(edges[i]), float(edges[min(i + 1, len(edges) - 1)])
        if b <= a:
            continue
        conf = float(similarity[k, i])
        if blocks and blocks[-1]['c'] == names[k]:
            blocks[-1]['b'] = b
            blocks[-1]['_conf'].append(conf)
        else:
            blocks.append({'c': names[k], 'a': a, 'b': b, '_conf': [conf]})
    for blk in blocks:
        blk['conf'] = round(float(np.mean(blk.pop('_conf'))), 3)
        blk['a'], blk['b'] = round(blk['a'], 3), round(blk['b'], 3)
    return blocks


def song_key(bchroma: np.ndarray) -> str | None:
    """Krumhansl key of the whole song, e.g. 'D Minor' (same estimator as the window analysis)."""
    from musicdna.features.structure import MusicalStructureAnalyzer
    if bchroma.size == 0:
        return None
    key, _ = MusicalStructureAnalyzer.estimate_key(bchroma.mean(axis=1))
    return key


def song_parts(y: np.ndarray, sr: int, beats: np.ndarray, loudness: np.ndarray, duration: float,
               n_boundaries: int = 14, n_labels: int = 4, hop: int = 512) -> list[dict[str, Any]]:
    """
    Song parts: boundaries from beat-synced chroma + MFCC (agglomerative), then parts that sound
    alike share a letter (A = the first one heard). Neighbouring parts with the same letter merge.
    Example: [A 0:00-0:29, B 0:29-1:16, ..., D 1:57-3:46] for a 4:38 song.
    """
    from scipy.cluster.hierarchy import fcluster, linkage
    frames = librosa.time_to_frames(beats, sr=sr, hop_length=hop)
    chroma = librosa.util.sync(librosa.feature.chroma_cqt(y=y, sr=sr, hop_length=hop), frames)
    mfcc = librosa.util.sync(librosa.feature.mfcc(y=y, sr=sr, hop_length=hop, n_mfcc=13), frames)
    feat = np.vstack([librosa.util.normalize(chroma, axis=0, norm=2), librosa.util.normalize(mfcc, axis=0, norm=2)])
    n = feat.shape[1]
    if n < 4:
        return [{'a': 0.0, 'b': round(duration, 3), 'label': 'A', 'energy': round(float(loudness.mean()), 3)}]
    bounds = list(librosa.segment.agglomerative(feat, min(n_boundaries, n))) + [n]
    edges = _beat_edges(beats, duration)
    parts, vectors = [], []
    for i in range(len(bounds) - 1):
        c0, c1 = bounds[i], bounds[i + 1]
        a, b = float(edges[min(c0, len(edges) - 1)]), float(edges[min(c1, len(edges) - 1)]) if c1 < n else duration
        if b - a < 1.0:
            continue
        lo, hi = int(a * FPS), max(int(a * FPS) + 1, int(b * FPS))
        parts.append({'a': round(a, 3), 'b': round(b, 3), 'energy': round(float(loudness[lo:hi].mean()), 3)})
        v = feat[:, c0:c1].mean(axis=1)
        vectors.append(v / (np.linalg.norm(v) + 1e-9))
    if len(parts) == 1:
        parts[0]['label'] = 'A'
        return parts
    raw = fcluster(linkage(np.array(vectors), 'average', metric='cosine'), n_labels, 'maxclust')
    order: dict[int, int] = {}
    for part, cluster in zip(parts, raw):
        part['label'] = 'ABCDEFGHIJ'[order.setdefault(int(cluster), len(order))]
    merged: list[dict[str, Any]] = []
    for part in parts:
        if merged and merged[-1]['label'] == part['label']:
            m = merged[-1]
            w1, w2 = m['b'] - m['a'], part['b'] - part['a']
            m['energy'] = round((m['energy'] * w1 + part['energy'] * w2) / (w1 + w2), 3)
            m['b'] = part['b']
        else:
            merged.append(part)
    merged[0]['a'] = 0.0
    merged[-1]['b'] = round(duration, 3)
    return merged


def chord_repeats(bchroma: np.ndarray, beats: np.ndarray, length: int = 16, step: int = 8,
                  min_gap_sec: float = 20.0, threshold: float = 0.9) -> list[dict[str, Any]]:
    """
    Where a 16-beat chord pattern comes back elsewhere in the song: for every 8th beat, the best
    match at least 20 s away, kept when the mean per-beat cosine similarity is above 0.9.
    Example: {'at': 114.08, 'same_as': 58.7, 'sim': 0.974} = the chords from 1:54 are heard at 0:58.
    """
    unit = librosa.util.normalize(bchroma[:, 1:len(beats) + 1], axis=0, norm=2)
    n = unit.shape[1]
    if n <= length * 2:
        return []
    # windowed similarity: S[i, j] = mean_k <unit[:, i+k], unit[:, j+k]>
    gram = unit.T @ unit
    m = n - length + 1   # every window start, including the one that ends on the last beat
    window = np.zeros((m, m))
    for k in range(length):
        window += gram[k:k + m, k:k + m]
    window /= length
    out = []
    for i in range(0, m, step):
        far = np.abs(beats[:m] - beats[i]) >= min_gap_sec
        if not far.any():
            continue
        scores = np.where(far, window[i], -1.0)
        j = int(np.argmax(scores))
        if scores[j] > threshold:
            out.append({'at': round(float(beats[i]), 3), 'same_as': round(float(beats[j]), 3), 'sim': round(float(scores[j]), 3)})
    return out


def _db_curve(x: np.ndarray, sr: int) -> np.ndarray:
    hop = sr // FPS
    return librosa.amplitude_to_db(librosa.feature.rms(y=x, frame_length=2 * hop, hop_length=hop)[0], ref=1.0)


def loudness_curves(mix: np.ndarray, sr: int, stems: dict[str, np.ndarray] | None = None) -> tuple[np.ndarray, dict[str, np.ndarray]]:
    """
    Mix and stem loudness at 10 frames/s on one shared 0..1 scale: 0 = the mix's quiet floor
    (2nd percentile, in dB), 1 = the mix's loudest frame. Stems use the same scale, so a stem at
    0.6 is as loud as the mix is when the mix reads 0.6.
    """
    mix_db = _db_curve(mix, sr)
    lo, hi = float(np.percentile(mix_db, 2)), float(mix_db.max())
    scale = lambda d: np.clip((d - lo) / max(1e-6, hi - lo), 0.0, 1.0)
    stem_curves = {name: scale(_db_curve(x, sr))[:len(mix_db)] for name, x in (stems or {}).items()}
    return scale(mix_db), stem_curves


def brightness_curve(mix: np.ndarray, sr: int) -> np.ndarray:
    """Spectral centroid in Hz at 10 frames/s."""
    return librosa.feature.spectral_centroid(y=mix, sr=sr, hop_length=sr // FPS)[0]


def vocal_melody(vocals: np.ndarray, sr: int, vocal_loudness: np.ndarray | None = None) -> list[float | None]:
    """
    Sung pitch as MIDI note numbers at 10 frames/s (None = no voice), from pYIN on the vocal stem.
    pYIN runs at 50 frames/s (its transition model needs a short hop) and every 5th frame is kept.
    Frames where the vocal stem is near silent are dropped, so bleed does not draw a melody.
    """
    f0, voiced, _ = librosa.pyin(vocals, fmin=80, fmax=900, sr=sr, hop_length=sr // 50, frame_length=2048)
    f0, voiced = f0[::5], voiced[::5]
    out: list[float | None] = []
    for i, (f, v) in enumerate(zip(f0, voiced)):
        quiet = vocal_loudness is not None and i < len(vocal_loudness) and vocal_loudness[i] < 0.25
        out.append(None if (not v or np.isnan(f) or quiet) else round(float(librosa.hz_to_midi(f)), 2))
    return out


def _r(values: np.ndarray, digits: int = 3) -> list[float]:
    return [round(float(v), digits) for v in values]


def quick_timeline(y: np.ndarray, sr: int, rhythm: dict[str, Any]) -> dict[str, Any]:
    """Quick tier from the mix and a beat grid ({'beats', 'downbeats', 'tempoBpm', 'beatTracker'})."""
    duration = len(y) / sr
    beats = np.asarray(rhythm['beats'], dtype=np.float64)
    mix, _ = loudness_curves(y, sr)
    bchroma = beat_chroma(y, sr, beats)
    return {
        'durationSec': round(duration, 3),
        'fps': FPS,
        'tempoBpm': rhythm.get('tempoBpm'),
        'beatTracker': rhythm.get('beatTracker'),
        'beats': _r(beats),
        'downbeats': _r(np.asarray(rhythm.get('downbeats', []), dtype=np.float64)),
        'key': song_key(bchroma),
        'chords': beat_chords(bchroma, beats, duration),
        'chordSource': 'mix',
        'sections': song_parts(y, sr, beats, mix, duration),
        'repeats': chord_repeats(bchroma, beats),
        'mix': _r(mix),
        'bright': [int(round(float(v))) for v in brightness_curve(y, sr)],
    }


def full_timeline(base: dict[str, Any], y: np.ndarray, sr: int, stems: dict[str, np.ndarray], stem_source: str) -> dict[str, Any]:
    """Adds the stem tier to a quick timeline: stem loudness, chords from bass + other, vocal melody."""
    duration = len(y) / sr
    beats = np.asarray(base['beats'], dtype=np.float64)
    _, curves = loudness_curves(y, sr, stems)
    harmony = stems.get('bass', 0) + stems.get('other', 0)
    out = dict(base)
    out['stems'] = {name: _r(curves[name]) for name in STEM_NAMES if name in curves}
    out['stemSource'] = stem_source
    if isinstance(harmony, np.ndarray):
        out['chords'] = beat_chords(beat_chroma(harmony, sr, beats), beats, duration)
        out['chordSource'] = 'bass+other'
    if 'vocals' in stems:
        out['melody'] = {'fps': FPS, 'midi': vocal_melody(stems['vocals'], sr, curves.get('vocals'))}
    return out


__all__ = ['FPS', 'SR', 'beat_chords', 'beat_chroma', 'song_key', 'song_parts', 'chord_repeats',
           'loudness_curves', 'brightness_curve', 'vocal_melody', 'quick_timeline', 'full_timeline']
