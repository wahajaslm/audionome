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
export function parseEsds(b: Uint8Array, from: number, to: number): { objectType: number; profile: string; channelConfig: number; maxBitrate: number; avgBitrate: number; samplingIndex: number } | null {
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
  return { objectType, profile: AAC_OBJECT[objectType] ?? 'AAC type ' + objectType, channelConfig, maxBitrate, avgBitrate, samplingIndex: sfi };
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

// ---- Frame inspector: every field of one frame -----------------------------------------------

/** One field of a frame header, for the bit diagram. */
export interface BitField { name: string; bits: number; value: number; text: string }

const MP3_KBPS_V1L3 = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320];
const MP3_KBPS_V2L3 = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160];

/**
 * The 32 header bits as named fields, in order (ISO 11172-3 §2.4.1.3).
 * Example FF FB 94 64 → sync 2047 · MPEG-1 · Layer III · no CRC · 320 kbps … (MPEG-1 L3 at 48 kHz).
 */
export function mp3HeaderFields(h: number): BitField[] {
  const f = (shift: number, bits: number) => (h >>> shift) & ((1 << bits) - 1);
  const ver = f(19, 2), layer = f(17, 2), mode = f(6, 2), sri = f(10, 2), bri = f(12, 4);
  const mpeg1 = ver === 3, l3 = layer === 1;
  const sr = (mpeg1 ? [44100, 48000, 32000] : ver === 2 ? [22050, 24000, 16000] : [11025, 12000, 8000])[sri];
  return [
    { name: 'sync', bits: 11, value: f(21, 11), text: f(21, 11) === 0x7ff ? 'frame sync' : 'not a sync word' },
    { name: 'version', bits: 2, value: ver, text: ['MPEG-2.5', 'reserved', 'MPEG-2', 'MPEG-1'][ver] },
    { name: 'layer', bits: 2, value: layer, text: ['reserved', 'Layer III', 'Layer II', 'Layer I'][layer] },
    { name: 'protection', bits: 1, value: f(16, 1), text: f(16, 1) ? 'no CRC' : 'CRC follows' },
    { name: 'bitrate', bits: 4, value: bri, text: l3 ? `${(mpeg1 ? MP3_KBPS_V1L3 : MP3_KBPS_V2L3)[bri] ?? '?'} kbps` : `index ${bri}` },
    { name: 'sample rate', bits: 2, value: sri, text: sr ? `${sr / 1000} kHz` : 'reserved' },
    { name: 'padding', bits: 1, value: f(9, 1), text: f(9, 1) ? '+1 byte' : 'none' },
    { name: 'private', bits: 1, value: f(8, 1), text: String(f(8, 1)) },
    { name: 'mode', bits: 2, value: mode, text: ['stereo', 'joint stereo', 'dual channel', 'mono'][mode] },
    { name: 'mode ext', bits: 2, value: f(4, 2), text: mode !== 1 ? 'unused' : l3 ? ['L/R', 'intensity', 'M/S', 'M/S + intensity'][f(4, 2)] : `bands ${4 * f(4, 2) + 4}–31` },
    { name: 'copyright', bits: 1, value: f(3, 1), text: f(3, 1) ? 'yes' : 'no' },
    { name: 'original', bits: 1, value: f(2, 1), text: f(2, 1) ? 'original' : 'copy' },
    { name: 'emphasis', bits: 2, value: f(0, 2), text: ['none', '50/15 µs', 'reserved', 'CCITT J.17'][f(0, 2)] },
  ];
}

export interface Mp3Granule {
  part23: number; bigValues: number; globalGain: number; scalefacCompress: number; windowSwitching: boolean;
  blockType: number; mixed: boolean; tableSelect: number[]; subblockGain: number[]; region0: number; region1: number;
  preflag: number | null; scalefacScale: number; count1table: number;
}
export interface Mp3SideInfo {
  mainDataBegin: number; privateBits: number; scfsi: number[][]; granules: Mp3Granule[][];
  /** Byte layout of the frame: header, CRC (0 or 2), side info. */
  headerBytes: 4; crcBytes: number; sideBytes: number;
}

/** Every side-info field of one MP3 frame; `b` starts at the frame's first byte. */
export function mp3SideInfo(b: Uint8Array, h: number): Mp3SideInfo | null {
  const b1 = (h >>> 16) & 0xff, b3 = h & 0xff;
  if (((b1 >> 1) & 3) !== 1) return null; // Layer III only
  const mpeg1 = ((b1 >> 3) & 3) === 3, crc = !(b1 & 1), nch = (b3 >> 6) === 3 ? 1 : 2;
  const sideBytes = mpeg1 ? (nch === 1 ? 17 : 32) : (nch === 1 ? 9 : 17), crcBytes = crc ? 2 : 0;
  if (b.length < 4 + crcBytes + sideBytes) return null;
  const r = new Bits(b, 4 + crcBytes, 4 + crcBytes + sideBytes);
  const mainDataBegin = r.read(mpeg1 ? 9 : 8), privateBits = r.read(mpeg1 ? (nch === 1 ? 5 : 3) : (nch === 1 ? 1 : 2));
  const scfsi = Array.from({ length: nch }, () => (mpeg1 ? [r.read(1), r.read(1), r.read(1), r.read(1)] : []));
  const granules: Mp3Granule[][] = [];
  for (let gr = 0; gr < (mpeg1 ? 2 : 1); gr++) {
    const chans: Mp3Granule[] = [];
    for (let ch = 0; ch < nch; ch++) {
      const part23 = r.read(12), bigValues = r.read(9), globalGain = r.read(8), scalefacCompress = r.read(mpeg1 ? 4 : 9);
      const windowSwitching = !!r.read(1);
      let blockType = 0, mixed = false, tableSelect: number[], subblockGain: number[] = [], region0: number, region1: number;
      if (windowSwitching) {
        blockType = r.read(2); mixed = !!r.read(1);
        tableSelect = [r.read(5), r.read(5)]; subblockGain = [r.read(3), r.read(3), r.read(3)];
        // Implicit region counts (ISO 11172-3 §2.4.2.7): region0 = 8 for short non-mixed blocks,
        // else 7; region1 = 36, i.e. "the rest of the spectrum".
        region0 = blockType === 2 && !mixed ? 8 : 7; region1 = 36;
      } else {
        tableSelect = [r.read(5), r.read(5), r.read(5)]; region0 = r.read(4); region1 = r.read(3);
      }
      const preflag = mpeg1 ? r.read(1) : null;
      chans.push({ part23, bigValues, globalGain, scalefacCompress, windowSwitching, blockType, mixed, tableSelect, subblockGain, region0, region1,
        preflag, scalefacScale: r.read(1), count1table: r.read(1) });
    }
    granules.push(chans);
  }
  return { mainDataBegin, privateBits, scfsi, granules, headerBytes: 4, crcBytes, sideBytes };
}

/**
 * The bit reservoir, frame by frame: main_data_begin points this many bytes back into the main
 * data of earlier frames. Returns which earlier frames hold the borrowed bytes.
 * Example: 503 B back, previous frames each have 924 B of main data → all from frame i − 1.
 */
export function reservoirSource(f: FrameTable, i: number, back: number): { from: number; to: number } | null {
  if (!back || !f.hdr[i]) return null;
  let need = back, k = i - 1;
  for (; k >= 0 && need > 0; k--) {
    const h = f.hdr[k], b1 = (h >>> 16) & 0xff, b3 = h & 0xff, mpeg1 = ((b1 >> 3) & 3) === 3, mono = (b3 >> 6) === 3;
    const side = mpeg1 ? (mono ? 17 : 32) : (mono ? 9 : 17);
    need -= f.size[k] - 4 - (b1 & 1 ? 0 : 2) - side;
  }
  return { from: k + 1, to: i - 1 };
}

export interface AacChannel { globalGain: number | null; windowSequence: number; windowShape: number; maxSfb: number; groups: number; grouping: number | null }
export interface AacPacketInfo {
  element: 'SCE' | 'CPE' | 'LFE' | string; tag: number; commonWindow: boolean | null; msMaskPresent: number | null;
  channels: AacChannel[];
  /** Bits read from the start of the packet (the rest is section, scalefactor and spectral data). */
  bitsRead: number;
}
const ELEMENT = ['SCE', 'CPE', 'CCE', 'LFE', 'DSE', 'PCE', 'FIL', 'END'];

/** The first channel element of one AAC packet, field by field; `b` starts at the packet. */
export function aacPacket(b: Uint8Array): AacPacketInfo | null {
  if (b.length < 3) return null;
  const r = new Bits(b, 0, b.length);
  const id = r.read(3), tag = r.read(4);
  if (id !== 0 && id !== 1 && id !== 3) return { element: ELEMENT[id], tag, commonWindow: null, msMaskPresent: null, channels: [], bitsRead: 7 };
  const ics = (): AacChannel => {
    r.skip(1);
    const windowSequence = r.read(2), windowShape = r.read(1);
    if (windowSequence === 2) {
      const maxSfb = r.read(4), grouping = r.read(7);
      let groups = 1;
      for (let k = 6; k >= 0; k--) if (!((grouping >> k) & 1)) groups++;
      return { globalGain: null, windowSequence, windowShape, maxSfb, groups, grouping };
    }
    const maxSfb = r.read(6); r.skip(1);
    return { globalGain: null, windowSequence, windowShape, maxSfb, groups: 1, grouping: null };
  };
  let commonWindow: boolean | null = null, ms: number | null = null;
  const channels: AacChannel[] = [];
  if (id === 1) {
    commonWindow = !!r.read(1);
    if (commonWindow) {
      const info = ics();
      ms = r.read(2);
      if (ms === 1) r.skip(info.groups * info.maxSfb);
      info.globalGain = r.read(8);
      channels.push(info, { ...info, globalGain: null }); // channel 2 shares the window; its gain sits after channel 1's data
    } else {
      const g = r.read(8), info = ics();
      channels.push({ ...info, globalGain: g });
    }
  } else {
    const g = r.read(8), info = ics();
    channels.push({ ...info, globalGain: g });
  }
  return { element: ELEMENT[id], tag, commonWindow, msMaskPresent: ms, channels, bitsRead: 0 };
}

/**
 * The first fields of an AAC packet as named bit fields (ISO 14496-3 §4.4.2), up to channel 1's
 * global gain. What follows (section data, scalefactors, spectral data) needs a full decoder.
 * Example CPE, common window, long: id 1 · tag 0 · common 1 · seq 0 · shape 1 · max_sfb 49 … gain 156.
 */
export function aacFields(b: Uint8Array): BitField[] {
  if (b.length < 3) return [];
  const r = new Bits(b, 0, b.length), out: BitField[] = [];
  const take = (name: string, bits: number, text: (v: number) => string) => { const v = r.read(bits); out.push({ name, bits, value: v, text: text(v) }); return v; };
  const id = take('id_syn_ele', 3, v => ELEMENT[v]);
  take('element_tag', 4, v => String(v));
  if (id !== 0 && id !== 1 && id !== 3) return out;
  const ics = () => {
    take('ics_reserved', 1, v => String(v));
    const seq = take('window_sequence', 2, v => ['only long', 'long start', 'eight short', 'long stop'][v]);
    take('window_shape', 1, v => (v ? 'KBD' : 'sine'));
    if (seq === 2) {
      const sfb = take('max_sfb', 4, v => String(v));
      const g = take('sf_grouping', 7, v => v.toString(2).padStart(7, '0'));
      let groups = 1;
      for (let k = 6; k >= 0; k--) if (!((g >> k) & 1)) groups++;
      return { sfb, groups };
    }
    const sfb = take('max_sfb', 6, v => String(v));
    take('predictor', 1, v => (v ? 'on' : 'off'));
    return { sfb, groups: 1 };
  };
  if (id === 1) {
    const common = take('common_window', 1, v => (v ? 'shared' : 'separate'));
    if (common) {
      const info = ics();
      const ms = take('ms_mask_present', 2, v => ['off', 'per band', 'all bands', 'reserved'][v]);
      if (ms === 1 && info.groups * info.sfb > 0) { const n = info.groups * info.sfb; r.skip(n); out.push({ name: 'ms_used', bits: n, value: 0, text: `${n} band flags` }); }
      take('global_gain', 8, v => String(v));
      return out;
    }
  }
  take('global_gain', 8, v => String(v));
  ics();
  return out;
}

// ---- Frame table: filter and sort frames like a packet list -------------------------------------

export type FrameFilter = 'all' | 'short' | 'switch' | 'large' | 'gainjump';
export type FrameSort = 'index' | 'size' | 'gain' | 'bits' | 'reservoir';

/** Gain change (steps) from the previous frame that counts as a jump. */
export const GAIN_JUMP = 6;

/**
 * Indices of frames i0..i1 that pass `filter`, ordered by `sort` (descending for values,
 * ascending for index). Example: filter 'short' on a 12 s AAC loop → the 48 eight-short packets.
 *   short     short blocks / eight-short windows (transients)
 *   switch    start and stop blocks (the encoder changing window length)
 *   large     the largest 5 % of the range, by bytes
 *   gainjump  global gain moved by GAIN_JUMP or more since the previous frame
 */
export function frameRows(f: FrameTable, i0: number, i1: number, filter: FrameFilter, sort: FrameSort): Int32Array {
  const d = f.dec, lo = Math.max(0, i0), hi = Math.min(f.t.length - 1, i1);
  if (hi < lo) return new Int32Array(0);
  let cut = 0;
  if (filter === 'large') {
    const sizes = Array.from(f.size.subarray(lo, hi + 1)).sort((a, b) => b - a);
    cut = sizes[Math.max(0, Math.floor(sizes.length * 0.05) - 1)] ?? 0;
    // Constant-size frames (CBR, give or take padding): there is no "largest" to show.
    if (sizes[0] - sizes[sizes.length - 1] <= 1) return new Int32Array(0);
  }
  const keep: number[] = [];
  for (let i = lo; i <= hi; i++) {
    if (filter === 'short' && !(d && d.block[i] === 2)) continue;
    if (filter === 'switch' && !(d && (d.block[i] === 1 || d.block[i] === 3))) continue;
    if (filter === 'large' && f.size[i] < cut) continue;
    if (filter === 'gainjump' && !(d && i > 0 && d.gain[i] !== UNKNOWN && d.gain[i - 1] !== UNKNOWN && Math.abs(d.gain[i] - d.gain[i - 1]) >= GAIN_JUMP)) continue;
    keep.push(i);
  }
  const out = Int32Array.from(keep);
  if (sort === 'index') return out;
  const key = (i: number) => (sort === 'size' ? f.size[i] : !d ? 0 : sort === 'gain' ? d.gain[i] : sort === 'bits' ? d.bits[i] : d.reservoir[i]);
  return out.sort((a, b) => key(b) - key(a) || a - b);
}
