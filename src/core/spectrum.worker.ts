/**
 * Spectrum views off the main thread.
 * In: { id, kind, samples? } — samples once per song (kept here), then any kind on request.
 * Out: { id, view } or { id, error }. The mel view also carries the instant curves.
 * Example: switch Mel → CQT → the song is not decoded again, only the CQT is computed.
 */
import { computeSpectrum, computeView, type Spectrum, type SpectrumKind, type SpectrumView } from './spectrum.ts';

let samples: Float32Array | null = null;

self.onmessage = (e: MessageEvent<{ id: number; kind: SpectrumKind; samples?: Float32Array }>) => {
  const { id, kind } = e.data;
  try {
    if (e.data.samples) samples = e.data.samples;
    if (!samples) throw new Error('no audio decoded yet');
    const view: SpectrumView = kind === 'mel' ? computeSpectrum(samples) : computeView(samples, kind);
    const transfer: ArrayBuffer[] = [view.data.buffer as ArrayBuffer, view.freqs.buffer as ArrayBuffer];
    const curves = view as Partial<Spectrum>;
    if (curves.loud && curves.bright) transfer.push(curves.loud.buffer as ArrayBuffer, curves.bright.buffer as ArrayBuffer);
    (self as unknown as Worker).postMessage({ id, view }, transfer);
  } catch (err) {
    (self as unknown as Worker).postMessage({ id, error: String((err as Error)?.message || err) });
  }
};
