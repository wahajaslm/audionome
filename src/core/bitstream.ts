/**
 * Decoder-level fields of each frame, read from the bitstream at the frame's byte offset.
 *
 *   MP3 (side info, ISO 11172-3 / 13818-3)   block type per granule (long · start · short · stop),
 *                                            global gain, bits used (part2_3_length), bit reservoir
 *                                            (main_data_begin), M/S from the header
 *   AAC (raw_data_block, ISO 14496-3)        first channel element (SCE / CPE / LFE), window
 *                                            sequence, window shape (sine / KBD), max_sfb, global
 *                                            gain, common window and the M/S mask
 *   AAC config (AudioSpecificConfig, esds)   object type → LC · HE-AAC (SBR) · HE-AAC v2 (PS) …
 *
 * Short blocks / eight-short windows are the encoder's answer to a transient (a hit, a pluck):
 * the strip of them over time shows where the music is sharp.
 * Example: a tabla stroke at 1:02.40 → MP3 frames 2386–2387 switch to short blocks.
 */
import type { FrameTable } from './bitrate.ts';

/** Block / window kind, the same codes for MP3 and AAC: 0 long · 1 start · 2 short · 3 stop. */
export const BLOCK_NAMES = ['long', 'start', 'short', 'stop'] as const;
/** 255 = not read (unknown element, too short, or a codec without these fields). */
export const UNKNOWN = 255;

export interface DecoderFields {
  codec: 'mp3' | 'aac';
  /** Block / window per frame (BLOCK_NAMES index; MP3: shortest of its granules). */
  block: Uint8Array;
  /** AAC window shape: 0 sine · 1 KBD. */
  shape: Uint8Array;
  /** Global gain of the first channel (the quantiser's step). */
  gain: Uint8Array;
  /** MP3: bits of Huffman data (part2_3_length, all granules and channels); AAC: max_sfb. */
  bits: Uint16Array;
  /** MP3: bit reservoir in bytes (main_data_begin). */
  reservoir: Uint16Array;
  /** Mid/side: MP3 from the header's mode extension; AAC: ms_mask_present (0 none · 1 per band · 2 all). */
  ms: Uint8Array;
  /** AAC: first element: 0 SCE · 1 CPE · 3 LFE; MP3: 255. */
  element: Uint8Array;
}

/** Reads bits MSB-first from `b` starting at byte `at`. */
class Bits {
  private pos: number;
  private readonly b: Uint8Array;
  private readonly end: number;
  constructor(b: Uint8Array, at: number, end: number) { this.b = b; this.end = end; this.pos = at * 8; }
  get ok(): boolean { return this.pos <= this.end * 8; }
  read(n: number): number {
    let v = 0;
    for (let i = 0; i < n; i++) {
      const byte = this.b[this.pos >> 3] ?? 0;
      v = (v << 1) | ((byte >> (7 - (this.pos & 7))) & 1);
      this.pos++;
    }
    return v >>> 0;
  }
  skip(n: number): void { this.pos += n; }
}

function blank(n: number, codec: 'mp3' | 'aac'): DecoderFields {
  return { codec, block: new Uint8Array(n).fill(UNKNOWN), shape: new Uint8Array(n).fill(UNKNOWN), gain: new Uint8Array(n).fill(UNKNOWN),
    bits: new Uint16Array(n), reservoir: new Uint16Array(n), ms: new Uint8Array(n).fill(UNKNOWN), element: new Uint8Array(n).fill(UNKNOWN) };
}

/** MP3 side info of every frame (needs the frame headers in `f.hdr`). */
export function decodeMp3(b: Uint8Array, f: FrameTable): DecoderFields {
  const n = f.t.length, d = blank(n, 'mp3');
  for (let i = 0; i < n; i++) {
    const h = f.hdr[i], o = f.offset[i];
    if (!h || o + 40 > b.length) continue;
    const b1 = (h >>> 16) & 0xff, b3 = h & 0xff, mpeg1 = ((b1 >> 3) & 3) === 3, layer3 = ((b1 >> 1) & 3) === 1;
    if (!layer3) continue;
    const crc = !(b1 & 1), mono = (b3 >> 6) === 3, nch = mono ? 1 : 2;
    d.ms[i] = (b3 >> 6) === 1 && ((b3 >> 5) & 1) ? 1 : 0;
    const r = new Bits(b, o + 4 + (crc ? 2 : 0), o + f.size[i]);
    d.reservoir[i] = r.read(mpeg1 ? 9 : 8);
    r.skip(mpeg1 ? (mono ? 5 : 3) : (mono ? 1 : 2));
    if (mpeg1) r.skip(4 * nch); // scfsi
    let shortest = 0, bits = 0, gain = UNKNOWN;
    const granules = mpeg1 ? 2 : 1;
    for (let gr = 0; gr < granules; gr++) for (let ch = 0; ch < nch; ch++) {
      bits += r.read(12);          // part2_3_length
      r.skip(9);                   // big_values
      const g = r.read(8);         // global_gain
      if (gain === UNKNOWN) gain = g;
      r.skip(mpeg1 ? 4 : 9);       // scalefac_compress
      if (r.read(1)) {             // window_switching_flag
        const bt = r.read(2); r.skip(1 + 10 + 9);
        // the "most transient" block of the frame: short beats start/stop beats long
        if (bt === 2 || (bt && shortest !== 2)) shortest = bt;
      } else r.skip(15 + 4 + 3);
      r.skip(mpeg1 ? 3 : 2);       // preflag (MPEG-1), scalefac_scale, count1table_select
    }
    if (!r.ok) continue;
    d.block[i] = shortest; d.gain[i] = gain; d.bits[i] = Math.min(65535, bits);
  }
  return d;
}

/** ics_info: window sequence, shape, max_sfb and the number of window groups. */
function icsInfo(r: Bits): { seq: number; shape: number; maxSfb: number; groups: number } {
  r.skip(1); // ics_reserved_bit
  const seq = r.read(2), shape = r.read(1);
  if (seq === 2) {
    const maxSfb = r.read(4), grouping = r.read(7);
    let groups = 1;
    for (let k = 6; k >= 0; k--) if (!((grouping >> k) & 1)) groups++;
    return { seq, shape, maxSfb, groups };
  }
  const maxSfb = r.read(6);
  r.skip(1); // predictor_data_present (0 for AAC-LC)
  return { seq, shape, maxSfb, groups: 1 };
}

/** AAC raw_data_block start of every packet (AAC-LC core; HE-AAC's core is the same). */
export function decodeAac(b: Uint8Array, f: FrameTable): DecoderFields {
  const n = f.t.length, d = blank(n, 'aac');
  for (let i = 0; i < n; i++) {
    const o = f.offset[i];
    if (!o || f.size[i] < 3 || o + f.size[i] > b.length) continue;
    const r = new Bits(b, o, o + f.size[i]);
    const id = r.read(3);
    if (id !== 0 && id !== 1 && id !== 3) continue; // SCE, CPE, LFE only
    r.skip(4); // element_instance_tag
    d.element[i] = id;
    let info: ReturnType<typeof icsInfo>;
    if (id === 1) {
      const common = r.read(1);
      if (common) {
        info = icsInfo(r);
        const msp = r.read(2);
        d.ms[i] = msp;
        if (msp === 1) r.skip(info.groups * info.maxSfb);
        d.gain[i] = r.read(8);
      } else {
        d.ms[i] = 0;
        d.gain[i] = r.read(8);
        info = icsInfo(r);
      }
    } else {
      d.gain[i] = r.read(8);
      info = icsInfo(r);
    }
    if (!r.ok) { d.gain[i] = UNKNOWN; continue; }
    d.block[i] = info.seq; d.shape[i] = info.shape; d.bits[i] = info.maxSfb;
  }
  return d;
}

/** AudioSpecificConfig → AAC profile. Example: object type 2 → "AAC-LC"; 5 → "HE-AAC (SBR)". */
export const AAC_OBJECT: Record<number, string> = {
  1: 'AAC Main', 2: 'AAC-LC', 3: 'AAC SSR', 4: 'AAC LTP', 5: 'HE-AAC (SBR)', 6: 'AAC Scalable', 23: 'AAC-LD', 29: 'HE-AAC v2 (PS)', 39: 'AAC-ELD', 42: 'xHE-AAC (USAC)',
};

/**
 * The esds descriptors inside an mp4a sample entry: object type, sample rate index, channel
 * configuration, and the declared max / average bitrate.
 */
export function parseEsds(b: Uint8Array, from: number, to: number): { objectType: number; profile: string; channelConfig: number; maxBitrate: number; avgBitrate: number } | null {
  let p = -1;
  for (let i = from; i + 4 < to; i++) if (b[i] === 0x65 && b[i + 1] === 0x73 && b[i + 2] === 0x64 && b[i + 3] === 0x73) { p = i + 8; break; } // 'esds' + version/flags
  if (p < 0) return null;
  const len = () => { let n = 0; for (let k = 0; k < 4; k++) { const c = b[p++]; n = (n << 7) | (c & 0x7f); if (!(c & 0x80)) break; } return n; };
  if (b[p++] !== 0x03) return null;
  len(); p += 2; const flags = b[p++];
  if (flags & 0x80) p += 2; if (flags & 0x40) p += 1 + b[p]; if (flags & 0x20) p += 2;
  if (b[p++] !== 0x04) return null;
  len(); p += 1 + 1 + 3;
  const u32 = () => { const v = ((b[p] << 24) | (b[p + 1] << 16) | (b[p + 2] << 8) | b[p + 3]) >>> 0; p += 4; return v; };
  const maxBitrate = u32(), avgBitrate = u32();
  if (b[p++] !== 0x05) return null;
  len();
  const r = new Bits(b, p, to);
  let objectType = r.read(5);
  if (objectType === 31) objectType = 32 + r.read(6);
  const sfi = r.read(4); if (sfi === 15) r.skip(24);
  const channelConfig = r.read(4);
  // Explicit SBR / PS signalling: the base type is followed by the extension.
  return { objectType, profile: AAC_OBJECT[objectType] ?? 'AAC type ' + objectType, channelConfig, maxBitrate, avgBitrate };
}

/** Share of each block kind over frames i0..i1. Example: { long: 0.93, start: 0.02, short: 0.03, stop: 0.02 }. */
export function blockMix(d: DecoderFields, i0: number, i1: number): Record<(typeof BLOCK_NAMES)[number], number> & { known: number } {
  const c = [0, 0, 0, 0];
  let known = 0;
  for (let i = Math.max(0, i0); i <= i1 && i < d.block.length; i++) if (d.block[i] < 4) { c[d.block[i]]++; known++; }
  const s = (k: number) => (known ? c[k] / known : 0);
  return { long: s(0), start: s(1), short: s(2), stop: s(3), known };
}

/**
 * Transients in frames i0..i1: runs of short blocks / eight-short windows (each run = one
 * sharp onset the encoder reacted to). Example: frames L L S S L L S L → 2.
 */
export function transients(d: DecoderFields, i0: number, i1: number): number {
  let runs = 0, inRun = false;
  for (let i = Math.max(0, i0); i <= i1 && i < d.block.length; i++) {
    const s = d.block[i] === 2;
    if (s && !inRun) runs++;
    inRun = s;
  }
  return runs;
}

/** Frame sizes of i0..i1 in `bins` equal steps from the smallest to the largest. */
export function sizeHistogram(size: ArrayLike<number>, i0: number, i1: number, bins = 24): { lo: number; hi: number; counts: number[] } {
  let lo = Infinity, hi = 0;
  for (let i = i0; i <= i1; i++) { lo = Math.min(lo, size[i]); hi = Math.max(hi, size[i]); }
  const counts = new Array(bins).fill(0);
  if (!(hi >= lo)) return { lo: 0, hi: 0, counts };
  const span = Math.max(1, hi - lo);
  for (let i = i0; i <= i1; i++) counts[Math.min(bins - 1, Math.floor(((size[i] - lo) / span) * bins))]++;
  return { lo, hi, counts };
}
