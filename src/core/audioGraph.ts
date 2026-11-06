/**
 * Web Audio graph behind the player's <audio> element, and the loudness maths that feeds it.
 *
 *   <audio> → MediaElementSource → loudness gain → volume gain → speakers
 *
 * The <audio> element still decodes, buffers, seeks and keeps time (the media clock every
 * SYNC FIX relies on). The graph only shapes the level, so nothing about timing changes.
 *
 * WEB AUDIO FIX - before, the element played straight to the speakers, so every song played at
 * its own mastering level and the volume slider was the only control.
 * Example: the quiet demo WAV, then a loud Coke Studio MP3 → the second one jumped ~8 dB
 * louder. Now each song is measured once and brought to the same loudness.
 */

/** Target loudness, measured on the mono mix (see measureLoudness). About −14 LUFS in stereo. */
export const TARGET_LUFS = -17;
/** Quiet songs are lifted at most this much, so noise and weak masters are not blown up. */
export const MAX_BOOST_DB = 6;
/** Loud songs are lowered at most this much. */
export const MAX_CUT_DB = 15;
/** A lift never pushes the loudest sample above this level (dBFS). */
export const PEAK_CEILING_DB = -1;

export interface Loudness {
  /** Integrated loudness of the mono mix (LUFS); -Infinity for silence. */
  lufs: number;
  /** Highest absolute sample (dBFS). */
  peakDb: number;
}

/** One biquad, transposed direct form II, run in place over the samples. */
function biquad(x: Float32Array, b0: number, b1: number, b2: number, a1: number, a2: number): void {
  let z1 = 0, z2 = 0;
  for (let i = 0; i < x.length; i++) {
    const v = x[i];
    const y = b0 * v + z1;
    z1 = b1 * v - a1 * y + z2;
    z2 = b2 * v - a2 * y;
    x[i] = y;
  }
}

/**
 * Integrated loudness after ITU-R BS.1770-4: K-weighting (high shelf + high pass, designed
 * for any sample rate), 400 ms blocks every 100 ms, absolute gate −70 LUFS, relative gate −10 LU.
 * Measured on the mono mix the spectrum already decodes (22.05 kHz), so it costs one pass.
 * Mono reads about 3 dB lower than the stereo meter for the same song; TARGET_LUFS allows for it.
 * Example: a full-scale 1 kHz sine → about −3.0 LUFS.
 */
export function measureLoudness(samples: Float32Array, sampleRate: number): Loudness {
  let peak = 0;
  for (let i = 0; i < samples.length; i++) { const a = Math.abs(samples[i]); if (a > peak) peak = a; }
  const peakDb = peak > 0 ? 20 * Math.log10(peak) : -Infinity;

  const x = Float32Array.from(samples);
  // Stage 1: high shelf (+4 dB above ~1.7 kHz), the head's acoustic effect.
  {
    const f0 = 1681.974450955533, G = 3.999843853973347, Q = 0.7071752369554196;
    const K = Math.tan(Math.PI * f0 / sampleRate), Vh = 10 ** (G / 20), Vb = Vh ** 0.4996667741545416;
    const a0 = 1 + K / Q + K * K;
    biquad(x, (Vh + Vb * K / Q + K * K) / a0, 2 * (K * K - Vh) / a0, (Vh - Vb * K / Q + K * K) / a0,
      2 * (K * K - 1) / a0, (1 - K / Q + K * K) / a0);
  }
  // Stage 2: high pass at ~38 Hz (RLB weighting).
  {
    const f0 = 38.13547087602444, Q = 0.5003270373238773;
    const K = Math.tan(Math.PI * f0 / sampleRate), a0 = 1 + K / Q + K * K;
    biquad(x, 1, -2, 1, 2 * (K * K - 1) / a0, (1 - K / Q + K * K) / a0);
  }

  const block = Math.round(0.4 * sampleRate), step = Math.round(0.1 * sampleRate);
  if (x.length < block) return { lufs: -Infinity, peakDb };
  // Running sum of squares, so each block is two lookups.
  const cum = new Float64Array(x.length + 1);
  for (let i = 0; i < x.length; i++) cum[i + 1] = cum[i] + x[i] * x[i];
  const powers: number[] = [];
  for (let s = 0; s + block <= x.length; s += step) powers.push((cum[s + block] - cum[s]) / block);

  const lk = (z: number) => -0.691 + 10 * Math.log10(z);
  const mean = (zs: number[]) => zs.reduce((s, z) => s + z, 0) / zs.length;
  const aboveAbs = powers.filter(z => z > 0 && lk(z) > -70);
  if (!aboveAbs.length) return { lufs: -Infinity, peakDb };
  const relGate = lk(mean(aboveAbs)) - 10;
  const gated = aboveAbs.filter(z => lk(z) > relGate);
  return { lufs: lk(mean(gated)), peakDb };
}

/**
 * Gain (dB) that brings a song to TARGET_LUFS: lifts are capped at MAX_BOOST_DB and by the
 * peak ceiling, cuts at MAX_CUT_DB. Unknown or silent songs get 0.
 * Examples: −9 LUFS (loud master) → −8 dB. −25 LUFS with peak −10 dBFS → +6 dB (capped).
 * −22 LUFS with peak −3 dBFS → +2 dB (peak ceiling).
 */
export function normalizationGainDb(l: Partial<Loudness> | null | undefined): number {
  const lufs = l?.lufs;
  if (typeof lufs !== 'number' || !Number.isFinite(lufs)) return 0;
  let g = TARGET_LUFS - lufs;
  if (g > 0) {
    g = Math.min(g, MAX_BOOST_DB);
    if (typeof l?.peakDb === 'number' && Number.isFinite(l.peakDb)) g = Math.min(g, Math.max(0, PEAK_CEILING_DB - l.peakDb));
  }
  return Math.max(-MAX_CUT_DB, g);
}

export const dbToGain = (db: number) => 10 ** (db / 20);

/** What the engine needs from a graph. Tests pass a small fake. */
export interface AudioGraphLike {
  /** Starts the audio clock. Call inside the click that starts playback (autoplay rules). */
  resume(): void;
  setVolume(v: number): void;
  /** Loudness gain in dB, eased over `rampSec` so a change is never a jump. */
  setNormalization(db: number, rampSec: number): void;
  close(): void;
}

export class AudioGraph implements AudioGraphLike {
  private readonly ctx: AudioContext;
  private readonly norm: GainNode;
  private readonly vol: GainNode;

  constructor(el: HTMLMediaElement, ctx: AudioContext = new AudioContext({ latencyHint: 'playback' })) {
    this.ctx = ctx;
    const src = ctx.createMediaElementSource(el);
    this.norm = ctx.createGain();
    this.vol = ctx.createGain();
    src.connect(this.norm).connect(this.vol).connect(ctx.destination);
  }

  resume(): void {
    if (this.ctx.state !== 'running') this.ctx.resume().catch(() => { });
  }

  private ease(param: AudioParam, value: number, rampSec: number): void {
    const now = this.ctx.currentTime;
    param.cancelScheduledValues(now);
    if (rampSec <= 0) { param.setValueAtTime(value, now); return; }
    param.setValueAtTime(param.value, now);
    // setTargetAtTime reaches ~95 % after 3 time constants.
    param.setTargetAtTime(value, now, rampSec / 3);
  }

  // A 30 ms ease: slider moves without zipper noise.
  setVolume(v: number): void { this.ease(this.vol.gain, Math.max(0, Math.min(1, v)), 0.03); }

  setNormalization(db: number, rampSec: number): void { this.ease(this.norm.gain, dbToGain(db), rampSec); }

  close(): void { this.ctx.close().catch(() => { }); }
}

/** Builds the graph when the browser has Web Audio; null otherwise (the element plays directly). */
export function createAudioGraph(el: HTMLMediaElement): AudioGraphLike | null {
  if (typeof AudioContext !== 'function') return null;
  try { return new AudioGraph(el); } catch (err) { console.warn('Web Audio unavailable:', err); return null; }
}
