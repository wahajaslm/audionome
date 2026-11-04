/**
 * Waveform amplitude data: 400 normalised peaks laid out on the media timeline.
 */

export const PEAK_COUNT = 400;

/**
 * Placeholder shape shown until the real peaks are decoded. Deterministic (seeded), so the
 * waveform does not flicker between renders. Same numbers as index.html's AMP.
 */
export function placeholderPeaks(): number[] {
  let s = 11;
  const a: number[] = [];
  for (let i = 0; i < PEAK_COUNT; i++) {
    s = (s * 9301 + 49297) % 233280;
    const r = s / 233280, t = i / (PEAK_COUNT - 1);
    const env = Math.pow(Math.sin(Math.PI * t), .45), sw = .55 + .45 * Math.sin(t * Math.PI * 6 + .8);
    const b = (t > .29 && t < .42) ? 1.25 : 1;
    a.push(Math.max(.03, Math.min(1, env * sw * b * (.35 + .65 * r))));
  }
  return a;
}

// SYNC FIX 9 - the 400 waveform bars are laid out on the media's own duration (from the
// <audio> element), the same scale the playhead and click-to-seek use.
// Before, bars were cut from the decoded buffer length, which can differ from the media
// duration by MP3/AAC encoder padding, and the last partial bucket was dropped.
// Example: media 466.02 s, decoded 466.07 s -> bar 399 now ends exactly at 466.02 s.
export function computePeaks(channel: ArrayLike<number>, sampleRate: number, mediaDurationSec: number,
  decodedDurationSec: number, count = PEAK_COUNT): number[] {
  const span = Math.min(channel.length, Math.round((mediaDurationSec || decodedDurationSec) * sampleRate));
  const peaks = Array.from({ length: count }, (_, i) => {
    const from = Math.floor(i * span / count), to = Math.max(from + 1, Math.floor((i + 1) * span / count));
    const stride = Math.max(1, Math.floor((to - from) / 50));
    let m = 0;
    for (let k = from; k < Math.min(channel.length, to); k += stride) m = Math.max(m, Math.abs(channel[k]));
    return m;
  });
  const mx = Math.max(.001, ...peaks);
  return peaks.map(v => .05 + .95 * Math.pow(v / mx, .75));
}

type AudioContextCtor = new () => BaseAudioContext;

export interface PeakDecoderOptions {
  /** Media duration from the audio engine at decode time (seconds). */
  mediaDuration(): number;
  /** Delay before decoding starts. index.html uses 1500 ms. */
  delayMs?: number;
  fetchImpl?: typeof fetch;
  audioContext?: AudioContextCtor;
}

/**
 * Decodes a track in the background and hands back its peaks, once per load.
 * `seq` is the track-load counter: a result for an older load is dropped.
 */
export class PeakDecoder {
  private ctx: BaseAudioContext | null = null;
  private currentSeq = 0;

  private readonly opts: PeakDecoderOptions;

  constructor(opts: PeakDecoderOptions) { this.opts = opts; }

  // DELAY FIX 4 - the waveform needs the whole file decoded (and, for streamed or server
  // tracks, downloaded a second time). That used to start the moment a track loaded, competing
  // with the first seconds of playback. Now it waits 1.5 s and then for an idle moment.
  // Example: pressing play on a 20 MB track no longer races a 20 MB decode for the CPU.
  schedule(source: Blob | string, seq: number, onPeaks: (peaks: number[]) => void): void {
    this.currentSeq = seq;
    const start = () => { if (seq === this.currentSeq) this.decode(source, seq).then(p => { if (p) onPeaks(p); }); };
    setTimeout(() => {
      if (typeof requestIdleCallback === 'function') requestIdleCallback(start, { timeout: 3000 }); else start();
    }, this.opts.delayMs ?? 1500);
  }

  /** Cancels any scheduled or running decode (a newer track was loaded). */
  invalidate(seq: number): void { this.currentSeq = seq; }

  async decode(source: Blob | string, seq: number): Promise<number[] | null> {
    try {
      let buf: ArrayBuffer;
      if (source instanceof Blob) {
        buf = await source.arrayBuffer();
      } else if (typeof source === 'string') {
        const res = await (this.opts.fetchImpl ?? fetch)(source);
        if (!res.ok) return null;
        buf = await res.arrayBuffer();
      } else {
        return null;
      }
      if (seq !== this.currentSeq) return null;
      if (!this.ctx) {
        const Ctor = this.opts.audioContext ?? (globalThis as unknown as { AudioContext: AudioContextCtor }).AudioContext;
        this.ctx = new Ctor();
      }
      const decoded = await this.ctx.decodeAudioData(buf.slice(0));
      if (seq !== this.currentSeq) return null;
      return computePeaks(decoded.getChannelData(0), decoded.sampleRate, this.opts.mediaDuration(), decoded.duration);
    } catch (e) {
      console.warn('Decode peaks status:', e);
      return null;
    }
  }
}
