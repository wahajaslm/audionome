"""Intonation is measured against the song's own tonic and never snapped to piano keys."""
import numpy as np
import pytest

from musicdna.config import DEFAULT
from musicdna.features.intonation import JUST_INTERVALS_CENTS, IntonationAnalyzer, TonicEstimate
from musicdna.features.vocal import PitchContour

RATE = DEFAULT.vocal.sample_rate / DEFAULT.vocal.hop
TONIC = 57.35  # A3 + 35 cents: deliberately between piano keys
ANALYZER = IntonationAnalyzer()


def sing(intervals_cents: list[float], note_sec: float = 0.8, vibrato_cents: float = 30.0,
         slide_sec: float = 0.0) -> PitchContour:
    """Held notes at tonic + interval with 5.5 Hz vibrato, optionally slid into from the previous note."""
    frames, previous = [], None
    for interval in intervals_cents:
        target = TONIC + interval / 100
        if slide_sec and previous is not None:
            frames.extend(np.linspace(previous, target, int(slide_sec * RATE)))
        t = np.arange(int(note_sec * RATE)) / RATE
        frames.extend(target + (vibrato_cents / 100) * np.sin(2 * np.pi * 5.5 * t))
        frames.extend([np.nan] * int(0.1 * RATE))  # breath between notes
        previous = target
    return PitchContour.from_semitones(np.array(frames))


def test_tonic_is_found_between_piano_keys() -> None:
    contour = sing([0, 200, 400, 500, 702, 0, 702, 0, 400, 0])
    tonic = ANALYZER.estimate_tonic(contour)
    assert abs((tonic.midi - TONIC) % 12) * 100 < 10 or abs(((tonic.midi - TONIC) % 12) - 12) * 100 < 10
    assert tonic.confidence > 0


def test_equal_tempered_notes_have_no_deviation() -> None:
    contour = sing([0, 200, 400, 500, 700, 900])
    d = ANALYZER.describe(contour, TonicEstimate(TONIC, 1.0, 'annotated'), 0, contour.times[-1] + 1)
    assert d.et_deviation_mean_abs_cents < 5
    assert d.grid_alignment > 0.95


def test_consistently_sharp_singing_is_measured_not_rounded() -> None:
    """Every note 30 cents sharp of the grid: deviation is 30, and alignment stays high because the
    offset is consistent (alignment does not depend on where the tonic is)."""
    contour = sing([30, 230, 430, 530, 730])
    d = ANALYZER.describe(contour, TonicEstimate(TONIC, 1.0, 'annotated'), 0, contour.times[-1] + 1)
    assert d.et_deviation_mean_abs_cents == pytest.approx(30, abs=5)
    assert d.et_offgrid_fraction == 1.0
    assert d.grid_alignment > 0.95


def test_just_intonation_notes_sit_on_the_just_grid() -> None:
    just = [float(c) for c in JUST_INTERVALS_CENTS[[0, 2, 4, 5, 7, 9]]]  # Sa Re Ga Ma Pa Dha as simple ratios
    contour = sing(just)
    d = ANALYZER.describe(contour, TonicEstimate(TONIC, 1.0, 'annotated'), 0, contour.times[-1] + 1)
    assert d.just_deviation_mean_abs_cents < 5
    assert d.et_deviation_mean_abs_cents > 5  # e.g. just Ga is 14 cents below the equal-tempered Ga


def test_slides_into_notes_are_detected() -> None:
    contour = sing([0, 200, 400, 200, 0], slide_sec=0.25)
    d = ANALYZER.describe(contour, TonicEstimate(TONIC, 1.0, 'annotated'), 0, contour.times[-1] + 1)
    assert d.glide_in_fraction > 0.5
    assert d.glide_in_mean_cents >= 150
    direct = ANALYZER.describe(sing([0, 200, 400, 200, 0]), TonicEstimate(TONIC, 1.0, 'annotated'), 0, 30)
    assert direct.glide_in_fraction == 0


def test_profile_is_tonic_relative() -> None:
    contour = sing([0, 702, 0, 702])
    profile = ANALYZER.profile(contour, TonicEstimate(TONIC, 1.0, 'annotated'), 0, contour.times[-1] + 1)
    assert profile.sum() == pytest.approx(1.0)
    assert set(np.argsort(profile)[-2:]) == {0, 14}  # Sa and Pa (700 cents / 50-cent bins)


def test_silence_gives_empty_descriptors() -> None:
    contour = PitchContour.from_semitones(np.full(500, np.nan))
    assert not ANALYZER.describe(contour, TonicEstimate(TONIC, 1.0, 'annotated'), 0, 10).to_vector().any()
