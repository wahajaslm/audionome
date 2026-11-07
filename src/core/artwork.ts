/**
 * Song artwork, framework-free.
 *
 * 1. Embedded art: the cover picture inside the audio file's own tags. Read on import (and once
 *    for older songs), never fetched from the web. Formats: MP3 (ID3v2 APIC / PIC), M4A / MP4
 *    (iTunes 'covr' atom), FLAC (PICTURE block).
 * 2. Generated art: when a file has no picture (every YouTube / link song, most WAVs), a cover is
 *    drawn from the song itself. Colour comes from its key (circle of fifths), its contour from its
 *    loudness over time, its rings from its tempo. Before analysis it falls back to a stable colour
 *    seeded by the song's id, so a row never flickers between renders.
 *
 * Example: 'Naina Moray.mp3' with an ID3 front cover → that picture, 400 px JPEG. 'youtube-abc'
 * analysed as 'A Minor', 92 BPM → teal-blue cover, 3 rings, contour following its energy.
 */

/** A picture found in the tags: raw bytes and their image type. */
export interface EmbeddedPicture { bytes: Uint8Array; mime: string }

const latin1 = (b: Uint8Array, a: number, n: number) => String.fromCharCode(...b.subarray(a, a + n));
const u32 = (b: Uint8Array, i: number) => ((b[i]! << 24) >>> 0) + (b[i + 1]! << 16) + (b[i + 2]! << 8) + b[i + 3]!;
const syncsafe = (b: Uint8Array, i: number) => (b[i]! << 21) | (b[i + 1]! << 14) | (b[i + 2]! << 7) | b[i + 3]!;

/** Image type from the first bytes (tags often say 'image/jpg', '-->' or nothing useful). */
export function sniffImage(b: Uint8Array): string | null {
  if (b[0] === 0xff && b[1] === 0xd8) return 'image/jpeg';
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png';
  if (latin1(b, 0, 4) === 'GIF8') return 'image/gif';
  if (latin1(b, 0, 4) === 'RIFF' && latin1(b, 8, 4) === 'WEBP') return 'image/webp';
  return null;
}

const picture = (bytes: Uint8Array): EmbeddedPicture | null => {
  const mime = sniffImage(bytes);
  return mime && bytes.length > 64 ? { bytes, mime } : null;
};

/** Index just past a text terminator: one 0 byte, or two aligned 0 bytes for UTF-16 (encodings 1, 2). */
function skipText(b: Uint8Array, i: number, end: number, utf16: boolean): number {
  if (!utf16) { while (i < end && b[i] !== 0) i++; return i + 1; }
  while (i + 1 < end && !(b[i] === 0 && b[i + 1] === 0)) i += 2;
  return i + 2;
}

/** ID3v2.2 – 2.4 at the start of an MP3. Prefers the front cover (picture type 3). */
function id3Picture(b: Uint8Array): EmbeddedPicture | null {
  const major = b[3]!, flags = b[5]!;
  const end = Math.min(b.length, 10 + syncsafe(b, 6));
  let i = 10;
  // Extended header: v2.3 size excludes its own 4 bytes, v2.4 size (syncsafe) includes them.
  if (flags & 0x40) i += major === 4 ? syncsafe(b, 10) : u32(b, 10) + 4;
  const v22 = major === 2, idLen = v22 ? 3 : 4, headLen = v22 ? 6 : 10;
  let first: EmbeddedPicture | null = null;
  while (i + headLen < end) {
    const id = latin1(b, i, idLen);
    if (!/^[A-Z0-9]+$/.test(id)) break;   // padding
    const size = v22 ? (b[i + 3]! << 16) | (b[i + 4]! << 8) | b[i + 5]! : major === 4 ? syncsafe(b, i + 4) : u32(b, i + 4);
    const a = i + headLen, z = Math.min(end, a + size);
    if (id === 'APIC' || id === 'PIC') {
      const utf16 = b[a] === 1 || b[a] === 2;
      let p = a + 1;
      p = v22 ? p + 3 : skipText(b, p, z, false);   // image format (3 chars) or MIME type
      const type = b[p++];
      p = skipText(b, p, z, utf16);   // description
      const pic = picture(b.subarray(p, z));
      if (pic && type === 3) return pic;
      first ??= pic;
    }
    i = z;
  }
  return first;
}

/** FLAC metadata blocks; block type 6 is PICTURE. */
function flacPicture(b: Uint8Array): EmbeddedPicture | null {
  let i = 4, first: EmbeddedPicture | null = null;
  while (i + 4 <= b.length) {
    const last = b[i]! & 0x80, type = b[i]! & 0x7f, len = (b[i + 1]! << 16) | (b[i + 2]! << 8) | b[i + 3]!;
    const a = i + 4;
    if (type === 6) {
      const picType = u32(b, a);
      let p = a + 4;
      p += 4 + u32(b, p);   // MIME
      p += 4 + u32(b, p);   // description
      p += 16;              // width, height, depth, colours
      const n = u32(b, p);
      const pic = picture(b.subarray(p + 4, p + 4 + n));
      if (pic && picType === 3) return pic;
      first ??= pic;
    }
    if (last) break;
    i = a + len;
  }
  return first;
}

/** Child atoms of an MP4 box between a and z: [name, bodyStart, end]. */
function* atoms(b: Uint8Array, a: number, z: number): Generator<[string, number, number]> {
  let i = a;
  while (i + 8 <= z) {
    let size = u32(b, i), head = 8;
    if (size === 1) { size = u32(b, i + 8) * 2 ** 32 + u32(b, i + 12); head = 16; }
    else if (size === 0) size = z - i;
    if (size < head) return;
    yield [latin1(b, i + 4, 4), i + head, Math.min(z, i + size)];
    i += size;
  }
}

/** moov › udta › meta › ilst › covr › data (iTunes cover). */
function mp4Picture(b: Uint8Array): EmbeddedPicture | null {
  const find = (a: number, z: number, name: string) => { for (const x of atoms(b, a, z)) if (x[0] === name) return x; return null; };
  const moov = find(0, b.length, 'moov'); if (!moov) return null;
  const udta = find(moov[1], moov[2], 'udta'); if (!udta) return null;
  const meta = find(udta[1], udta[2], 'meta'); if (!meta) return null;
  // 'meta' is a full box (4 bytes version + flags) in MP4, a plain box in older QuickTime files.
  const metaBody = u32(b, meta[1]) === 0 ? meta[1] + 4 : meta[1];
  const ilst = find(metaBody, meta[2], 'ilst'); if (!ilst) return null;
  const covr = find(ilst[1], ilst[2], 'covr'); if (!covr) return null;
  for (const [name, a, z] of atoms(b, covr[1], covr[2])) {
    if (name !== 'data') continue;
    const pic = picture(b.subarray(a + 8, z));   // 4 bytes type + 4 bytes locale
    if (pic) return pic;
  }
  return null;
}

/** The cover picture inside an audio file's tags, or null when it has none. */
export function extractEmbeddedPicture(buf: ArrayBuffer | Uint8Array): EmbeddedPicture | null {
  const b = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  if (b.length < 12) return null;
  try {
    if (latin1(b, 0, 3) === 'ID3') return id3Picture(b);
    if (latin1(b, 0, 4) === 'fLaC') return flacPicture(b);
    if (latin1(b, 4, 4) === 'ftyp') return mp4Picture(b);
  } catch { /* malformed tags: no picture */ }
  return null;
}

/**
 * Browser only: shrinks a picture to a size × size JPEG data URL (centre crop) and measures its
 * average colour, which Now playing uses for the soft wash behind the header.
 * Example: a 3000 px PNG cover (4 MB) → ~40 KB JPEG + 'rgb(112, 86, 70)'.
 */
export async function toArtwork(pic: EmbeddedPicture, size = 400): Promise<{ artwork: string; artworkColor: string } | null> {
  try {
    const bmp = await createImageBitmap(new Blob([pic.bytes as BlobPart], { type: pic.mime }));
    const s = Math.min(bmp.width, bmp.height);
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(bmp, (bmp.width - s) / 2, (bmp.height - s) / 2, s, s, 0, 0, size, size);
    bmp.close();
    const px = ctx.getImageData(0, 0, size, size).data;
    let r = 0, g = 0, b = 0, n = 0;
    for (let i = 0; i < px.length; i += 4 * 37) { r += px[i]!; g += px[i + 1]!; b += px[i + 2]!; n++; }
    return { artwork: canvas.toDataURL('image/jpeg', 0.85), artworkColor: `rgb(${Math.round(r / n)}, ${Math.round(g / n)}, ${Math.round(b / n)})` };
  } catch { return null; }
}

/* ---------- Generated art ---------- */

/** What the generated cover is drawn from. Every field but seed is optional. */
export interface ArtInput {
  /** Stable per song: its SHA-256 or id. */
  seed: string;
  /** 'A Minor', 'F# Major', 'Bbm' … */
  key?: string;
  tempoBpm?: number;
  /** Loudness over the song, any length, any scale (analysis windows or waveform peaks). */
  energy?: number[];
  /** Mean spectral centroid in Hz: brighter songs get lighter colours. */
  brightnessHz?: number;
}

/** Everything the SVG needs, already in drawing units (viewBox 0 0 100 100). */
export interface ArtRecipe {
  hue: number; hue2: number; sat: number; light: number;
  /** Closed contour around the centre (the song's loudness, start at 12 o'clock, clockwise). */
  contour: string;
  /** Radii of the thin tempo rings. */
  rings: number[];
  /** The small 'sun': where the loudest moment sits on the contour. */
  sun: { x: number; y: number };
  /** CSS colour for washes and borders. */
  wash: string;
}

const FIFTHS = ['C', 'G', 'D', 'A', 'E', 'B', 'F#', 'C#', 'G#', 'D#', 'A#', 'F'];
const FLATS: Record<string, string> = { Db: 'C#', Eb: 'D#', Gb: 'F#', Ab: 'G#', Bb: 'A#', Cb: 'B', Fb: 'E' };

/** Tonic and mode from a key name. Example: 'Bb minor' → { fifths: 10, minor: true }. */
export function parseKey(key: string | undefined): { fifths: number; minor: boolean } | null {
  const m = key?.trim().match(/^([A-Ga-g])([#b♯♭]?)\s*(maj(?:or)?|min(?:or)?|m)?/i);
  if (!m) return null;
  let note = m[1]!.toUpperCase() + (m[2] === '♯' ? '#' : m[2] === '♭' ? 'b' : m[2]);
  note = FLATS[note] ?? note;
  const fifths = FIFTHS.indexOf(note);
  if (fifths < 0) return null;
  const mode = (m[3] || '').toLowerCase();
  return { fifths, minor: mode === 'm' || mode.startsWith('min') };
}

/** 32-bit FNV-1a, then a small PRNG from it: same seed, same cover. */
function rng(seed: string): () => number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) { h ^= seed.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return () => { h ^= h << 13; h ^= h >>> 17; h ^= h << 5; return ((h >>> 0) % 100000) / 100000; };
}

/** Resamples to n points and scales to 0..1 (robust: 95th percentile is 1). */
function envelope(values: number[] | undefined, n: number, rand: () => number): number[] {
  if (!values || values.length < 4) {
    // No sound data yet: a gentle seeded shape (two slow waves), never a flat circle.
    const p1 = rand() * 6.28, p2 = rand() * 6.28, k = 2 + Math.floor(rand() * 3);
    return Array.from({ length: n }, (_, i) => 0.55 + 0.25 * Math.sin(i / n * 6.28 * k + p1) + 0.15 * Math.sin(i / n * 6.28 * (k + 3) + p2));
  }
  const out = Array.from({ length: n }, (_, i) => {
    const a = Math.floor(i / n * values.length), z = Math.max(a + 1, Math.floor((i + 1) / n * values.length));
    let m = 0;
    for (let j = a; j < z; j++) m = Math.max(m, Math.abs(values[j]!));
    return m;
  });
  const sorted = [...out].sort((x, y) => x - y);
  const lo = sorted[Math.floor(n * 0.05)]!, hi = sorted[Math.floor(n * 0.95)]! || 1;
  // Three smoothing passes, so the contour reads as a shape, not as noise or steps
  // (a 32 s song has only ~16 analysis windows for 72 points).
  let norm = out.map(v => Math.max(0, Math.min(1, (v - lo) / Math.max(1e-9, hi - lo))));
  for (let pass = 0; pass < 3; pass++) norm = norm.map((_, i) => (norm[(i - 1 + n) % n]! + 2 * norm[i]! + norm[(i + 1) % n]!) / 4);
  return norm;
}

/** The generated cover's recipe. Pure: same input, same picture. */
export function artRecipe(input: ArtInput): ArtRecipe {
  const rand = rng(input.seed);
  const k = parseKey(input.key);
  const hue = k ? k.fifths * 30 + 8 : Math.floor(rand() * 360);
  if (!k) rand(); // keep the PRNG stream the same length whether or not a key is known
  const minor = k ? k.minor : rand() < 0.5;
  // Minor: cooler partner hue and softer colour; major: warmer partner and a little brighter.
  const hue2 = (hue + (minor ? -38 : 34) + 360) % 360;
  const bright = input.brightnessHz ? Math.max(0, Math.min(1, (input.brightnessHz - 900) / 2600)) : 0.4;
  const sat = minor ? 30 : 42;
  const light = 34 + Math.round(bright * 14);

  const N = 72, env = envelope(input.energy, N, rand);
  let loud = 0;
  const pts = env.map((e, i) => {
    if (e > env[loud]!) loud = i;
    const ang = -Math.PI / 2 + (i / N) * Math.PI * 2, r = 16 + e * 18;
    return [50 + r * Math.cos(ang), 50 + r * Math.sin(ang)] as const;
  });
  // Smooth closed curve through the points (Catmull-Rom → cubic Bézier).
  let contour = `M${pts[0]![0].toFixed(2)},${pts[0]![1].toFixed(2)}`;
  for (let i = 0; i < N; i++) {
    const p0 = pts[(i - 1 + N) % N]!, p1 = pts[i]!, p2 = pts[(i + 1) % N]!, p3 = pts[(i + 2) % N]!;
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6], c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    contour += `C${c1[0]!.toFixed(2)},${c1[1]!.toFixed(2)} ${c2[0]!.toFixed(2)},${c2[1]!.toFixed(2)} ${p2[0].toFixed(2)},${p2[1].toFixed(2)}`;
  }

  // Tempo rings: 2 for slow songs (< 80 BPM), up to 5 for fast ones (> 140 BPM).
  const bpm = input.tempoBpm && input.tempoBpm > 30 ? input.tempoBpm : 70 + rand() * 60;
  const nRings = Math.max(2, Math.min(5, Math.round((bpm - 50) / 22)));
  const rings = Array.from({ length: nRings }, (_, i) => 38 + i * (9 / nRings) + 2);

  const sunAng = -Math.PI / 2 + (loud / N) * Math.PI * 2, sunR = 16 + env[loud]! * 18 + 7;
  return {
    hue, hue2, sat, light, contour, rings,
    sun: { x: 50 + sunR * Math.cos(sunAng), y: 50 + sunR * Math.sin(sunAng) },
    wash: `hsl(${hue} ${sat + 10}% ${light}%)`,
  };
}

/**
 * The analysis fields the cover uses, from a song's analysis windows. Most-voted key, median tempo,
 * energy per window in time order, mean brightness.
 */
export function artFromAnalysis(segments: { startSec: number; descriptors: { energy: number; brightness_hz: number; key?: string; tempoBpm?: number } }[]): Omit<ArtInput, 'seed'> {
  if (!segments.length) return {};
  const ordered = [...segments].sort((a, b) => a.startSec - b.startSec);
  const votes = new Map<string, number>();
  const tempos: number[] = [];
  let bright = 0;
  for (const s of ordered) {
    const d = s.descriptors;
    if (d.key) votes.set(d.key, (votes.get(d.key) ?? 0) + 1);
    if (d.tempoBpm) tempos.push(d.tempoBpm);
    bright += d.brightness_hz || 0;
  }
  tempos.sort((a, b) => a - b);
  return {
    key: [...votes].sort((a, b) => b[1] - a[1])[0]?.[0],
    tempoBpm: tempos.length ? tempos[Math.floor(tempos.length / 2)] : undefined,
    energy: ordered.length >= 4 ? ordered.map(s => s.descriptors.energy) : undefined,
    brightnessHz: bright / ordered.length || undefined,
  };
}
