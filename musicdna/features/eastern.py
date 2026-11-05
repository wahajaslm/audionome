"""Features for music outside Western theory: instruments, drone, rhythm density and build-up, per window.

The vocal side (tonic, microtonal intonation, glides) lives in `features.intonation` and `features.vocal`.
This module covers the rest of the ensemble, from the mix and the Demucs drums and other stems:

    roughness                     sensory dissonance between spectral peaks (Sethares model, as used by
                                  MIRtoolbox; Beier et al. 2022 found roughness peaks predict chills)
    energy_slope, energy_gain     build-up inside the window, and loudness change from the previous window
                                  (the FAV corpus: energy gain cited 14x more than energy loss)
    drone_strength                how constantly the tonic (Sa) or its fifth (Pa) sounds through the window
                                  (tanpura, harmonium, sustained bass on Sa)
    tempo_bpm, tempo_change       local tempo and its change, in octaves, from the previous window
    percussion_onset_rate         drum-stem onsets per second (tabla, dholak, darbuka, riq)
    percussion_share              drums' share of stem energy
    instrument_share              the other stem's share (sitar, sarangi, harmonium, oud, bansuri, strings)
    instrument_offgrid            share of the other stem's pitch energy on the song's off-grid scale
                                  degrees: pitches it keeps returning to that sit 40-60 cents from the nearest
                                  Western semitone (e.g. a maqam's neutral third), after the tuning correction
    instrument_solo               share of time an instrument plays while the voice is silent
    voice_instrument_alternation  switches between voice-led and instrument-led sound per minute

Example: an oud playing maqam rast returns again and again to a neutral third ~350 cents above the
tonic, so that degree is off-grid and its windows score high; a piano progression stays near 0.

FIX (2026-11-05 Step 2 check): the first versions measured the wrong things. drone_strength took the most
constant pitch class of any kind, so house synth pads scored highest (0.51 vs. Eastern songs 0.28); it
now only counts Sa or Pa. instrument_offgrid counted every pitch peak between semitones, so detuned house
synths scored highest (tech house 0.164, Bollywood 0.046); it now counts only stable off-grid scale
degrees (peaks of the song's own 20-cent pitch histogram), and a detuned spread around a Western note
has its histogram peak on the note, so it no longer counts.
"""
from __future__ import annotations

import numpy as np
import librosa

EASTERN_FEATURES = (
    'roughness', 'energy_slope', 'energy_gain', 'drone_strength', 'tempo_bpm', 'tempo_change',
    'percussion_onset_rate', 'percussion_share', 'instrument_share', 'instrument_offgrid',
    'instrument_solo', 'voice_instrument_alternation',
)

MIX_HOP = 512                 # 23 ms at 22,050 Hz
ROUGHNESS_HOP = 2048          # roughness is slow-moving; a coarser grid keeps it cheap
ROUGHNESS_PEAKS = 20
STEM_HOP = 256                # 16 ms at 16 kHz
OFFGRID_BINS_PER_OCTAVE = 60  # 20-cent bins: offsets 0, 20, 40, 60, 80 cents above each semitone
OFFGRID_OCTAVES = 6           # C2 to C8: 65 Hz to 4.2 kHz, below the 8 kHz stem Nyquist
ACTIVE_DB = -45.0             # a stem counts as sounding above this, relative to its song peak
SOLO_MARGIN_DB = 15.0         # instrument this much louder than the voice = voice silent
ALTERNATION_SMOOTH_SEC = 0.5


def sethares_roughness(freqs: np.ndarray, amps: np.ndarray) -> float:
    """Sum of pairwise dissonance of partials (Sethares 1993 parameters, as in MIRtoolbox).

    Example: partials at 440 and 466 Hz (a semitone) are far rougher than 440 and 880 Hz (an octave).
    """
    if len(freqs) < 2:
        return 0.0
    i, j = np.triu_indices(len(freqs), 1)
    f_low, f_diff = np.minimum(freqs[i], freqs[j]), np.abs(freqs[i] - freqs[j])
    s = 0.24 / (0.0207 * f_low + 18.96)
    return float(np.sum(amps[i] * amps[j] * (np.exp(-3.51 * s * f_diff) - np.exp(-5.75 * s * f_diff))))


class EasternFeatureExtractor:
    """One song at a time: frame-level curves first, then one row of `EASTERN_FEATURES` per window."""

    def song(self, mix: np.ndarray, mix_sr: int, stems: dict[str, np.ndarray], stem_sr: int,
             windows: list[tuple[float, float]], tonic_hz: float | None = None) -> np.ndarray:
        """`tonic_hz`: the song's Sa. Without it, the strongest pitch class of the mix stands in."""
        if not windows:
            return np.zeros((0, len(EASTERN_FEATURES)))
        mix_curves = self._mix_curves(mix, mix_sr)
        chroma_mean = mix_curves['chroma'].mean(axis=1)
        sa = (int(round(12 * np.log2(tonic_hz / librosa.note_to_hz('C1')))) % 12
              if tonic_hz and np.isfinite(tonic_hz) else int(np.argmax(chroma_mean)))
        mix_curves['drone_classes'] = (sa, (sa + 7) % 12)
        stem_curves = self._stem_curves(stems, stem_sr)
        rows = [self._window(mix_curves, stem_curves, start, end) for start, end in windows]
        table = np.array(rows, dtype=np.float64)
        # Changes from the previous window; the first window has no previous one.
        # Column 2 holds mean log loudness until here; it becomes the gain over the previous window.
        table[:, 2] = np.diff(table[:, 2], prepend=table[0, 2])
        octaves = np.log2(np.maximum(table[:, 4], 1.0))
        table[:, 5] = np.clip(np.diff(octaves, prepend=octaves[0]), -1, 1)
        return np.nan_to_num(table)

    # Frame-level curves -------------------------------------------------------------------------

    def _mix_curves(self, mix: np.ndarray, sr: int) -> dict[str, np.ndarray | float]:
        rms = librosa.feature.rms(y=mix, hop_length=MIX_HOP)[0]
        chroma = librosa.feature.chroma_cqt(y=mix, sr=sr, hop_length=MIX_HOP)
        onset_env = librosa.onset.onset_strength(y=mix, sr=sr, hop_length=MIX_HOP)
        spectrum = np.abs(librosa.stft(mix, n_fft=4096, hop_length=ROUGHNESS_HOP))
        bin_hz = librosa.fft_frequencies(sr=sr, n_fft=4096)
        roughness = np.zeros(spectrum.shape[1])
        for t in range(spectrum.shape[1]):
            column = spectrum[:, t]
            peaks = np.flatnonzero((column[1:-1] > column[:-2]) & (column[1:-1] >= column[2:])) + 1
            peaks = peaks[np.argsort(column[peaks])[-ROUGHNESS_PEAKS:]]
            total = column[peaks].sum()
            if total > 0:
                roughness[t] = sethares_roughness(bin_hz[peaks], column[peaks] / total)
        return {'sr': sr, 'rms': rms, 'chroma': chroma, 'onset_env': onset_env, 'roughness': roughness}

    def _stem_curves(self, stems: dict[str, np.ndarray], sr: int) -> dict[str, np.ndarray | float]:
        curves: dict[str, np.ndarray | float] = {'sr': sr}
        for name in ('vocals', 'drums', 'other'):
            rms = librosa.feature.rms(y=stems[name], hop_length=STEM_HOP)[0]
            curves[f'{name}_rms'] = rms
            curves[f'{name}_db'] = librosa.amplitude_to_db(rms, ref=float(rms.max()) or 1.0)
        onsets = librosa.onset.onset_detect(y=stems['drums'], sr=sr, hop_length=STEM_HOP, units='time')
        curves['drum_onsets'] = np.asarray(onsets)
        curves.update(self._offgrid_curves(stems['other'], sr))
        return curves

    def _offgrid_curves(self, other: np.ndarray, sr: int) -> dict[str, np.ndarray]:
        """Per frame: pitch-peak energy on and off the Western grid, after the song's tuning offset.

        Only spectral peaks are counted, so one in-tune note's spread into neighbouring bins is not
        read as off-grid. The tuning offset moves the whole grid, so a band tuned 30 cents flat
        overall is not counted as microtonal.
        """
        tuning = float(librosa.estimate_tuning(y=other, sr=sr))  # fraction of a semitone
        fmin = librosa.note_to_hz('C2') * 2 ** (tuning / 12)
        n_bins = min(OFFGRID_BINS_PER_OCTAVE * OFFGRID_OCTAVES,
                     int(OFFGRID_BINS_PER_OCTAVE * np.log2(sr / 2 / fmin)) - OFFGRID_BINS_PER_OCTAVE // 4)
        power = np.abs(librosa.cqt(other, sr=sr, hop_length=STEM_HOP * 2, fmin=fmin, n_bins=n_bins,
                                   bins_per_octave=OFFGRID_BINS_PER_OCTAVE)) ** 2
        is_peak = np.zeros_like(power, dtype=bool)
        is_peak[1:-1] = (power[1:-1] > power[:-2]) & (power[1:-1] >= power[2:])
        peak_power = np.where(is_peak, power, 0.0)
        # The song's scale: peaks of its pitch histogram folded into one octave (60 bins of 20 cents).
        per_octave = OFFGRID_BINS_PER_OCTAVE
        histogram = np.zeros(per_octave)
        np.add.at(histogram, np.arange(n_bins) % per_octave, peak_power.sum(axis=1))
        smooth = 0.25 * np.roll(histogram, 1) + 0.5 * histogram + 0.25 * np.roll(histogram, -1)
        is_degree = (smooth > np.roll(smooth, 1)) & (smooth >= np.roll(smooth, -1)) & (smooth > 1.5 * np.median(smooth))
        offset = np.arange(per_octave) % (per_octave // 12)        # 0..4 -> 0, 20, 40, 60, 80 cents above a semitone
        off_degrees = is_degree & ((offset == 2) | (offset == 3))  # 40 or 60 cents: between semitones
        on_off_degree = off_degrees[np.arange(n_bins) % per_octave]
        off = peak_power[on_off_degree].sum(axis=0)
        return {'offgrid_off': off, 'offgrid_total': peak_power.sum(axis=0)}

    # One window -----------------------------------------------------------------------------------

    @staticmethod
    def _span(start: float, end: float, sr: int, hop: int, length: int) -> slice:
        return slice(min(int(start * sr / hop), length - 1), max(min(int(end * sr / hop), length), 1))

    def _window(self, mix: dict, stems: dict, start: float, end: float) -> list[float]:
        span = self._span(start, end, mix['sr'], MIX_HOP, len(mix['rms']))
        rms = mix['rms'][span]
        log_rms = np.log(rms + 1e-6)
        slope = float(np.polyfit(np.linspace(0, 1, len(log_rms)), log_rms, 1)[0]) if len(log_rms) > 2 else 0.0
        chroma = mix['chroma'][:, span]
        chroma = chroma / np.maximum(chroma.max(axis=0, keepdims=True), 1e-9)
        drone = float(np.max(np.percentile(chroma[list(mix['drone_classes'])], 10, axis=1))) if chroma.shape[1] else 0.0
        env = mix['onset_env'][span]
        tempo = float(librosa.feature.tempo(onset_envelope=env, sr=mix['sr'], hop_length=MIX_HOP)[0]) if len(env) > 8 else 0.0
        r_span = self._span(start, end, mix['sr'], ROUGHNESS_HOP, len(mix['roughness']))
        roughness = float(np.mean(mix['roughness'][r_span]))

        s_span = self._span(start, end, stems['sr'], STEM_HOP, len(stems['vocals_rms']))
        energy = {n: float(np.mean(stems[f'{n}_rms'][s_span] ** 2)) for n in ('vocals', 'drums', 'other')}
        total = sum(energy.values()) or 1.0
        onsets = stems['drum_onsets']
        onset_rate = float(np.sum((onsets >= start) & (onsets < end)) / max(end - start, 1e-6))
        v_db, o_db = stems['vocals_db'][s_span], stems['other_db'][s_span]
        solo = float(np.mean((o_db > ACTIVE_DB) & (v_db < o_db - SOLO_MARGIN_DB))) if len(o_db) else 0.0
        o_span = self._span(start, end, stems['sr'], STEM_HOP * 2, len(stems['offgrid_total']))
        on_total = float(stems['offgrid_total'][o_span].sum())
        offgrid = float(stems['offgrid_off'][o_span].sum() / on_total) if on_total > 0 else 0.0
        return [roughness, slope, float(np.mean(log_rms)), drone, tempo, 0.0, onset_rate,
                energy['drums'] / total, energy['other'] / total, offgrid, solo,
                self._alternation(v_db, o_db, stems['sr'], end - start)]

    @staticmethod
    def _alternation(v_db: np.ndarray, o_db: np.ndarray, sr: int, seconds: float) -> float:
        """Voice-led <-> instrument-led switches per minute, ignoring frames where neither sounds."""
        active = (v_db > ACTIVE_DB) | (o_db > ACTIVE_DB)
        lead = np.where(v_db >= o_db, 1, -1)[active]
        if len(lead) < 2:
            return 0.0
        width = max(1, int(ALTERNATION_SMOOTH_SEC * sr / STEM_HOP)) | 1
        smoothed = np.sign(np.convolve(lead, np.ones(width), mode='same'))
        switches = int(np.sum(smoothed[1:] * smoothed[:-1] < 0))
        return switches / max(seconds, 1e-6) * 60.0
