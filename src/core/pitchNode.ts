/**
 * Loads the Transpose worklet into an audio context and returns its node (stereo in, stereo out,
 * `ratio` param). Kept apart from effects.ts so the Node tests never meet the worklet import.
 * Example: await createPitchNode(ctx) → chain.attachPitch(node).
 */
import workletUrl from './pitchShift.worklet.ts?worker&url';

export async function createPitchNode(ctx: BaseAudioContext): Promise<AudioWorkletNode> {
  await ctx.audioWorklet.addModule(workletUrl);
  return new AudioWorkletNode(ctx, 'pitch-shift', {
    numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2], channelCount: 2, channelCountMode: 'explicit',
  });
}
