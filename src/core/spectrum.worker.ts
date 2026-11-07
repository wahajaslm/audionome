/**
 * Spectrum views off the main thread.
 * In: { id, kind, samples? } — samples once per song (kept here), then any kind on request.
 * Out: { id, view } or { id, error }. The mel view also carries the instant curves.
 * Example: switch Mel → CQT → the song is not decoded again, only the CQT is computed.
 * SPEED FIX - Linear comes out of the mel pass and waits here, so asking for it is instant.
 */
import { computeSpectrum, computeView, type Spectrum, type SpectrumKind, type SpectrumView } from './spectrum.ts';

let samples: Float32Array | null = null;
let linear: SpectrumView | null = null;

self.onmessage = (e: MessageEvent<{ id: number; kind: SpectrumKind; samples?: Float32Array }>) => {
  const { id, kind } = e.data;
  try {
    if (e.data.samples) { samples = e.data.samples; linear = null; }
    if (!samples) throw new Error('no audio decoded yet');
    let view: SpectrumView;
    if (kind === 'mel') {
      const m = computeSpectrum(samples);
      linear = m.linear ?? null;
      delete m.linear;
      view = m;
    } else if (kind === 'linear' && linear) {
      view = linear; linear = null; // sent once; its buffers move to the page
    } else view = computeView(samples, kind);
    const transfer: ArrayBuffer[] = [view.data.buffer as ArrayBuffer, view.freqs.buffer as ArrayBuffer];
    const curves = view as Partial<Spectrum>;
    if (curves.loud && curves.bright) transfer.push(curves.loud.buffer as ArrayBuffer, curves.bright.buffer as ArrayBuffer);
    (self as unknown as Worker).postMessage({ id, view }, transfer);
  } catch (err) {
    (self as unknown as Worker).postMessage({ id, error: String((err as Error)?.message || err) });
  }
};
