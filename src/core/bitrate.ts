/**
 * Codec and bitrate over time, read from the file's own frames (no decoding, no service).
 *
 *   MP3   every frame header: its bitrate and length        → exact, CBR or VBR
 *   M4A   sample sizes and durations (stsz/stts, or moof/trun in fragmented files) → exact
 *   OGG   page sizes between granule positions (Opus, Vorbis) → exact per page
 *   WAV   PCM: constant (sample rate × bits × channels)
 *   FLAC  lossless: the file's average (frames are not scanned) → `exact: false`
 *
 * The curve is kbps per BIN_SEC of audio: the bytes the encoder spent on that stretch.
 * Example: a VBR MP3 → ~190 kbps in a quiet intro, ~290 kbps in a dense chorus.
 */

export interface BitrateInfo {
  codec: string;
  container: string;
  mode: 'CBR' | 'VBR' | 'lossless' | 'PCM';
  sampleRate?: number;
  channels?: number;
  avgKbps: number;
  /** kbps per bin of BIN_SEC seconds. */
  kbps: number[];
  binSec: number;
  durationSec: number;
  /** False when the curve is only the file's average (FLAC). */
  exact: boolean;
  /**
   * FRAME FIX - every frame the parser walked (MP3 frames, AAC samples, OGG pages), so the
   * Nerds view can show the one under the playhead. Absent for WAV and FLAC.
   * `offset` is the byte position in the file (0 when the container does not say, e.g. M4A);
   * `kbps` is the MP3 header's own bitrate (0 for other codecs).
   */
  frames?: FrameTable;
  /** AAC: profile from the AudioSpecificConfig (e.g. "HE-AAC (SBR)") and the declared bitrates. */
  profile?: string;
  declaredMaxKbps?: number;
  declaredAvgKbps?: number;
}

export interface FrameTable {
  unit: 'frame' | 'sample' | 'page';
  /** Start on the playback clock: the encoder's priming (skipSec) is already taken off. */
  t: Float64Array; dur: Float32Array; size: Uint32Array; offset: Float64Array; kbps: Uint16Array;
  /** MP3: the 4 header bytes of each frame (mode, padding, CRC …); 0 for other codecs. */
  hdr: Uint32Array;
  /**
   * TIMING FIX - priming the player skips at the start (MP3: LAME encoder delay + 529 decoder
   * samples; M4A: the edit list). Frame times used to ignore it and ran ~25–50 ms early.
   * Example: LAME delay 576 at 44.1 kHz → 1105 samples → 25.1 ms.
   */
  skipSec: number;
  /** Decoder-level fields per frame (core/bitstream.ts): block / window, shape, gain, reservoir. */
  dec?: DecoderFields;
}

/** Grows while parsing, then becomes typed arrays (a 13-min AAC: ~34 000 entries, ~1 MB). */
class FrameLog {
  t: number[] = []; dur: number[] = []; size: number[] = []; offset: number[] = []; kbps: number[] = []; hdr: number[] = [];
  add(t: number, dur: number, size: number, offset = 0, kbps = 0, hdr = 0): void {
    this.t.push(t); this.dur.push(dur); this.size.push(size); this.offset.push(offset); this.kbps.push(kbps); this.hdr.push(hdr);
  }
  table(unit: FrameTable['unit'], skipSec = 0): FrameTable | undefined {
    return this.t.length ? { unit, t: Float64Array.from(this.t, x => x - skipSec), dur: Float32Array.from(this.dur), size: Uint32Array.from(this.size),
      offset: Float64Array.from(this.offset), kbps: Uint16Array.from(this.kbps), hdr: Uint32Array.from(this.hdr), skipSec } : undefined;
  }
}

/**
 * The LAME/Lavc tag inside an MP3's Xing/Info frame: encoder delay and end padding (samples).
 * `xo` = where 'Xing'/'Info' starts. Null when the tag is not there.
 */
export function lameGapless(b: Uint8Array, xo: number): { delay: number; padding: number; encoder: string } | null {
  const flags = (b[xo + 4] << 24 | b[xo + 5] << 16 | b[xo + 6] << 8 | b[xo + 7]) >>> 0;
  const lo = xo + 8 + (flags & 1 ? 4 : 0) + (flags & 2 ? 4 : 0) + (flags & 4 ? 100 : 0) + (flags & 8 ? 4 : 0);
  const enc = ascii(b, lo, 9);
  if (!/^(LAME|Lavc|Lavf|GOGO)/.test(enc)) return null;
  const p = lo + 21;
  return { delay: (b[p] << 4) | (b[p + 1] >> 4), padding: ((b[p + 1] & 0x0f) << 8) | b[p + 2], encoder: enc.replace(/[^\x20-\x7e]/g, '').trim() };
}

/** Adds decoder fields to a frame table (a bad bitstream only loses these fields, not the rest). */
function withDecoder(t: FrameTable | undefined, decode: (t: FrameTable) => DecoderFields): FrameTable | undefined {
  if (!t) return t;
  try { t.dec = decode(t); } catch (err) { console.warn('Decoder fields notice:', err); }
  return t;
}

/** Index of the frame playing at `sec` (binary search), or -1. */
export function frameAt(f: FrameTable, sec: number): number {
  let lo = 0, hi = f.t.length - 1;
  if (hi < 0 || sec < f.t[0]) return -1;
  while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (f.t[mid] <= sec) lo = mid; else hi = mid - 1; }
  return lo;
}

/** Count, typical length and size range of the frames. Example: 3 276 × 26.1 ms · 417–1044 B. */
export function frameSummary(f: FrameTable): { count: number; durMs: number; minBytes: number; maxBytes: number } {
  let min = Infinity, max = 0;
  for (let i = 0; i < f.size.length; i++) { min = Math.min(min, f.size[i]); max = Math.max(max, f.size[i]); }
  const d = [...f.dur.slice(0, 200)].sort((x, y) => x - y);
  return { count: f.t.length, durMs: (d[d.length >> 1] ?? 0) * 1000, minBytes: min, maxBytes: max };
}

export const BIN_SEC = 0.5;

import { decodeAac, decodeMp3, parseEsds, type DecoderFields } from './bitstream.ts';

/** Collects (start time, duration, bytes) of frames into kbps bins. */
class Bins {
  private bytes: number[] = [];
  private secs: number[] = [];
  total = 0; time = 0;
  add(start: number, dur: number, size: number): void {
    if (!(dur > 0)) return;
    // A frame can straddle a bin edge: split its bytes by time.
    let t = start, left = dur;
    while (left > 1e-9) {
      const i = Math.floor(t / BIN_SEC + 1e-9), edge = (i + 1) * BIN_SEC, part = Math.min(left, edge - t);
      this.bytes[i] = (this.bytes[i] ?? 0) + size * (part / dur);
      this.secs[i] = (this.secs[i] ?? 0) + part;
      t += part; left -= part;
    }
    this.total += size; this.time = Math.max(this.time, start + dur);
  }
  kbps(): number[] {
    const out: number[] = [];
    for (let i = 0; i < this.bytes.length; i++) out.push(this.secs[i] ? Math.round((this.bytes[i] ?? 0) * 8 / this.secs[i] / 1000) : 0);
    return out;
  }
  avg(): number { return this.time > 0 ? Math.round(this.total * 8 / this.time / 1000) : 0; }
}

const ascii = (b: Uint8Array, o: number, n: number) => String.fromCharCode(...b.subarray(o, o + n));

// ---- MP3 ---------------------------------------------------------------------------------
const MP3_BR: Record<string, number[]> = {
  '1-1': [0, 32, 64, 96, 128, 160, 192, 224, 256, 288, 320, 352, 384, 416, 448],
  '1-2': [0, 32, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 384],
  '1-3': [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320],
  '2-1': [0, 32, 48, 56, 64, 80, 96, 112, 128, 144, 160, 176, 192, 224, 256],
  '2-2': [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160],
  '2-3': [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160],
};
const MP3_SR: Record<number, number[]> = { 3: [44100, 48000, 32000], 2: [22050, 24000, 16000], 0: [11025, 12000, 8000] };

/** One MP3 frame header at `o`, or null. */
export function mp3Frame(b: Uint8Array, o: number): { kbps: number; sr: number; len: number; spf: number; mono: boolean } | null {
  if (o + 4 > b.length || b[o] !== 0xff || (b[o + 1] & 0xe0) !== 0xe0) return null;
  const ver = (b[o + 1] >> 3) & 3, layerBits = (b[o + 1] >> 1) & 3, bri = b[o + 2] >> 4, sri = (b[o + 2] >> 2) & 3;
  if (ver === 1 || layerBits === 0 || bri === 0 || bri === 15 || sri === 3) return null;
  const layer = 4 - layerBits, v = ver === 3 ? 1 : 2;
  const kbps = MP3_BR[v + '-' + layer][bri], sr = MP3_SR[ver][sri], pad = (b[o + 2] >> 1) & 1;
  const spf = layer === 1 ? 384 : layer === 3 && v === 2 ? 576 : 1152;
  const len = layer === 1 ? (Math.floor(12000 * kbps / sr) + pad) * 4 : Math.floor((spf / 8) * kbps * 1000 / sr) + pad;
  return len > 4 ? { kbps, sr, len, spf, mono: (b[o + 3] >> 6) === 3 } : null;
}

function parseMp3(b: Uint8Array): BitrateInfo | null {
  let o = 0;
  if (ascii(b, 0, 3) === 'ID3') o = 10 + (((b[6] & 0x7f) << 21) | ((b[7] & 0x7f) << 14) | ((b[8] & 0x7f) << 7) | (b[9] & 0x7f));
  // First real frame: a header whose next frame is also a header (rules out false syncs).
  for (const limit = Math.min(b.length, o + 65536); o < limit; o++) {
    const f = mp3Frame(b, o);
    if (f && mp3Frame(b, o + f.len)) break;
  }
  const bins = new Bins(), rates = new Set<number>(), log = new FrameLog();
  let t = 0, sr = 0, mono = false, frames = 0, skip = 0;
  while (o < b.length) {
    const f = mp3Frame(b, o);
    if (!f) { o++; continue; } // resync after junk
    // A Xing/Info frame describes the file; it is not audio.
    const tag = ascii(b, o + (f.mono ? 21 : 36), 4);
    if (frames === 0 && (tag === 'Xing' || tag === 'Info')) {
      // Gapless info: the player skips encoder delay + 529 decoder samples (TIMING FIX).
      const g = lameGapless(b, o + (f.mono ? 21 : 36));
      if (g) skip = (g.delay + 529) / f.sr;
      o += f.len; frames++; continue;
    }
    const dur = f.spf / f.sr, size = Math.min(f.len, b.length - o);
    bins.add(t, dur, size);
    log.add(t, dur, size, o, f.kbps, ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0);
    rates.add(f.kbps); t += dur; sr = f.sr; mono = f.mono; o += f.len; frames++;
  }
  if (!bins.time) return null;
  return { codec: 'MP3', container: 'MP3', mode: rates.size > 1 ? 'VBR' : 'CBR', sampleRate: sr, channels: mono ? 1 : 2,
    avgKbps: bins.avg(), kbps: bins.kbps(), binSec: BIN_SEC, durationSec: bins.time, exact: true, frames: withDecoder(log.table('frame', skip), t => decodeMp3(b, t)) };
}

// ---- MP4 / M4A ---------------------------------------------------------------------------
interface Box { type: string; start: number; body: number; end: number }
function boxes(dv: DataView, from: number, to: number): Box[] {
  const out: Box[] = [];
  for (let o = from; o + 8 <= to;) {
    let size = dv.getUint32(o), body = o + 8;
    const type = String.fromCharCode(dv.getUint8(o + 4), dv.getUint8(o + 5), dv.getUint8(o + 6), dv.getUint8(o + 7));
    if (size === 1) { size = Number(dv.getBigUint64(o + 8)); body = o + 16; } else if (size === 0) size = to - o;
    if (size < 8 || o + size > to) break;
    out.push({ type, start: o, body, end: o + size });
    o += size;
  }
  return out;
}
const child = (dv: DataView, b: Box | undefined, type: string) => (b ? boxes(dv, b.body, b.end).find(x => x.type === type) : undefined);
const path = (dv: DataView, b: Box | undefined, ...types: string[]) => types.reduce<Box | undefined>((x, t) => child(dv, x, t), b);

function parseMp4(b: Uint8Array): BitrateInfo | null {
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const top = boxes(dv, 0, b.length);
  const moov = top.find(x => x.type === 'moov');
  if (!moov) return null;
  const trak = boxes(dv, moov.body, moov.end).filter(x => x.type === 'trak').find(t => {
    const h = path(dv, t, 'mdia', 'hdlr');
    return h && ascii(b, h.body + 8, 4) === 'soun';
  });
  if (!trak) return null;
  const mdhd = path(dv, trak, 'mdia', 'mdhd'), stbl = path(dv, trak, 'mdia', 'minf', 'stbl');
  if (!mdhd || !stbl) return null;
  const timescale = dv.getUint8(mdhd.body) === 1 ? dv.getUint32(mdhd.body + 20) : dv.getUint32(mdhd.body + 12);
  const trackId = (() => { const tk = child(dv, trak, 'tkhd'); return tk ? dv.getUint32(tk.body + (dv.getUint8(tk.body) === 1 ? 20 : 12)) : 1; })();
  const stsd = child(dv, stbl, 'stsd');
  let codec = 'Audio', sr: number | undefined, ch: number | undefined, esds: ReturnType<typeof parseEsds> = null;
  if (stsd) {
    const e = stsd.body + 8, four = ascii(b, e + 4, 4);
    codec = ({ mp4a: 'AAC', alac: 'ALAC', Opus: 'Opus', fLaC: 'FLAC', 'ac-3': 'AC-3', 'ec-3': 'E-AC-3' } as Record<string, string>)[four] ?? four;
    ch = dv.getUint16(e + 24); sr = dv.getUint32(e + 32) >>> 16;
    if (four === 'mp4a') esds = parseEsds(b, e + 36, Math.min(stsd.end, e + dv.getUint32(e)));
  }
  const bins = new Bins(), sizes = new Set<number>(), log = new FrameLog();
  // Plain files: one size per sample (stsz) and runs of durations (stts).
  const stsz = child(dv, stbl, 'stsz'), stts = child(dv, stbl, 'stts');
  if (stsz && stts && dv.getUint32(stsz.body + 8) > 0) {
    const fixed = dv.getUint32(stsz.body + 4), count = dv.getUint32(stsz.body + 8);
    const sizeOf = (s: number) => fixed || dv.getUint32(stsz.body + 12 + s * 4);
    // Byte offset of every sample: chunk offsets (stco / co64) and samples per chunk (stsc).
    const offsets = new Float64Array(count);
    const stco = child(dv, stbl, 'stco'), co64 = child(dv, stbl, 'co64'), stsc = child(dv, stbl, 'stsc');
    if ((stco || co64) && stsc) {
      const nChunks = dv.getUint32((stco ?? co64)!.body + 4), nRuns = dv.getUint32(stsc.body + 4);
      const chunkAt = (c: number) => (stco ? dv.getUint32(stco.body + 8 + c * 4) : Number(dv.getBigUint64(co64!.body + 8 + c * 8)));
      let s = 0;
      for (let r = 0; r < nRuns && s < count; r++) {
        const first = dv.getUint32(stsc.body + 8 + r * 12) - 1, per = dv.getUint32(stsc.body + 12 + r * 12);
        const next = r + 1 < nRuns ? dv.getUint32(stsc.body + 8 + (r + 1) * 12) - 1 : nChunks;
        for (let c = first; c < next && s < count; c++) {
          let off = chunkAt(c);
          for (let k = 0; k < per && s < count; k++, s++) { offsets[s] = off; off += sizeOf(s); }
        }
      }
    }
    let s = 0, t = 0;
    const runs = dv.getUint32(stts.body + 4);
    for (let r = 0; r < runs; r++) {
      const n = dv.getUint32(stts.body + 8 + r * 8), delta = dv.getUint32(stts.body + 12 + r * 8) / timescale;
      for (let k = 0; k < n && s < count; k++, s++) {
        const size = sizeOf(s);
        bins.add(t, delta, size); log.add(t, delta, size, offsets[s]); sizes.add(size); t += delta;
      }
    }
  } else {
    // Fragmented files (YouTube, DASH): defaults in moov/mvex/trex, samples in moof/traf/trun.
    let defDur = 0, defSize = 0;
    const mvex = child(dv, moov, 'mvex');
    for (const tx of mvex ? boxes(dv, mvex.body, mvex.end).filter(x => x.type === 'trex') : []) {
      if (dv.getUint32(tx.body + 4) === trackId) { defDur = dv.getUint32(tx.body + 12); defSize = dv.getUint32(tx.body + 16); }
    }
    let t = 0;
    for (const moof of top.filter(x => x.type === 'moof')) {
      for (const traf of boxes(dv, moof.body, moof.end).filter(x => x.type === 'traf')) {
        const tfhd = child(dv, traf, 'tfhd');
        if (!tfhd || dv.getUint32(tfhd.body + 4) !== trackId) continue;
        const tf = dv.getUint32(tfhd.body) & 0xffffff;
        let o = tfhd.body + 8, dDur = defDur, dSize = defSize;
        // Sample bytes start at the base data offset (or the moof box) plus trun's data offset.
        let base = moof.start;
        if (tf & 0x1) { base = Number(dv.getBigUint64(o)); o += 8; }
        if (tf & 0x2) o += 4;
        if (tf & 0x8) { dDur = dv.getUint32(o); o += 4; }
        if (tf & 0x10) { dSize = dv.getUint32(o); o += 4; }
        const tfdt = child(dv, traf, 'tfdt');
        if (tfdt) t = (dv.getUint8(tfdt.body) === 1 ? Number(dv.getBigUint64(tfdt.body + 4)) : dv.getUint32(tfdt.body + 4)) / timescale;
        for (const trun of boxes(dv, traf.body, traf.end).filter(x => x.type === 'trun')) {
          const fl = dv.getUint32(trun.body) & 0xffffff, n = dv.getUint32(trun.body + 4);
          let p = trun.body + 8, off = base;
          if (fl & 0x1) { off = base + dv.getInt32(p); p += 4; }
          if (fl & 0x4) p += 4;
          for (let k = 0; k < n; k++) {
            let dur = dDur, size = dSize;
            if (fl & 0x100) { dur = dv.getUint32(p); p += 4; }
            if (fl & 0x200) { size = dv.getUint32(p); p += 4; }
            if (fl & 0x400) p += 4; if (fl & 0x800) p += 4;
            bins.add(t, dur / timescale, size); log.add(t, dur / timescale, size, off); sizes.add(size); t += dur / timescale; off += size;
          }
        }
      }
    }
  }
  if (!bins.time) return null;
  // TIMING FIX - the edit list says where playback starts in the samples (AAC priming, often
  // 1024–2112 samples); the player starts there, so frame times move back by that much.
  let skip = 0;
  const elst = path(dv, trak, 'edts', 'elst');
  if (elst) {
    const v = dv.getUint8(elst.body), n = dv.getUint32(elst.body + 4), step = v === 1 ? 20 : 12;
    for (let e = 0; e < n; e++) {
      const at = elst.body + 8 + e * step + (v === 1 ? 8 : 4);
      const mediaTime = v === 1 ? Number(dv.getBigInt64(at)) : dv.getInt32(at);
      if (mediaTime >= 0) { skip = mediaTime / timescale; break; }
    }
  }
  const lossless = codec === 'ALAC' || codec === 'FLAC';
  return { codec, container: 'M4A', mode: lossless ? 'lossless' : sizes.size > 1 ? 'VBR' : 'CBR', sampleRate: sr, channels: ch,
    avgKbps: bins.avg(), kbps: bins.kbps(), binSec: BIN_SEC, durationSec: bins.time, exact: true,
    frames: codec === 'AAC' ? withDecoder(log.table('sample', skip), t => decodeAac(b, t)) : log.table('sample', skip),
    profile: esds?.profile, declaredMaxKbps: esds?.maxBitrate ? Math.round(esds.maxBitrate / 1000) : undefined,
    declaredAvgKbps: esds?.avgBitrate ? Math.round(esds.avgBitrate / 1000) : undefined };
}

// ---- OGG (Opus, Vorbis) --------------------------------------------------------------------
function parseOgg(b: Uint8Array): BitrateInfo | null {
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  let o = 0, codec = 'Vorbis', sr = 48000, ch: number | undefined, lastGran = 0, first = true;
  const bins = new Bins(), log = new FrameLog();
  while (o + 27 <= b.length && ascii(b, o, 4) === 'OggS') {
    const gran = Number(dv.getBigInt64(o + 6, true)), nseg = b[o + 26];
    let body = 0;
    for (let i = 0; i < nseg; i++) body += b[o + 27 + i];
    const size = 27 + nseg + body, data = o + 27 + nseg;
    if (first) {
      if (ascii(b, data, 8) === 'OpusHead') { codec = 'Opus'; sr = 48000; ch = b[data + 9]; }
      else if (ascii(b, data + 1, 6) === 'vorbis') { codec = 'Vorbis'; ch = b[data + 11]; sr = dv.getUint32(data + 12, true); }
      first = false;
    } else if (gran > lastGran) {
      bins.add(lastGran / sr, (gran - lastGran) / sr, size);
      log.add(lastGran / sr, (gran - lastGran) / sr, size, o);
      lastGran = gran;
    }
    o += size;
  }
  if (!bins.time) return null;
  return { codec, container: 'OGG', mode: 'VBR', sampleRate: codec === 'Opus' ? undefined : sr, channels: ch,
    avgKbps: bins.avg(), kbps: bins.kbps(), binSec: BIN_SEC, durationSec: bins.time, exact: true, frames: log.table('page') };
}

// ---- WAV, FLAC -------------------------------------------------------------------------------
function flat(info: Omit<BitrateInfo, 'kbps' | 'binSec'>): BitrateInfo {
  return { ...info, kbps: new Array(Math.max(1, Math.ceil(info.durationSec / BIN_SEC))).fill(info.avgKbps), binSec: BIN_SEC };
}

function parseWav(b: Uint8Array): BitrateInfo | null {
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  let fmt: { ch: number; sr: number; byteRate: number; bits: number; format: number } | null = null, dataBytes = 0;
  for (let o = 12; o + 8 <= b.length;) {
    const id = ascii(b, o, 4), size = dv.getUint32(o + 4, true);
    if (id === 'fmt ') fmt = { format: dv.getUint16(o + 8, true), ch: dv.getUint16(o + 10, true), sr: dv.getUint32(o + 12, true), byteRate: dv.getUint32(o + 16, true), bits: dv.getUint16(o + 22, true) };
    if (id === 'data') { dataBytes = Math.min(size, b.length - o - 8); break; }
    o += 8 + size + (size & 1);
  }
  if (!fmt || !fmt.byteRate) return null;
  return flat({ codec: fmt.format === 3 ? `PCM ${fmt.bits}-bit float` : `PCM ${fmt.bits}-bit`, container: 'WAV', mode: 'PCM',
    sampleRate: fmt.sr, channels: fmt.ch, avgKbps: Math.round(fmt.byteRate * 8 / 1000), durationSec: dataBytes / fmt.byteRate, exact: true });
}

function parseFlac(b: Uint8Array): BitrateInfo | null {
  // STREAMINFO is the first metadata block: sample rate (20 bits), channels, total samples.
  const o = 8, sr = (b[o + 10] << 12) | (b[o + 11] << 4) | (b[o + 12] >> 4), ch = ((b[o + 12] >> 1) & 7) + 1;
  const total = ((b[o + 13] & 0x0f) * 2 ** 32) + ((b[o + 14] << 24) >>> 0) + (b[o + 15] << 16) + (b[o + 16] << 8) + b[o + 17];
  if (!sr || !total) return null;
  const dur = total / sr;
  return flat({ codec: 'FLAC', container: 'FLAC', mode: 'lossless', sampleRate: sr, channels: ch,
    avgKbps: Math.round(b.length * 8 / dur / 1000), durationSec: dur, exact: false });
}

/** Codec and bitrate curve of an audio file's bytes; null when the format is not known. */
export function parseBitrate(bytes: ArrayBuffer | Uint8Array): BitrateInfo | null {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  try {
    if (ascii(b, 0, 4) === 'RIFF' && ascii(b, 8, 4) === 'WAVE') return parseWav(b);
    if (ascii(b, 0, 4) === 'fLaC') return parseFlac(b);
    if (ascii(b, 0, 4) === 'OggS') return parseOgg(b);
    if (ascii(b, 4, 4) === 'ftyp') return parseMp4(b);
    return parseMp3(b);
  } catch (err) {
    console.warn('Bitrate notice:', err);
    return null;
  }
}

/** One line for Explore. Example: "MP3 · VBR · avg 245 kbps · 44.1 kHz · stereo". */
export function bitrateSummary(i: BitrateInfo): string {
  const out = [i.codec, i.mode === 'PCM' ? 'uncompressed' : i.mode, 'avg ' + i.avgKbps + ' kbps'];
  if (i.sampleRate) out.push((i.sampleRate / 1000).toFixed(i.sampleRate % 1000 ? 1 : 0) + ' kHz');
  if (i.channels) out.push(i.channels === 1 ? 'mono' : i.channels === 2 ? 'stereo' : i.channels + ' ch');
  return out.join(' · ');
}

/**
 * Bitrate of one passage, for the Nerds view (in sync with the selection or loop).
 * `bytes` = what the file spends on it; min/max over its half-second bins.
 * Example: 1:10–1:22 of a 128 kbps AAC → { min 118, avg 128, max 139, bytes ≈ 192 000 }.
 */
export function rangeStats(i: BitrateInfo, a: number, b: number): { min: number; avg: number; max: number; bytes: number; sec: number } | null {
  const lo = Math.max(0, a), hi = Math.min(i.durationSec, b);
  if (!(hi > lo)) return null;
  let bits = 0, min = Infinity, max = 0;
  for (let k = Math.floor(lo / i.binSec); k * i.binSec < hi && k < i.kbps.length; k++) {
    const s = Math.max(lo, k * i.binSec), e = Math.min(hi, (k + 1) * i.binSec), v = i.kbps[k];
    if (!(e > s) || !v) continue;
    bits += v * 1000 * (e - s); min = Math.min(min, v); max = Math.max(max, v);
  }
  if (!bits) return null;
  return { min, avg: Math.round(bits / (hi - lo) / 1000), max, bytes: Math.round(bits / 8), sec: hi - lo };
}

/**
 * An MP3 frame header, field by field (ISO 11172-3). Example for FF FB 92 64:
 * { version: 'MPEG-1', layer: 'Layer III', kbps: 128, sampleRate: 44100, padding: true, crc: false,
 *   mode: 'joint stereo', modeExt: 'M/S stereo', copyright: false, original: true, emphasis: 'none' }.
 */
export function mp3Header(h: number): Record<string, string | number | boolean> {
  const b1 = (h >>> 16) & 0xff, b2 = (h >>> 8) & 0xff, b3 = h & 0xff, ver = (b1 >> 3) & 3, layer = 4 - ((b1 >> 1) & 3);
  const mode = b3 >> 6, ext = (b3 >> 4) & 3, f = mp3Frame(new Uint8Array([0xff, b1, b2, b3]), 0);
  return {
    version: ver === 3 ? 'MPEG-1' : ver === 2 ? 'MPEG-2' : 'MPEG-2.5', layer: ['', 'Layer I', 'Layer II', 'Layer III'][layer],
    kbps: f?.kbps ?? 0, sampleRate: f?.sr ?? 0, padding: !!((b2 >> 1) & 1), crc: !(b1 & 1),
    mode: ['stereo', 'joint stereo', 'dual channel', 'mono'][mode],
    modeExt: mode !== 1 ? '' : layer === 3 ? ['L/R', 'intensity', 'M/S', 'M/S + intensity'][ext] : `bands ${4 * ext + 4}–31`,
    copyright: !!((b3 >> 3) & 1), original: !!((b3 >> 2) & 1), emphasis: ['none', '50/15 µs', 'reserved', 'CCITT J.17'][b3 & 3],
  };
}

/**
 * The frames of a passage (the loop): which ones, how many, how big.
 * Example: 1:10–1:22 of a 128 kbps AAC → { first 3015, last 3531, count 517, bytes 192 400, min 6, max 579, avg 372 }.
 */
export function framesIn(f: FrameTable, a: number, b: number): { first: number; last: number; count: number; bytes: number; min: number; max: number; avg: number } | null {
  let first = Math.max(0, frameAt(f, a));
  if (f.t[first] + f.dur[first] <= a) first++;
  let last = frameAt(f, b);
  if (last >= 0 && f.t[last] >= b) last--;
  if (last < first || first >= f.t.length) return null;
  let bytes = 0, min = Infinity, max = 0;
  for (let i = first; i <= last; i++) { bytes += f.size[i]; min = Math.min(min, f.size[i]); max = Math.max(max, f.size[i]); }
  const count = last - first + 1;
  return { first, last, count, bytes, min, max, avg: Math.round(bytes / count) };
}

/**
 * The frame under the playhead, in words (Nerds view, live).
 * Example: "frame 383 of 2,912 · starts 9.987 s · 627 B · 192 kbps in its header · 26.12 ms · byte 240,830 ·
 *           joint stereo (M/S) · padded · no CRC".
 */
export function frameLine(f: FrameTable, i: number): string {
  if (i < 0 || i >= f.t.length) return '';
  const name = f.unit === 'page' ? 'page' : f.unit === 'sample' ? 'packet' : 'frame';
  const out = [`${name} ${(i + 1).toLocaleString('en')} of ${f.t.length.toLocaleString('en')}`, `starts ${f.t[i].toFixed(3)} s`, `${f.size[i]} B`];
  if (f.kbps[i]) out.push(`${f.kbps[i]} kbps in its header`);
  out.push(`${(f.dur[i] * 1000).toFixed(2)} ms`);
  if (f.offset[i]) out.push(`byte ${Math.round(f.offset[i]).toLocaleString('en')}`);
  if (!f.kbps[i] && f.dur[i] > 0) out.push(`${Math.round(f.size[i] * 8 / f.dur[i] / 1000)} kbps over this ${name}`);
  if (f.hdr[i]) {
    const h = mp3Header(f.hdr[i]);
    out.push(String(h.mode) + (h.modeExt ? ' (' + h.modeExt + ')' : ''));
    if (h.padding) out.push('padded');
    out.push(h.crc ? 'CRC' : 'no CRC');
    if (h.emphasis !== 'none') out.push('emphasis ' + h.emphasis);
  }
  return out.join(' · ');
}
