/** Runs computeSpectrum off the main thread. In: { id, samples }. Out: { id, spectrum } or { id, error }. */
import { computeSpectrum } from './spectrum.ts';

self.onmessage = (e: MessageEvent<{ id: number; samples: Float32Array }>) => {
  const { id, samples } = e.data;
  try {
    const spectrum = computeSpectrum(samples);
    (self as unknown as Worker).postMessage({ id, spectrum }, [spectrum.data.buffer, spectrum.loud.buffer, spectrum.bright.buffer]);
  } catch (err) {
    (self as unknown as Worker).postMessage({ id, error: String((err as Error)?.message || err) });
  }
};
