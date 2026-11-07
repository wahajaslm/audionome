/**
 * Fine waveform envelope for the Nerds view: min and max of the mono mix per 1/rate s, so the
 * waveform can be drawn at frame zoom (2 s across the screen) and lined up with the decoder
 * lanes. Made once from the samples the spectrum already decodes.
 * Example: 4 min at 500 points/s → 120 000 min/max pairs (~1 MB).
 */
export interface Envelope { rate: number; min: Float32Array; max: Float32Array }

export function makeEnvelope(mono: Float32Array, sampleRate: number, rate = 500): Envelope {
  const step = sampleRate / rate, n = Math.ceil(mono.length / step);
  const min = new Float32Array(n), max = new Float32Array(n);
  for (let k = 0; k < n; k++) {
    let lo = 1, hi = -1;
    for (let i = Math.floor(k * step), e = Math.min(mono.length, Math.floor((k + 1) * step)); i < e; i++) {
      const v = mono[i];
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
    min[k] = lo > hi ? 0 : lo; max[k] = lo > hi ? 0 : hi;
  }
  return { rate, min, max };
}
