/**
 * Spectrogram and instant curves computed in the browser from the decoded audio.
 *
 * INSTANT TIER FIX - Explore showed nothing until the service had analysed the song, and nothing
 * at all with the service off. The browser already has the audio, so it now makes these itself
 * in a worker, in about a second: a mel spectrogram (2048-point FFT, hop 256 at 22.05 kHz =
 * 86 frames/s, 128 bands from 30 Hz to 11 kHz), and loudness and brightness at 10 frames/s.
 * Example: a 4:38 song → 23 990 spectrum frames x 128 bands, ready before the quick tier.
 */

export const SPEC_SR = 22050;
export const SPEC_FFT = 2048;
export const SPEC_HOP = 256;
export const SPEC_BANDS = 128;
export const SPEC_FMIN = 30;
export const SPEC_FMAX = 11025;
/** Loudness range shown, in dB below the loudest frame. */
export const SPEC_RANGE_DB = 75;

export interface Spectrum {
  fps: number;
  bands: number;
  frames: number;
  fmin: number;
  fmax: number;
  /** frames x bands, row-major by frame, 0 (quiet) … 255 (loudest), band 0 = lowest. */
  data: Uint8Array;
  /** 10 frames/s curves: loudness 0..1 (mix floor … loudest) and spectral centroid in Hz. */
  loud: Float32Array;
  bright: Float32Array;
}

/** Slaney mel scale (librosa's default), so the bands match the service's mel features. */
export function hzToMel(f: number): number {
  return f < 1000 ? f / (200 / 3) : 15 + Math.log(f / 1000) / (Math.log(6.4) / 27);
}
export function melToHz(m: number): number {
  return m < 15 ? m * (200 / 3) : 1000 * Math.exp((m - 15) * (Math.log(6.4) / 27));
}

/** Triangular mel filters over FFT bins: for each band, [first bin, weights…]. */
export function melFilters(sr = SPEC_SR, nfft = SPEC_FFT, bands = SPEC_BANDS, fmin = SPEC_FMIN, fmax = SPEC_FMAX): { start: number; w: Float32Array }[] {
  const m0 = hzToMel(fmin), m1 = hzToMel(fmax);
  const edges = Array.from({ length: bands + 2 }, (_, i) => melToHz(m0 + (m1 - m0) * i / (bands + 1)));
  const binHz = sr / nfft, out: { start: number; w: Float32Array }[] = [];
  for (let b = 0; b < bands; b++) {
    const lo = edges[b], mid = edges[b + 1], hi = edges[b + 2];
    const start = Math.max(0, Math.floor(lo / binHz)), end = Math.min(nfft / 2, Math.ceil(hi / binHz));
    const w = new Float32Array(Math.max(1, end - start + 1));
    for (let k = start; k <= end; k++) {
      const f = k * binHz;
      w[k - start] = f <= lo || f >= hi ? 0 : f <= mid ? (f - lo) / (mid - lo) : (hi - f) / (hi - mid);
    }
    // A band narrower than one bin still takes its nearest bin, so no row is empty.
    if (!w.some(v => v > 0)) w[Math.min(w.length - 1, Math.round(mid / binHz) - start)] = 1;
    out.push({ start, w });
  }
  return out;
}

/** In-place iterative radix-2 FFT on (re, im), n a power of two. */
export function fft(re: Float32Array, im: Float32Array): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = -2 * Math.PI / len, wr = Math.cos(ang), wi = Math.sin(ang), half = len >> 1;
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < half; k++) {
        const a = i + k, b = a + half;
        const tr = re[b] * cr - im[b] * ci, ti = re[b] * ci + im[b] * cr;
        re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti;
        const nr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = nr;
      }
    }
  }
}

/** Mono samples at SPEC_SR → spectrogram + 10 frames/s curves. */
export function computeSpectrum(x: Float32Array, sr = SPEC_SR): Spectrum {
  const n = SPEC_FFT, hop = SPEC_HOP, half = n / 2;
  const frames = Math.max(1, Math.floor((x.length - 1) / hop) + 1);
  const win = new Float32Array(n).map((_, i) => 0.5 - 0.5 * Math.cos(2 * Math.PI * i / n));
  const filters = melFilters(sr, n);
  const db = new Float32Array(frames * SPEC_BANDS);
  const re = new Float32Array(n), im = new Float32Array(n), pow = new Float32Array(half + 1);
  const fps = sr / hop, per10 = fps / 10;
  const nCurve = Math.ceil(frames / per10);
  const centroidSum = new Float32Array(nCurve), centroidN = new Float32Array(nCurve);
  let maxDb = -Infinity;
  for (let f = 0; f < frames; f++) {
    const c = f * hop - half;  // centred frames, like librosa (center=True, zero padded)
    for (let i = 0; i < n; i++) { const s = c + i; re[i] = s >= 0 && s < x.length ? x[s] * win[i] : 0; im[i] = 0; }
    fft(re, im);
    let num = 0, den = 0;
    for (let k = 0; k <= half; k++) {
      const p = re[k] * re[k] + im[k] * im[k];
      pow[k] = p;
      const mag = Math.sqrt(p); num += mag * k * sr / n; den += mag;
    }
    const ci = Math.min(nCurve - 1, Math.floor(f / per10));
    if (den > 1e-9) { centroidSum[ci] += num / den; centroidN[ci]++; }
    for (let b = 0; b < SPEC_BANDS; b++) {
      const { start, w } = filters[b];
      let e = 0;
      for (let k = 0; k < w.length; k++) e += w[k] * pow[start + k];
      const d = 10 * Math.log10(e + 1e-10);
      db[f * SPEC_BANDS + b] = d;
      if (d > maxDb) maxDb = d;
    }
  }
  const data = new Uint8Array(frames * SPEC_BANDS), lo = maxDb - SPEC_RANGE_DB;
  for (let i = 0; i < db.length; i++) data[i] = Math.max(0, Math.min(255, Math.round((db[i] - lo) / SPEC_RANGE_DB * 255)));

  // Loudness at 10 frames/s: RMS in dB on the same scale as the service (2nd percentile … max).
  const step = Math.round(sr / 10), nLoud = Math.ceil(x.length / step), rmsDb = new Float32Array(nLoud);
  for (let i = 0; i < nLoud; i++) {
    let s = 0;
    const a = Math.max(0, i * step - (step >> 1)), b = Math.min(x.length, i * step + (step >> 1));   // whole samples, or x[k] is undefined
    for (let k = a; k < b; k++) s += x[k] * x[k];
    rmsDb[i] = 10 * Math.log10(s / Math.max(1, b - a) + 1e-12);
  }
  const sorted = Array.from(rmsDb).sort((p, q) => p - q);
  const floor = sorted[Math.floor(0.02 * (sorted.length - 1))], top = sorted[sorted.length - 1];
  const loud = rmsDb.map(v => Math.max(0, Math.min(1, (v - floor) / Math.max(1e-6, top - floor))));
  const bright = centroidSum.map((v, i) => centroidN[i] ? v / centroidN[i] : 0);
  return { fps, bands: SPEC_BANDS, frames, fmin: SPEC_FMIN, fmax: SPEC_FMAX, data, loud, bright };
}

/** Colour ramp for the spectrogram: background → deep teal → the app accent → near white. */
export function spectrumLut(): Uint8ClampedArray {
  const stops: [number, number[]][] = [[0, [14, 14, 16]], [0.35, [30, 50, 56]], [0.6, [68, 126, 116]], [0.82, [142, 197, 184]], [1, [240, 238, 222]]];
  const lut = new Uint8ClampedArray(256 * 3);
  for (let i = 0; i < 256; i++) {
    const v = Math.pow(i / 255, 1.8);   // more room for the quiet half, so detail reads
    let k = 0;
    while (k < stops.length - 2 && v > stops[k + 1][0]) k++;
    const [a, ca] = stops[k], [b, cb] = stops[k + 1], f = Math.max(0, Math.min(1, (v - a) / (b - a)));
    for (let j = 0; j < 3; j++) lut[i * 3 + j] = ca[j] + (cb[j] - ca[j]) * f;
  }
  return lut;
}

/** Max frames per tile canvas (browsers cap canvas width; a 10 min song is ~52 000 frames). */
export const SPEC_TILE = 8192;

/**
 * Colours the spectrum into tile canvases (frames → x, bands → y, low bands at the bottom),
 * made once per song and then sliced with drawImage on every frame.
 */
export function spectrumTiles(spec: Spectrum, lut = spectrumLut()): HTMLCanvasElement[] {
  const tiles: HTMLCanvasElement[] = [];
  for (let f0 = 0; f0 < spec.frames; f0 += SPEC_TILE) {
    const w = Math.min(SPEC_TILE, spec.frames - f0), cv = document.createElement('canvas');
    cv.width = w; cv.height = spec.bands;
    const g = cv.getContext('2d')!, img = g.createImageData(w, spec.bands);
    for (let x = 0; x < w; x++) {
      const row = (f0 + x) * spec.bands;
      for (let b = 0; b < spec.bands; b++) {
        const v = spec.data[row + b], o = ((spec.bands - 1 - b) * w + x) * 4;
        img.data[o] = lut[v * 3]; img.data[o + 1] = lut[v * 3 + 1]; img.data[o + 2] = lut[v * 3 + 2]; img.data[o + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    tiles.push(cv);
  }
  return tiles;
}
