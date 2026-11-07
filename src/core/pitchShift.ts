/**
 * Transpose: moves the pitch without changing the speed (a phase vocoder, one per channel).
 *
 * TRANSPOSE - the browser can only move pitch and speed together (tape speed). A singer who
 * wants the song 2 semitones lower, or a player whose instrument is tuned to A440 while the
 * record sits 30 cents sharp, needs pitch alone. This takes 2048-sample frames every 512
 * samples and moves each spectral peak, with the bins around it, to its new place as one block
 * (Laroche & Dolson's peak locking). Moving bins one by one let neighbours drift out of phase:
 * a steady 440 Hz tone shifted 2 semitones down swung ±3 dB and sounded phasey.
 * Example: ratio 2^(-2/12) ≈ 0.891 → an A4 (440 Hz) comes out as G4 (392 Hz), same tempo.
 *
 * Latency is FRAME - HOP samples (35 ms at 44.1 kHz) while shifting. At ratio 1 the input
 * passes straight through with no delay, so normal listening is untouched.
 */
import { fft } from './spectrum.ts';

export const PITCH_FRAME = 2048;
export const PITCH_OVERLAP = 4;
const HOP = PITCH_FRAME / PITCH_OVERLAP;
const HALF = PITCH_FRAME / 2;
/** Samples of delay while shifting. */
export const PITCH_LATENCY = PITCH_FRAME - HOP;

/** Semitones (and cents) → frequency ratio. Example: (-2, 0) → 0.891; (0, 30) → 1.0175. */
export function pitchRatio(semitones: number, cents = 0): number {
  return 2 ** ((semitones + cents / 100) / 12);
}

/** One channel of streaming pitch shift. Feed blocks of any length; output has the same length. */
export class PitchShifter {
  private readonly inFifo = new Float32Array(PITCH_FRAME);
  private readonly outFifo = new Float32Array(PITCH_FRAME);
  private readonly accum = new Float32Array(2 * PITCH_FRAME);
  private readonly lastPhase = new Float32Array(HALF + 1);
  /** Phase turn given to each analysis bin's block last frame (its peak's running rotation). */
  private rot = new Float32Array(HALF + 1);
  private rotNext = new Float32Array(HALF + 1);
  private readonly mag = new Float32Array(HALF + 1);
  private readonly freq = new Float32Array(HALF + 1);
  private readonly aRe = new Float32Array(HALF + 1);
  private readonly aIm = new Float32Array(HALF + 1);
  private readonly re = new Float32Array(PITCH_FRAME);
  private readonly im = new Float32Array(PITCH_FRAME);
  private readonly win = new Float32Array(PITCH_FRAME);
  private readonly peaks = new Int32Array(HALF + 1);
  private rover = PITCH_LATENCY;
  /** True after a shifted block; the next ratio-1 block resets the state. */
  private dirty = false;

  constructor() {
    for (let i = 0; i < PITCH_FRAME; i++) this.win[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / PITCH_FRAME);
  }

  /** Clears all state (after a pause in shifting, so old sound never leaks back in). */
  reset(): void {
    for (const a of [this.inFifo, this.outFifo, this.accum, this.lastPhase, this.rot]) a.fill(0);
    this.rover = PITCH_LATENCY;
    this.dirty = false;
  }

  /** Shifts `input` by `ratio` into `output` (same length; may be the same array). */
  process(input: Float32Array, output: Float32Array, ratio: number): void {
    if (Math.abs(ratio - 1) < 1e-4) {
      if (this.dirty) this.reset();
      if (output !== input) output.set(input);
      return;
    }
    this.dirty = true;
    for (let i = 0; i < input.length; i++) {
      this.inFifo[this.rover] = input[i];
      output[i] = this.outFifo[this.rover - PITCH_LATENCY];
      if (++this.rover >= PITCH_FRAME) { this.rover = PITCH_LATENCY; this.frame(ratio); }
    }
  }

  /** One frame: analyse, move each peak's block by `ratio`, resynthesise, overlap-add. */
  private frame(ratio: number): void {
    const { re, im, win, mag, freq, aRe, aIm, peaks } = this;
    const expect = 2 * Math.PI * HOP / PITCH_FRAME;
    for (let k = 0; k < PITCH_FRAME; k++) { re[k] = this.inFifo[k] * win[k]; im[k] = 0; }
    fft(re, im);
    // Analysis: each bin's true frequency (in bins) from how far its phase moved since the last frame.
    let loud = 0;
    for (let k = 0; k <= HALF; k++) {
      aRe[k] = re[k]; aIm[k] = im[k];
      mag[k] = Math.hypot(re[k], im[k]);
      if (mag[k] > loud) loud = mag[k];
      const phase = Math.atan2(im[k], re[k]);
      let d = phase - this.lastPhase[k] - k * expect;
      this.lastPhase[k] = phase;
      d -= 2 * Math.PI * Math.round(d / (2 * Math.PI));
      freq[k] = k + d * PITCH_OVERLAP / (2 * Math.PI);
    }
    // Peaks: louder than two bins either side, and not buried in the noise floor (−100 dB).
    let np = 0;
    for (let k = 0; k <= HALF; k++) {
      const m = mag[k];
      if (m <= loud * 1e-5) continue;
      if ((k > 0 && m <= mag[k - 1]) || (k > 1 && m < mag[k - 2]) || (k < HALF && m < mag[k + 1]) || (k < HALF - 1 && m < mag[k + 2])) continue;
      peaks[np++] = k;
    }
    for (let k = 0; k < PITCH_FRAME; k++) { re[k] = 0; im[k] = 0; }
    this.rotNext.fill(0);
    // Each peak owns the bins down to the quietest bin between it and its neighbours. The block
    // moves by a whole number of bins (peak → peak·ratio) and turns by one shared phase, which
    // keeps running from frame to frame at (ratio − 1) × the peak's true frequency.
    let lo = 0;
    for (let i = 0; i < np; i++) {
      const p = peaks[i];
      let hi = HALF;
      if (i + 1 < np) { hi = p; for (let k = p + 1; k < peaks[i + 1]; k++) if (mag[k] < mag[hi]) hi = k; }
      let th = this.rot[p] + (ratio - 1) * freq[p] * 2 * Math.PI / PITCH_OVERLAP;
      th -= 2 * Math.PI * Math.round(th / (2 * Math.PI));
      const c = Math.cos(th), s = Math.sin(th), shift = Math.round(p * ratio) - p;
      for (let k = lo; k <= hi; k++) {
        this.rotNext[k] = th;
        const j = k + shift;
        if (j < 0 || j > HALF) continue;
        // Conjugated here: the forward FFT below then works as the inverse.
        re[j] += aRe[k] * c - aIm[k] * s;
        im[j] -= aRe[k] * s + aIm[k] * c;
      }
      lo = hi + 1;
    }
    [this.rot, this.rotNext] = [this.rotNext, this.rot];
    fft(re, im);
    // Only the positive half was filled, so the real part comes back at half height (×2); the
    // analysis × synthesis Hann windows sum to 1.5 at 4× overlap.
    const scale = 2 / (1.5 * PITCH_FRAME);
    for (let k = 0; k < PITCH_FRAME; k++) this.accum[k] += win[k] * re[k] * scale;
    this.outFifo.set(this.accum.subarray(0, HOP));
    this.accum.copyWithin(0, HOP);
    this.accum.fill(0, PITCH_FRAME);
    this.inFifo.copyWithin(0, HOP);
  }
}
