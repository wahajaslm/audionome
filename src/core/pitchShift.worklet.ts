/**
 * Audio-thread side of Transpose: runs one PitchShifter per channel on each 128-sample block.
 * `ratio` is the pitch ratio (1 = untouched, passed straight through with no delay).
 * Loaded by core/pitchNode.ts; never imported directly.
 */
import { PitchShifter } from './pitchShift.ts';

// The worklet scope's globals (not in the DOM types).
declare class AudioWorkletProcessor { readonly port: MessagePort }
declare function registerProcessor(name: string, ctor: unknown): void;

class PitchShiftProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [{ name: 'ratio', defaultValue: 1, minValue: 0.25, maxValue: 4, automationRate: 'k-rate' }];
  }

  private readonly shifters: PitchShifter[] = [];

  process(inputs: Float32Array[][], outputs: Float32Array[][], params: Record<string, Float32Array>): boolean {
    const input = inputs[0], output = outputs[0], ratio = params.ratio[0];
    for (let c = 0; c < output.length; c++) {
      const src = input[c] ?? input[0];
      if (!src) { output[c].fill(0); continue; }
      (this.shifters[c] ??= new PitchShifter()).process(src, output[c], ratio);
    }
    return true;
  }
}

registerProcessor('pitch-shift', PitchShiftProcessor);
