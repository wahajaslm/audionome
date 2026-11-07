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
}

export const BIN_SEC = 0.5;

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
  const bins = new Bins(), rates = new Set<number>();
  let t = 0, sr = 0, mono = false, frames = 0;
  while (o < b.length) {
    const f = mp3Frame(b, o);
    if (!f) { o++; continue; } // resync after junk
    // A Xing/Info frame describes the file; it is not audio.
    const tag = ascii(b, o + (f.mono ? 21 : 36), 4);
    if (frames === 0 && (tag === 'Xing' || tag === 'Info')) { o += f.len; frames++; continue; }
    const dur = f.spf / f.sr;
    bins.add(t, dur, Math.min(f.len, b.length - o));
    rates.add(f.kbps); t += dur; sr = f.sr; mono = f.mono; o += f.len; frames++;
  }
  if (!bins.time) return null;
  return { codec: 'MP3', container: 'MP3', mode: rates.size > 1 ? 'VBR' : 'CBR', sampleRate: sr, channels: mono ? 1 : 2,
    avgKbps: bins.avg(), kbps: bins.kbps(), binSec: BIN_SEC, durationSec: bins.time, exact: true };
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
  let codec = 'Audio', sr: number | undefined, ch: number | undefined;
  if (stsd) {
    const e = stsd.body + 8, four = ascii(b, e + 4, 4);
    codec = ({ mp4a: 'AAC', alac: 'ALAC', Opus: 'Opus', fLaC: 'FLAC', 'ac-3': 'AC-3', 'ec-3': 'E-AC-3' } as Record<string, string>)[four] ?? four;
    ch = dv.getUint16(e + 24); sr = dv.getUint32(e + 32) >>> 16;
  }
  const bins = new Bins(), sizes = new Set<number>();
  // Plain files: one size per sample (stsz) and runs of durations (stts).
  const stsz = child(dv, stbl, 'stsz'), stts = child(dv, stbl, 'stts');
  if (stsz && stts && dv.getUint32(stsz.body + 8) > 0) {
    const fixed = dv.getUint32(stsz.body + 4), count = dv.getUint32(stsz.body + 8);
    let s = 0, t = 0;
    const runs = dv.getUint32(stts.body + 4);
    for (let r = 0; r < runs; r++) {
      const n = dv.getUint32(stts.body + 8 + r * 8), delta = dv.getUint32(stts.body + 12 + r * 8) / timescale;
      for (let k = 0; k < n && s < count; k++, s++) {
        const size = fixed || dv.getUint32(stsz.body + 12 + s * 4);
        bins.add(t, delta, size); sizes.add(size); t += delta;
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
        if (tf & 0x1) o += 8; if (tf & 0x2) o += 4;
        if (tf & 0x8) { dDur = dv.getUint32(o); o += 4; }
        if (tf & 0x10) { dSize = dv.getUint32(o); o += 4; }
        const tfdt = child(dv, traf, 'tfdt');
        if (tfdt) t = (dv.getUint8(tfdt.body) === 1 ? Number(dv.getBigUint64(tfdt.body + 4)) : dv.getUint32(tfdt.body + 4)) / timescale;
        for (const trun of boxes(dv, traf.body, traf.end).filter(x => x.type === 'trun')) {
          const fl = dv.getUint32(trun.body) & 0xffffff, n = dv.getUint32(trun.body + 4);
          let p = trun.body + 8;
          if (fl & 0x1) p += 4; if (fl & 0x4) p += 4;
          for (let k = 0; k < n; k++) {
            let dur = dDur, size = dSize;
            if (fl & 0x100) { dur = dv.getUint32(p); p += 4; }
            if (fl & 0x200) { size = dv.getUint32(p); p += 4; }
            if (fl & 0x400) p += 4; if (fl & 0x800) p += 4;
            bins.add(t, dur / timescale, size); sizes.add(size); t += dur / timescale;
          }
        }
      }
    }
  }
  if (!bins.time) return null;
  const lossless = codec === 'ALAC' || codec === 'FLAC';
  return { codec, container: 'M4A', mode: lossless ? 'lossless' : sizes.size > 1 ? 'VBR' : 'CBR', sampleRate: sr, channels: ch,
    avgKbps: bins.avg(), kbps: bins.kbps(), binSec: BIN_SEC, durationSec: bins.time, exact: true };
}

// ---- OGG (Opus, Vorbis) --------------------------------------------------------------------
function parseOgg(b: Uint8Array): BitrateInfo | null {
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  let o = 0, codec = 'Vorbis', sr = 48000, ch: number | undefined, lastGran = 0, first = true;
  const bins = new Bins();
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
      lastGran = gran;
    }
    o += size;
  }
  if (!bins.time) return null;
  return { codec, container: 'OGG', mode: 'VBR', sampleRate: codec === 'Opus' ? undefined : sr, channels: ch,
    avgKbps: bins.avg(), kbps: bins.kbps(), binSec: BIN_SEC, durationSec: bins.time, exact: true };
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
