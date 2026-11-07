/**
 * "Download my version": renders a song through the same effects chain the player uses, faster
 * than real time (OfflineAudioContext), and returns a WAV file.
 * Tape speed is the source's playback rate (pitch moves, as when listening). The level is the
 * song's own; if effects push peaks past −1 dBFS the whole render is turned down to fit.
 * Example: a 4:31 song with "Slowed + reverb" → a 5:19 WAV (0.85×) with the room's tail.
 */
import { EffectsChain, type EffectParams } from './effects.ts';

/** 16-bit PCM WAV from rendered audio. */
export function wavFromBuffer(buf: { numberOfChannels: number; sampleRate: number; length: number; getChannelData(c: number): Float32Array }): Blob {
  const ch = buf.numberOfChannels, n = buf.length, bytes = 44 + n * ch * 2;
  const out = new DataView(new ArrayBuffer(bytes));
  const str = (o: number, s: string) => { for (let i = 0; i < s.length; i++) out.setUint8(o + i, s.charCodeAt(i)); };
  str(0, 'RIFF'); out.setUint32(4, bytes - 8, true); str(8, 'WAVE');
  str(12, 'fmt '); out.setUint32(16, 16, true); out.setUint16(20, 1, true); out.setUint16(22, ch, true);
  out.setUint32(24, buf.sampleRate, true); out.setUint32(28, buf.sampleRate * ch * 2, true);
  out.setUint16(32, ch * 2, true); out.setUint16(34, 16, true);
  str(36, 'data'); out.setUint32(40, n * ch * 2, true);
  const data = Array.from({ length: ch }, (_, c) => buf.getChannelData(c));
  let o = 44;
  for (let i = 0; i < n; i++) for (let c = 0; c < ch; c++) {
    const v = Math.max(-1, Math.min(1, data[c][i]));
    out.setInt16(o, v < 0 ? v * 0x8000 : v * 0x7fff, true); o += 2;
  }
  return new Blob([out.buffer], { type: 'audio/wav' });
}

/** Turns the render down when its peak is above −1 dBFS (EQ and room can add level). */
export function fitPeak(channels: Float32Array[], ceiling = 10 ** (-1 / 20)): number {
  let peak = 0;
  for (const d of channels) for (let i = 0; i < d.length; i++) { const a = Math.abs(d[i]); if (a > peak) peak = a; }
  if (peak <= ceiling) return 1;
  const g = ceiling / peak;
  for (const d of channels) for (let i = 0; i < d.length; i++) d[i] *= g;
  return g;
}

/** Renders `audio` (encoded file bytes) with `p`; `bpm` times echo and tremolo. */
export async function renderWithEffects(audio: ArrayBuffer, p: EffectParams, bpm: number | null): Promise<Blob> {
  const decoded = await new OfflineAudioContext(2, 1, 44100).decodeAudioData(audio);
  const tail = 0.6 + p.size * 3.4 + (p.echo > 0 ? 2 : 0); // the room and echo ring on after the song
  const sr = decoded.sampleRate, len = Math.ceil((decoded.length / p.tape) + tail * sr);
  const ctx = new OfflineAudioContext(2, len, sr);
  const src = ctx.createBufferSource();
  src.buffer = decoded;
  src.playbackRate.value = p.tape;
  const chain = new EffectsChain(ctx);
  chain.set(p, bpm);
  chain.setPlaying(true);
  src.connect(chain.input);
  chain.output.connect(ctx.destination);
  src.start();
  const out = await ctx.startRendering();
  fitPeak([out.getChannelData(0), out.getChannelData(1)]);
  return wavFromBuffer(out);
}
