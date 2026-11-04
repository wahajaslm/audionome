"""Microtonal intonation: where a singer places held notes, relative to the song's own tonic (Sa).

Kept separate from ornamentation (`features.vocal`: vibrato, slides, ornaments), because the two
are different things: intonation is *where* a note sits, ornamentation is *how* the voice moves.

Nothing is snapped to piano keys. Pitch stays continuous (cents), and is compared with two
reference grids only to describe it:
  - equal temperament (12 equal steps of 100 cents), built on the detected tonic, not on A = 440 Hz;
  - just-intonation ratios (simple whole-number ratios to the tonic, e.g. Pa = 3/2 = 702 cents).

Example: a singer holds Ga (the third) at 375 cents above Sa. Equal temperament puts it at 400
(25 cents flat of that grid); the just major third 5/4 is 386 cents (11 cents flat of that). Both
numbers are kept; neither is treated as "correct".

Reliability: these values depend on the vocal stem, the pitch tracker and the tonic estimate.
`TonicEstimate.confidence` and (when available) hand-annotated tonics let R02 measure that error
instead of assuming it away.
"""
from __future__ import annotations
from dataclasses import asdict, astuple, dataclass

import numpy as np

from musicdna.config import DEFAULT, IntonationConfig
from musicdna.features.vocal import PitchContour

# Just-intonation intervals above the tonic, in cents (1/1, 16/15, 9/8, 6/5, 5/4, 4/3, 45/32, 3/2, 8/5, 5/3, 9/5, 15/8).
JUST_INTERVALS_CENTS = 1200 * np.log2(np.array([1, 16 / 15, 9 / 8, 6 / 5, 5 / 4, 4 / 3, 45 / 32, 3 / 2, 8 / 5, 5 / 3, 9 / 5, 15 / 8]))
FIFTH_CENTS = 1200 * np.log2(3 / 2)  # 701.96


@dataclass
class TonicEstimate:
    midi: float          # tonic as a continuous MIDI number (60.37 = 37 cents above C4)
    confidence: float    # 0-1: how clearly the best candidate beat the runner-up
    source: str          # 'detected' or 'annotated'

    @property
    def hz(self) -> float:
        return float(440.0 * 2 ** ((self.midi - 69) / 12))


@dataclass
class HeldNote:
    start: int           # frame indices into the contour
    end: int
    centre_midi: float   # vibrato removed
    wobble_cents: float  # spread of the smoothed pitch while held
    glide_in_cents: float  # size of the slide into the note (0 = arrived directly)


@dataclass
class IntonationDescriptors:
    held_note_fraction: float        # share of voiced time spent on held notes
    et_deviation_mean_abs_cents: float   # average distance from the equal-tempered grid on the tonic
    et_offgrid_fraction: float       # share of held notes further than offgrid_threshold from that grid
    grid_alignment: float            # 0-1, tonic-independent: 1 = notes keep one fixed offset from the 100-cent grid
    just_deviation_mean_abs_cents: float  # average distance from the nearest just-intonation interval
    held_note_wobble_cents: float    # how steady held notes are (vibrato removed)
    glide_in_fraction: float         # share of held notes reached by a slide (meend)
    glide_in_mean_cents: float       # average size of those slides

    NAMES = ('held_note_fraction', 'et_deviation_mean_abs_cents', 'et_offgrid_fraction', 'grid_alignment',
             'just_deviation_mean_abs_cents', 'held_note_wobble_cents', 'glide_in_fraction', 'glide_in_mean_cents')

    @classmethod
    def empty(cls) -> IntonationDescriptors:
        return cls(0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0)

    def to_vector(self) -> np.ndarray:
        return np.array(astuple(self), dtype=np.float64)

    def to_dict(self) -> dict[str, float]:
        return {key: round(float(value), 3) for key, value in asdict(self).items()}


class IntonationAnalyzer:
    """Tonic estimation, held-note detection and intonation descriptors on a continuous pitch contour."""

    def __init__(self, settings: IntonationConfig = DEFAULT.intonation) -> None:
        self.settings = settings

    # ---------- held notes ----------

    def smoothed(self, contour: PitchContour) -> np.ndarray:
        """Moving average over voiced frames that removes vibrato but keeps note changes and slides.
        Example: a note at 57.27 with +-30 cent vibrato at 5.5 Hz smooths to ~57.27 throughout."""
        width = max(3, int(self.settings.smoothing_sec * contour.frame_rate) | 1)
        voiced = ~np.isnan(contour.semitones)
        values = np.where(voiced, contour.semitones, 0.0)
        kernel = np.ones(width)
        total = np.convolve(values, kernel, mode='same')
        count = np.convolve(voiced.astype(float), kernel, mode='same')
        # Average whatever voiced frames are nearby (at least 3), so a slide that starts right after a
        # breath keeps its first frames instead of being cut.
        smooth = np.where(count >= 3, total / np.maximum(count, 1e-9), np.nan)
        return np.where(voiced, smooth, np.nan)

    def held_notes(self, contour: PitchContour) -> list[HeldNote]:
        """Runs where the smoothed pitch moves slower than stable_max_velocity for at least stable_min_sec."""
        s = self.settings
        rate = contour.frame_rate
        smooth = self.smoothed(contour)
        velocity = np.abs(np.gradient(np.nan_to_num(smooth, nan=0.0))) * rate * 100  # cents per second
        steady = ~np.isnan(smooth) & (velocity < s.stable_max_velocity_cents_per_sec)
        edges = np.flatnonzero(np.diff(np.concatenate([[0], steady.astype(int), [0]])))
        notes = []
        for start, end in zip(edges[::2], edges[1::2]):
            if (end - start) / rate < s.stable_min_sec:
                continue
            segment = smooth[start:end]
            notes.append(HeldNote(int(start), int(end), float(np.median(segment)),
                                  float(np.std(segment) * 100),
                                  self._glide_in(smooth, int(start), float(np.median(segment)), rate)))
        return notes

    def _glide_in(self, smooth: np.ndarray, onset: int, centre: float, rate: float) -> float:
        """Size of a slide into a held note: the furthest the voiced pitch was from the note's centre
        during the glide window before it. Measured from the centre, not window start to end, because
        vibrato smoothing spreads a slide over a longer stretch.
        Example: a 0.25 s slide up 200 cents into Ga reports ~200 (start-to-end of a 0.3 s window gave ~145)."""
        window = smooth[max(0, onset - int(self.settings.glide_window_sec * rate)):onset]
        # Only the unbroken voiced stretch right before the note: a breath ends the slide.
        # Example: note A, breath, note B sung directly -> no slide, even though A is within the window.
        gaps = np.flatnonzero(np.isnan(window))
        lookback = window[gaps[-1] + 1:] if gaps.size else window
        if lookback.size < 3:
            return 0.0
        extent = float(np.max(np.abs(lookback - centre))) * 100
        return extent if extent >= self.settings.glide_min_cents else 0.0

    # ---------- tonic ----------

    def estimate_tonic(self, contour: PitchContour) -> TonicEstimate:
        """Most-sung pitch class among held notes, supported by its fifth (Sa-Pa), as a continuous value.

        Example: held notes cluster at 0 and 702 cents above 57.35 -> tonic 57.35 (A3 + 35 cents),
        not rounded to A3. Octave: the tonic register nearest below the median sung pitch.
        """
        s = self.settings
        notes = self.held_notes(contour)
        if not notes:
            return TonicEstimate(float('nan'), 0.0, 'detected')
        centres = np.array([n.centre_midi for n in notes])
        weights = np.array([n.end - n.start for n in notes], dtype=float)
        bins = int(round(1200 / s.histogram_bin_cents))
        positions = np.mod(centres * 100, 1200)
        histogram = np.bincount((positions / s.histogram_bin_cents).astype(int) % bins, weights=weights, minlength=bins)
        histogram = self._circular_smooth(histogram, s.histogram_smoothing_cents / s.histogram_bin_cents)
        fifth_shift = int(round(FIFTH_CENTS / s.histogram_bin_cents))
        score = histogram + s.tonic_fifth_weight * np.roll(histogram, -fifth_shift)
        order = np.argsort(score)[::-1]
        candidates = [order[0]] + [i for i in order[1:] if self._circular_distance(i, order[0], bins) > 2][:s.tonic_candidates - 1]
        best = candidates[0]
        runner_up = score[candidates[1]] if len(candidates) > 1 else 0.0
        confidence = float((score[best] - runner_up) / score[best]) if score[best] > 0 else 0.0
        # Refine within the bin using the held notes near the winning pitch class.
        offsets = (positions - best * s.histogram_bin_cents + 600) % 1200 - 600
        near = np.abs(offsets) <= s.histogram_smoothing_cents
        pitch_class = (best * s.histogram_bin_cents + (np.average(offsets[near], weights=weights[near]) if near.any() else 0.0)) % 1200
        median = float(np.median(centres))
        tonic_midi = (pitch_class / 100) + 12 * np.floor((median - pitch_class / 100) / 12)
        return TonicEstimate(float(tonic_midi), confidence, 'detected')

    # ---------- descriptors ----------

    def describe(self, contour: PitchContour, tonic: TonicEstimate, start_sec: float, end_sec: float) -> IntonationDescriptors:
        notes = [n for n in self.held_notes(contour)
                 if start_sec <= contour.times[min(n.start, len(contour.times) - 1)] < end_sec]
        times, semitones = contour.span(start_sec, end_sec)
        voiced_frames = int((~np.isnan(semitones)).sum())
        if not notes or not np.isfinite(tonic.midi) or voiced_frames == 0:
            return IntonationDescriptors.empty()
        relative = np.mod(np.array([(n.centre_midi - tonic.midi) * 100 for n in notes]), 1200)
        et_deviation = (relative + 50) % 100 - 50
        just_deviation = np.min(np.abs(((relative[:, None] - JUST_INTERVALS_CENTS[None, :]) + 600) % 1200 - 600), axis=1)
        # Circular statistics on the 100-cent grid do not depend on where the tonic is.
        angles = 2 * np.pi * np.mod(np.array([n.centre_midi * 100 for n in notes]), 100) / 100
        alignment = float(np.abs(np.mean(np.exp(1j * angles))))
        glides = np.array([n.glide_in_cents for n in notes])
        return IntonationDescriptors(
            held_note_fraction=min(1.0, sum(n.end - n.start for n in notes) / voiced_frames),
            et_deviation_mean_abs_cents=float(np.mean(np.abs(et_deviation))),
            et_offgrid_fraction=float(np.mean(np.abs(et_deviation) > self.settings.offgrid_threshold_cents)),
            grid_alignment=alignment,
            just_deviation_mean_abs_cents=float(np.mean(just_deviation)),
            held_note_wobble_cents=float(np.mean([n.wobble_cents for n in notes])),
            glide_in_fraction=float(np.mean(glides > 0)),
            glide_in_mean_cents=float(glides[glides > 0].mean()) if (glides > 0).any() else 0.0,
        )

    def profile(self, contour: PitchContour, tonic: TonicEstimate, start_sec: float, end_sec: float) -> np.ndarray:
        """Share of voiced time at each tonic-relative pitch (profile_bins over one octave), from the
        continuous contour. Example with 24 bins: bin 0 = Sa +-25 cents, bin 14 = Pa (700 cents)."""
        bins = self.settings.profile_bins
        _, semitones = contour.span(start_sec, end_sec)
        voiced = semitones[~np.isnan(semitones)]
        if voiced.size == 0 or not np.isfinite(tonic.midi):
            return np.zeros(bins)
        width = 1200 / bins
        relative = np.mod((voiced - tonic.midi) * 100 + width / 2, 1200)
        counts = np.bincount((relative / width).astype(int) % bins, minlength=bins).astype(float)
        return counts / counts.sum()

    @staticmethod
    def _circular_smooth(values: np.ndarray, sigma_bins: float) -> np.ndarray:
        radius = max(1, int(3 * sigma_bins))
        kernel = np.exp(-0.5 * (np.arange(-radius, radius + 1) / max(sigma_bins, 1e-6)) ** 2)
        padded = np.concatenate([values[-radius:], values, values[:radius]])
        return np.convolve(padded, kernel / kernel.sum(), mode='same')[radius:-radius]

    @staticmethod
    def _circular_distance(a: int, b: int, size: int) -> int:
        return min((a - b) % size, (b - a) % size)
