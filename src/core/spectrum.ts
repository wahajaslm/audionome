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

/**
 * SPECTRUM VIEWS - three ways to draw the same sound (the switch in Explore and Song anatomy):
 *   mel     bands spaced as the ear hears pitch (default; 2048-pt FFT, hop 256, 128 bands, 30 Hz–11 kHz)
 *   cqt     one row per quarter tone on a piano scale, so notes and chords line up
 *           (multi-resolution pseudo-CQT, 86 frames/s, 24 bands per octave, C2 65 Hz – C9 8.4 kHz)
 *   linear  plain frequency in Hz (2048-pt FFT, hop 256, 256 bands up to 11 kHz)
 * Example: a sung A4 is one bright line at row "A4" in CQT; in linear it sits low and thin.
 */
export type SpectrumKind = 'mel' | 'cqt' | 'linear';
export const SPECTRUM_KINDS: { kind: SpectrumKind; label: string }[] = [
  { kind: 'mel', label: 'Mel' }, { kind: 'cqt', label: 'CQT' }, { kind: 'linear', label: 'Linear' },
];

export interface SpectrumView {
  kind: SpectrumKind;
  fps: number;
  bands: number;
  frames: number;
  fmin: number;
  fmax: number;
  /** Centre frequency of each band in Hz, band 0 = lowest (for axis labels). */
  freqs: Float32Array;
  /** frames x bands, row-major by frame, 0 (quiet) … 255 (loudest), band 0 = lowest. */
  data: Uint8Array;
}

/** The mel view plus the instant curves made in the same pass. */
export interface Spectrum extends SpectrumView {
  /** 10 frames/s curves: loudness 0..1 (mix floor … loudest) and spectral centroid in Hz. */
  loud: Float32Array;
  bright: Float32Array;
  /** The linear view, made in the same STFT pass (the worker keeps it; not sent with mel). */
  linear?: SpectrumView;
}

// C2: below it an 8192-point FFT (2.7 Hz bins) is coarser than a quarter tone and the rows go blocky.
export const CQT_FMIN = 65.406;        // C2
export const CQT_PER_OCTAVE = 24;
export const CQT_BANDS = 24 * 7;       // C2 … C9
export const CQT_FFT = 8192;
export const CQT_HOP = 256;
/** CQT bands below this come from the 8192-point FFT, the rest from a 4096-point one. */
export const CQT_SPLIT_HZ = 520;
export const LINEAR_BANDS = 256;

/** Slaney mel scale (librosa's default), so the bands match the service's mel features. */
export function hzToMel(f: number): number {
  return f < 1000 ? f / (200 / 3) : 15 + Math.log(f / 1000) / (Math.log(6.4) / 27);
}
export function melToHz(m: number): number {
  return m < 15 ? m * (200 / 3) : 1000 * Math.exp((m - 15) * (Math.log(6.4) / 27));
}

type BandFilter = { start: number; w: Float32Array };

/** Triangular mel filters over FFT bins: for each band, [first bin, weights…]. */
export function melFilters(sr = SPEC_SR, nfft = SPEC_FFT, bands = SPEC_BANDS, fmin = SPEC_FMIN, fmax = SPEC_FMAX): BandFilter[] {
  const m0 = hzToMel(fmin), m1 = hzToMel(fmax);
  return triangularFilters(Array.from({ length: bands + 2 }, (_, i) => melToHz(m0 + (m1 - m0) * i / (bands + 1))), sr, nfft);
}

/** Quarter-tone filters on a log axis (pseudo-CQT). Edges are geometric, 2^(1/24) apart. */
export function cqtFilters(sr = SPEC_SR, nfft = CQT_FFT, bands = CQT_BANDS, fmin = CQT_FMIN): BandFilter[] {
  return triangularFilters(Array.from({ length: bands + 2 }, (_, i) => fmin * 2 ** ((i - 1) / CQT_PER_OCTAVE)), sr, nfft);
}

/** Even filters from 0 Hz to Nyquist. */
export function linearFilters(sr = SPEC_SR, nfft = SPEC_FFT, bands = LINEAR_BANDS, fmax = SPEC_FMAX): BandFilter[] {
  return triangularFilters(Array.from({ length: bands + 2 }, (_, i) => fmax * i / (bands + 1)), sr, nfft);
}

/** Triangles between consecutive edges (band b peaks at edges[b + 1]). */
function triangularFilters(edges: number[], sr: number, nfft: number): BandFilter[] {
  const bands = edges.length - 2;
  const binHz = sr / nfft, out: BandFilter[] = [];
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
  const n = re.length, { rev, cos, sin } = fftTables(n);
  for (let i = 0; i < n; i++) {
    const j = rev[i];
    if (i < j) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const half = len >> 1, step = n / len;
    for (let i = 0; i < n; i += len) {
      for (let k = 0, t = 0; k < half; k++, t += step) {
        const a = i + k, b = a + half, cr = cos[t], ci = sin[t];
        const tr = re[b] * cr - im[b] * ci, ti = re[b] * ci + im[b] * cr;
        re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti;
      }
    }
  }
}

/** Bit-reversal order and twiddle factors per FFT size, made once (SPEED FIX). */
const FFT_TABLES = new Map<number, { rev: Uint32Array; cos: Float64Array; sin: Float64Array }>();
function fftTables(n: number): { rev: Uint32Array; cos: Float64Array; sin: Float64Array } {
  let t = FFT_TABLES.get(n);
  if (t) return t;
  const rev = new Uint32Array(n), bits = Math.log2(n);
  for (let i = 0; i < n; i++) { let r = 0; for (let b = 0; b < bits; b++) r = (r << 1) | ((i >> b) & 1); rev[i] = r; }
  const cos = new Float64Array(n / 2), sin = new Float64Array(n / 2);
  for (let k = 0; k < n / 2; k++) { cos[k] = Math.cos(-2 * Math.PI * k / n); sin[k] = Math.sin(-2 * Math.PI * k / n); }
  t = { rev, cos, sin };
  FFT_TABLES.set(n, t);
  return t;
}

/**
 * Hann-windowed STFT frames → band energies in dB, for one or more filter banks at once.
 *
 * SPEED FIX - switching to CQT took ~14 s and Linear ~3.6 s on a 9-minute song: every view ran
 * its own STFT, one frame per FFT. Now two frames share one complex FFT (frame A in the real
 * part, frame B in the imaginary part, separated afterwards by conjugate symmetry), and
 * banks with the same FFT size share one pass (Mel and Linear: one STFT, two filter banks).
 * Example: 9-min song → Mel + Linear together in about the time Mel alone took.
 */
function bandFramesMulti(x: Float32Array, nfft: number, hop: number, banks: BandFilter[][],
  perFrame?: (f: number, pow: Float32Array) => void): { db: Float32Array[]; frames: number; maxDb: number[] } {
  const half = nfft / 2;
  const frames = Math.max(1, Math.floor((x.length - 1) / hop) + 1);
  const win = new Float32Array(nfft).map((_, i) => 0.5 - 0.5 * Math.cos(2 * Math.PI * i / nfft));
  const db = banks.map(b => new Float32Array(frames * b.length)), maxDb = banks.map(() => -Infinity);
  const re = new Float32Array(nfft), im = new Float32Array(nfft);
  const powA = new Float32Array(half + 1), powB = new Float32Array(half + 1);
  const fill = (buf: Float32Array, f: number) => {
    const c = f * hop - half; // centred frames, like librosa (center=True, zero padded)
    for (let i = 0; i < nfft; i++) { const s = c + i; buf[i] = s >= 0 && s < x.length ? x[s] * win[i] : 0; }
  };
  const bandsOf = (f: number, pow: Float32Array) => {
    perFrame?.(f, pow);
    for (let q = 0; q < banks.length; q++) {
      const filters = banks[q], out = db[q], nb = filters.length;
      for (let b = 0; b < nb; b++) {
        const { start, w } = filters[b];
        let e = 0;
        for (let k = 0; k < w.length; k++) e += w[k] * pow[start + k];
        const d = 10 * Math.log10(e + 1e-10);
        out[f * nb + b] = d;
        if (d > maxDb[q]) maxDb[q] = d;
      }
    }
  };
  for (let f = 0; f < frames; f += 2) {
    const two = f + 1 < frames;
    fill(re, f);
    if (two) fill(im, f + 1); else im.fill(0);
    fft(re, im);
    // Z = A + iB  →  A[k] = (Z[k] + conj Z[n−k]) / 2,  B[k] = (Z[k] − conj Z[n−k]) / 2i
    for (let k = 0; k <= half; k++) {
      const nk = (nfft - k) & (nfft - 1);
      const zr = re[k], zi = im[k], wr = re[nk], wi = im[nk];
      const ar = (zr + wr) / 2, ai = (zi - wi) / 2, br = (zi + wi) / 2, bi = (wr - zr) / 2;
      powA[k] = ar * ar + ai * ai; powB[k] = br * br + bi * bi;
    }
    bandsOf(f, powA);
    if (two) bandsOf(f + 1, powB);
  }
  return { db, frames, maxDb };
}

/** One filter bank (the common case). */
function bandFrames(x: Float32Array, nfft: number, hop: number, filters: BandFilter[],
  perFrame?: (f: number, pow: Float32Array) => void): { db: Float32Array; frames: number; maxDb: number } {
  const r = bandFramesMulti(x, nfft, hop, [filters], perFrame);
  return { db: r.db[0], frames: r.frames, maxDb: r.maxDb[0] };
}

/**
 * dB → 0..255 on this song's own levels.
 * CONTRAST FIX - a fixed 75 dB below the loudest frame left most of the picture a flat teal
 * wash. Now the 30th percentile is black and the 99.7th is white (at most 75 dB apart),
 * so the quiet half of the song keeps its detail.
 * Example: a dense pop master spans ~45 dB in practice → uses the whole colour ramp.
 */
function quantise(db: Float32Array, maxDb: number): Uint8Array {
  const floor = maxDb - 120, hist = new Uint32Array(121);
  for (let i = 0; i < db.length; i++) hist[Math.max(0, Math.min(120, Math.round(db[i] - floor)))]++;
  const at = (q: number) => { let n = 0; for (let k = 0; k <= 120; k++) { n += hist[k]; if (n >= q * db.length) return floor + k; } return maxDb; };
  const hi = at(0.997), lo = Math.max(at(0.3), hi - SPEC_RANGE_DB), span = Math.max(6, hi - lo);
  const data = new Uint8Array(db.length);
  for (let i = 0; i < db.length; i++) data[i] = Math.max(0, Math.min(255, Math.round((db[i] - lo) / span * 255)));
  return data;
}

const centres = (edges: number[]) => Float32Array.from(edges.slice(1, -1));

/** Mono samples at SPEC_SR → the CQT or linear view (mel comes with the curves, computeSpectrum). */
export function computeView(x: Float32Array, kind: Exclude<SpectrumKind, 'mel'>, sr = SPEC_SR): SpectrumView {
  if (kind === 'cqt') {
    // CQT RESOLUTION FIX - one 8192-point FFT every 512 samples gave 43 frames/s, which blurred
    // when stretched. Now it is multi-resolution, like a real constant-Q transform: notes up to
    // CQT_SPLIT_HZ from the long FFT (fine in pitch, every 512 samples, interpolated in time),
    // the rest from a 4096-point FFT every 256 samples. Both land on 86 frames/s.
    // Example: hi-hats and consonants are sharp in time again; bass notes stay one row each.
    const freqs = Float32Array.from({ length: CQT_BANDS }, (_, i) => CQT_FMIN * 2 ** (i / CQT_PER_OCTAVE));
    const split = freqs.findIndex(f => f > CQT_SPLIT_HZ);
    const all = cqtFilters(sr), low = all.slice(0, split);
    const high = cqtFilters(sr, 4096).slice(split);
    const L = bandFrames(x, CQT_FFT, CQT_HOP * 2, low), H = bandFrames(x, 4096, SPEC_HOP, high);
    const frames = H.frames, db = new Float32Array(frames * CQT_BANDS), hb = CQT_BANDS - split;
    for (let f = 0; f < frames; f++) {
      const pos = f / 2, f0 = Math.min(L.frames - 1, Math.floor(pos)), f1 = Math.min(L.frames - 1, f0 + 1), w = pos - f0;
      for (let b = 0; b < split; b++) db[f * CQT_BANDS + b] = L.db[f0 * split + b] * (1 - w) + L.db[f1 * split + b] * w;
      for (let b = 0; b < hb; b++) db[f * CQT_BANDS + split + b] = H.db[f * hb + b];
    }
    return { kind, fps: sr / SPEC_HOP, bands: CQT_BANDS, frames, fmin: CQT_FMIN, fmax: freqs[CQT_BANDS - 1], freqs, data: quantise(db, Math.max(L.maxDb, H.maxDb)) };
  }
  const { db, frames, maxDb } = bandFrames(x, SPEC_FFT, SPEC_HOP, linearFilters(sr));
  const freqs = Float32Array.from({ length: LINEAR_BANDS }, (_, i) => SPEC_FMAX * (i + 1) / (LINEAR_BANDS + 1));
  return { kind, fps: sr / SPEC_HOP, bands: LINEAR_BANDS, frames, fmin: 0, fmax: SPEC_FMAX, freqs, data: quantise(db, maxDb) };
}

/** Mono samples at SPEC_SR → mel spectrogram + 10 frames/s curves. */
export function computeSpectrum(x: Float32Array, sr = SPEC_SR): Spectrum {
  const n = SPEC_FFT, hop = SPEC_HOP, half = n / 2;
  const fps = sr / hop, per10 = fps / 10;
  const nCurve = Math.ceil((Math.floor((x.length - 1) / hop) + 1) / per10);
  const centroidSum = new Float32Array(nCurve), centroidN = new Float32Array(nCurve);
  const multi = bandFramesMulti(x, n, hop, [melFilters(sr, n), linearFilters(sr, n)], (f, pow) => {
    let num = 0, den = 0;
    for (let k = 0; k <= half; k++) { const mag = Math.sqrt(pow[k]); num += mag * k * sr / n; den += mag; }
    const ci = Math.min(nCurve - 1, Math.floor(f / per10));
    if (den > 1e-9) { centroidSum[ci] += num / den; centroidN[ci]++; }
  });
  const db = multi.db[0], frames = multi.frames, maxDb = multi.maxDb[0];
  const m0 = hzToMel(SPEC_FMIN), m1 = hzToMel(SPEC_FMAX);
  const freqs = centres(Array.from({ length: SPEC_BANDS + 2 }, (_, i) => melToHz(m0 + (m1 - m0) * i / (SPEC_BANDS + 1))));

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
  // Linear came out of the same STFT; it is handed back with the mel view (the worker keeps it).
  const linFreqs = Float32Array.from({ length: LINEAR_BANDS }, (_, i) => SPEC_FMAX * (i + 1) / (LINEAR_BANDS + 1));
  const linear: SpectrumView = { kind: 'linear', fps, bands: LINEAR_BANDS, frames, fmin: 0, fmax: SPEC_FMAX, freqs: linFreqs, data: quantise(multi.db[1], multi.maxDb[1]) };
  return { kind: 'mel', fps, bands: SPEC_BANDS, frames, fmin: SPEC_FMIN, fmax: SPEC_FMAX, freqs, data: quantise(db, maxDb), loud, bright, linear };
}

/** Row (0 = bottom band) whose centre is nearest `hz`, for axis labels. */
export function bandForHz(view: Pick<SpectrumView, 'freqs'>, hz: number): number {
  const f = view.freqs;
  let lo = 0, hi = f.length - 1;
  while (lo < hi) { const m = (lo + hi) >> 1; if (f[m] < hz) lo = m + 1; else hi = m; }
  return lo > 0 && Math.abs(f[lo - 1] - hz) < Math.abs(f[lo] - hz) ? lo - 1 : lo;
}

/** Axis labels for a view: note names for CQT, Hz for the others. */
export function spectrumLabels(kind: SpectrumKind): [number, string][] {
  if (kind === 'cqt') return [[130.81, 'C3'], [523.25, 'C5'], [2093, 'C7']];
  if (kind === 'linear') return [[1000, '1 kHz'], [5000, '5 kHz'], [10000, '10 kHz']];
  return [[100, '100 Hz'], [1000, '1 kHz'], [5000, '5 kHz']];
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
export function spectrumTiles(spec: SpectrumView, lut = spectrumLut()): HTMLCanvasElement[] {
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
