/**
 * AAC-LC bitstream decoder, up to the quantised spectrum (ISO/IEC 14496-3 §4.4.2, 4.6).
 *
 * Reads a whole raw_data_block: every element (SCE / CPE / LFE / FIL / DSE / END) and, per
 * channel, global gain, ics_info, section data (codebook per band), scalefactors, pulse data,
 * TNS, and all 1024 quantised spectral values (Huffman codebooks 1–11 with escapes). It stops
 * before inverse quantisation and the filterbank: these are the numbers the encoder wrote.
 *
 * This is what reaches channel 2: its fields sit after channel 1's coded data, whose length is
 * only known by decoding it.
 * Check: a correct decode of a packet ends on its END element within the packet's last byte
 * (every Huffman code and field width must be right for that to hold).
 */
import { SF_BITS, SF_CODES, SPECTRAL_BITS, SPECTRAL_CODES, swbOffsets } from './aacTables.ts';

/** Bit reader, MSB first. */
class Reader {
  pos = 0;
  readonly end: number;
  readonly b: Uint8Array;
  constructor(b: Uint8Array) { this.b = b; this.end = b.length * 8; }
  bit(): number { const v = (this.b[this.pos >> 3] >> (7 - (this.pos & 7))) & 1; this.pos++; return v; }
  read(n: number): number { let v = 0; for (let i = 0; i < n; i++) v = (v << 1) | this.bit(); return v >>> 0; }
  get over(): boolean { return this.pos > this.end; }
}

/** Huffman decoder per codebook: (length, code) → index, read bit by bit. */
interface Huff { map: Map<number, number>; max: number }
const build = (codes: number[], bits: number[]): Huff => {
  const map = new Map<number, number>();
  codes.forEach((c, i) => map.set(bits[i] * 0x1000000 + c, i));
  return { map, max: Math.max(...bits) };
};
const SF_HUFF = build(SF_CODES, SF_BITS);
const SPEC_HUFF: Huff[] = SPECTRAL_CODES.map((c, i) => (i ? build(c, SPECTRAL_BITS[i]) : { map: new Map(), max: 0 }));
function huff(r: Reader, h: Huff): number {
  let code = 0;
  for (let len = 1; len <= h.max; len++) {
    code = (code << 1) | r.bit();
    const v = h.map.get(len * 0x1000000 + code);
    if (v !== undefined) return v;
  }
  throw new Error(`no codeword at bit ${r.pos}`);
}

/** Per codebook: values per codeword, signed, largest absolute value (ISO 14496-3 Table 4.152). */
const BOOK: { dim: number; signed: boolean; lav: number }[] = [
  { dim: 0, signed: false, lav: 0 },
  { dim: 4, signed: true, lav: 1 }, { dim: 4, signed: true, lav: 1 }, { dim: 4, signed: false, lav: 2 }, { dim: 4, signed: false, lav: 2 },
  { dim: 2, signed: true, lav: 4 }, { dim: 2, signed: true, lav: 4 }, { dim: 2, signed: false, lav: 7 }, { dim: 2, signed: false, lav: 7 },
  { dim: 2, signed: false, lav: 12 }, { dim: 2, signed: false, lav: 12 }, { dim: 2, signed: false, lav: 16 },
];
export const ZERO_HCB = 0, ESC_HCB = 11, NOISE_HCB = 13, INTENSITY_HCB2 = 14, INTENSITY_HCB = 15;

/** One codeword → its 2 or 4 quantised values (signs and escapes read here). */
function readValues(r: Reader, cb: number, out: Int16Array, at: number): void {
  const { dim, signed, lav } = BOOK[cb], idx = huff(r, SPEC_HUFF[cb]);
  const mod = signed ? 2 * lav + 1 : lav + 1, off = signed ? lav : 0;
  const v = dim === 4
    ? [Math.floor(idx / (mod ** 3)) % mod - off, Math.floor(idx / (mod ** 2)) % mod - off, Math.floor(idx / mod) % mod - off, idx % mod - off]
    : [Math.floor(idx / mod) - off, idx % mod - off];
  if (!signed) for (let k = 0; k < dim; k++) if (v[k] && r.bit()) v[k] = -v[k];
  if (cb === ESC_HCB) for (let k = 0; k < 2; k++) {
    if (Math.abs(v[k]) !== 16) continue;
    let n = 4;
    while (r.bit()) n++;
    if (n > 12) throw new Error('escape too long');
    v[k] = Math.sign(v[k]) * ((1 << n) + r.read(n));
  }
  for (let k = 0; k < dim; k++) out[at + k] = v[k];
}

export interface IcsInfo { windowSequence: number; windowShape: number; maxSfb: number; grouping: number; groupLengths: number[]; windows: number }
export interface Channel {
  globalGain: number;
  info: IcsInfo;
  /** Codebook per band, per window group ([group][sfb]). */
  sectionCb: number[][];
  /** Scalefactor per band per group (absolute; noise energy / intensity position for those books). */
  scalefactors: number[][];
  pulse: { start: number; offsets: number[]; amps: number[] } | null;
  tns: { filters: number; orders: number[] } | null;
  /** The 1024 quantised spectral values in bitstream order (short windows: per group, band, window). */
  spectrum: Int16Array;
  /** Band edges (spectral lines) used, and where each part of this channel sits in the packet (bits). */
  swb: number[];
  bits: { start: number; section: number; scalefactors: number; tools: number; spectral: number; end: number };
}
export interface Element { type: 'SCE' | 'CPE' | 'CCE' | 'LFE' | 'DSE' | 'PCE' | 'FIL' | 'END'; tag?: number; at: number; end: number; commonWindow?: boolean; msMask?: number; channels: Channel[] }
export interface DecodedPacket { elements: Element[]; bitsUsed: number; ok: boolean; error?: string }

const ELEMENTS = ['SCE', 'CPE', 'CCE', 'LFE', 'DSE', 'PCE', 'FIL', 'END'] as const;

function readIcsInfo(r: Reader): IcsInfo {
  r.read(1); // ics_reserved_bit
  const windowSequence = r.read(2), windowShape = r.read(1);
  if (windowSequence === 2) {
    const maxSfb = r.read(4), grouping = r.read(7), groupLengths = [1];
    for (let k = 6; k >= 0; k--) { if ((grouping >> k) & 1) groupLengths[groupLengths.length - 1]++; else groupLengths.push(1); }
    return { windowSequence, windowShape, maxSfb, grouping, groupLengths, windows: 8 };
  }
  const maxSfb = r.read(6);
  if (r.read(1)) throw new Error('prediction (AAC Main) is not supported');
  return { windowSequence, windowShape, maxSfb, grouping: 0, groupLengths: [1], windows: 1 };
}

function readIcs(r: Reader, sfi: number, common: IcsInfo | null): Channel {
  const start = r.pos;
  const globalGain = r.read(8);
  const info = common ?? readIcsInfo(r);
  const short = info.windowSequence === 2, swb = swbOffsets(sfi, short);
  const sectionStart = r.pos;
  // Section data: runs of bands that share a codebook.
  const sectBits = short ? 3 : 5, esc = (1 << sectBits) - 1;
  const sectionCb = info.groupLengths.map(() => {
    const cbs: number[] = [];
    for (let k = 0; k < info.maxSfb;) {
      const cb = r.read(4);
      if (cb === 12) throw new Error('reserved codebook 12');
      let len = 0, inc: number;
      while ((inc = r.read(sectBits)) === esc) len += esc;
      len += inc;
      if (!len || k + len > info.maxSfb) throw new Error('bad section length');
      for (let j = 0; j < len; j++) cbs.push(cb);
      k += len;
    }
    return cbs;
  });
  const sfStart = r.pos;
  // Scalefactors: differences coded with the scalefactor codebook (index − 60).
  let sf = globalGain, noise = globalGain - 90, intensity = 0, firstNoise = true;
  const scalefactors = sectionCb.map(cbs => cbs.map(cb => {
    if (cb === ZERO_HCB) return 0;
    if (cb === INTENSITY_HCB || cb === INTENSITY_HCB2) { intensity += huff(r, SF_HUFF) - 60; return intensity; }
    if (cb === NOISE_HCB) {
      if (firstNoise) { firstNoise = false; noise += r.read(9) - 256; } else noise += huff(r, SF_HUFF) - 60;
      return noise;
    }
    sf += huff(r, SF_HUFF) - 60;
    return sf;
  }));
  const toolsStart = r.pos;
  let pulse: Channel['pulse'] = null, tns: Channel['tns'] = null;
  if (r.read(1)) { // pulse_data_present (long windows only)
    const n = r.read(2) + 1, startSfb = r.read(6), offsets: number[] = [], amps: number[] = [];
    for (let k = 0; k < n; k++) { offsets.push(r.read(5)); amps.push(r.read(4)); }
    pulse = { start: startSfb, offsets, amps };
  }
  if (r.read(1)) { // tns_data_present
    const orders: number[] = [];
    let filters = 0;
    for (let w = 0; w < info.windows; w++) {
      const nf = r.read(short ? 1 : 2);
      if (!nf) continue;
      const coefRes = r.read(1);
      for (let f = 0; f < nf; f++) {
        r.read(short ? 4 : 6); // length
        const order = r.read(short ? 3 : 5);
        orders.push(order); filters++;
        if (order) {
          r.read(1); // direction
          const compress = r.read(1);
          const bits = coefRes + 3 - compress;
          for (let k = 0; k < order; k++) r.read(bits);
        }
      }
    }
    tns = { filters, orders };
  }
  if (r.read(1)) throw new Error('gain control (AAC SSR) is not supported');
  const specStart = r.pos;
  // Spectral data: per group, per band, the group's windows' lines one after another.
  const spectrum = new Int16Array(1024);
  let groupStart = 0;
  info.groupLengths.forEach((glen, g) => {
    let at = groupStart;
    for (let k = 0; k < info.maxSfb; k++) {
      const cb = sectionCb[g][k], width = (swb[k + 1] - swb[k]) * glen;
      if (cb !== ZERO_HCB && cb < NOISE_HCB) for (let j = 0; j < width; j += BOOK[cb].dim) readValues(r, cb, spectrum, at + j);
      at += width;
    }
    groupStart += glen * (short ? 128 : 1024); // bands above max_sfb stay zero
  });
  return { globalGain, info, sectionCb, scalefactors, pulse, tns, spectrum, swb,
    bits: { start, section: sectionStart, scalefactors: sfStart, tools: toolsStart, spectral: specStart, end: r.pos } };
}

/**
 * Decodes one AAC packet (a raw_data_block). `sfi` = sampling-frequency index from the
 * AudioSpecificConfig (e.g. 4 = 44.1 kHz). `ok` = it ended on END inside the packet's last byte.
 */
export function decodeAacPacket(b: Uint8Array, sfi: number): DecodedPacket {
  const r = new Reader(b), elements: Element[] = [];
  try {
    for (let guard = 0; guard < 64; guard++) {
      const at = r.pos, id = r.read(3), type = ELEMENTS[id];
      if (type === 'END') { elements.push({ type, at, end: r.pos, channels: [] }); break; }
      const tag = r.read(4);
      if (type === 'SCE' || type === 'LFE') elements.push({ type, tag, at, channels: [readIcs(r, sfi, null)], end: r.pos });
      else if (type === 'CPE') {
        const common = !!r.read(1);
        let info: IcsInfo | null = null, ms = 0;
        if (common) {
          info = readIcsInfo(r);
          ms = r.read(2);
          if (ms === 1) for (let g = 0; g < info.groupLengths.length; g++) for (let k = 0; k < info.maxSfb; k++) r.read(1);
        }
        const c1 = readIcs(r, sfi, info), c2 = readIcs(r, sfi, info);
        elements.push({ type, tag, at, commonWindow: common, msMask: ms, channels: [c1, c2], end: r.pos });
      } else if (type === 'FIL') {
        let count = tag; // the 4 bits after id are the count for FIL
        if (count === 15) count += r.read(8) - 1;
        r.pos += count * 8;
        elements.push({ type, at, end: r.pos, channels: [] });
      } else if (type === 'DSE') {
        const align = r.read(1);
        let count = r.read(8);
        if (count === 255) count += r.read(8);
        if (align) r.pos = (r.pos + 7) & ~7;
        r.pos += count * 8;
        elements.push({ type, tag, at, end: r.pos, channels: [] });
      } else throw new Error(`${type} elements are not supported`);
      if (r.over) throw new Error('ran past the packet');
    }
    const ok = elements.at(-1)?.type === 'END' && !r.over && b.length * 8 - r.pos < 8;
    return { elements, bitsUsed: r.pos, ok, error: ok ? undefined : 'did not end on END in the last byte' };
  } catch (err) {
    return { elements, bitsUsed: r.pos, ok: false, error: String((err as Error).message || err) };
  }
}
