/**
 * Effects on what you hear (never on the song file): presets first, a few controls for more.
 *
 *   decks → bass → treble → lo-fi band → late-night compressor → pan (8D spin) ┬→ dry  ┐
 *                                                                             ├→ room ┼→ volume
 *                                                                             └→ echo ┘
 *
 * One chain after both decks, so a crossfade keeps the same sound. Off is a true bypass in
 * sound (all stages neutral). Echo repeats on the song's beat when the tempo is known.
 * Example: "Concert hall" → a large room around the band; "8D" → the sound circles your head.
 */

export type PresetName = 'off' | 'hall' | 'night' | 'lofi' | 'spin' | 'karaoke' | 'custom';

export interface EffectParams {
  preset: PresetName;
  /** −1 (left) … 1 (right). */
  pan: number;
  /** Room (reverb) amount, 0 … 1. */
  room: number;
  /** Echo amount, 0 … 1. */
  echo: number;
  /** Shelf gains in dB, −12 … 12. */
  bass: number;
  treble: number;
  /** 8D: the sound slowly circles left ↔ right. */
  spin: boolean;
  /** Lo-fi: a narrow, old-radio band. */
  lofi: boolean;
  /** Late night: loud parts pulled down, quiet parts up. */
  night: boolean;
  /** Karaoke: plays the song without its vocal stem (needs separated stems). */
  karaoke: boolean;
}

export const NEUTRAL: EffectParams = {
  preset: 'off', pan: 0, room: 0, echo: 0, bass: 0, treble: 0, spin: false, lofi: false, night: false, karaoke: false,
};

export const PRESETS: Record<Exclude<PresetName, 'custom'>, { label: string; params: EffectParams }> = {
  off: { label: 'Off', params: NEUTRAL },
  hall: { label: 'Concert hall', params: { ...NEUTRAL, preset: 'hall', room: 0.55, treble: -1 } },
  night: { label: 'Late night', params: { ...NEUTRAL, preset: 'night', night: true, bass: -3, treble: -2, room: 0.1 } },
  lofi: { label: 'Lo-fi', params: { ...NEUTRAL, preset: 'lofi', lofi: true, room: 0.15 } },
  spin: { label: '8D', params: { ...NEUTRAL, preset: 'spin', spin: true, room: 0.3 } },
  karaoke: { label: 'Karaoke', params: { ...NEUTRAL, preset: 'karaoke', karaoke: true, room: 0.15 } },
};

/** True when anything differs from Off (the Effects button is tinted). */
export function effectsActive(p: EffectParams): boolean {
  return p.pan !== 0 || p.room > 0 || p.echo > 0 || p.bass !== 0 || p.treble !== 0 || p.spin || p.lofi || p.night || p.karaoke;
}

/** Moving a control turns a preset into "custom" with that one value changed. */
export function withControl<K extends keyof EffectParams>(p: EffectParams, key: K, value: EffectParams[K]): EffectParams {
  const next = { ...p, [key]: value };
  return { ...next, preset: effectsActive(next) ? 'custom' : 'off' };
}

/** Clamps stored or typed values into range; unknown input becomes Off. */
export function cleanEffects(v: unknown): EffectParams {
  const x = (v && typeof v === 'object' ? v : {}) as Partial<EffectParams>;
  const num = (n: unknown, lo: number, hi: number) => (typeof n === 'number' && Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : 0);
  const preset = (['off', 'hall', 'night', 'lofi', 'spin', 'karaoke', 'custom'] as const).find(p => p === x.preset) ?? 'off';
  return {
    preset, pan: num(x.pan, -1, 1), room: num(x.room, 0, 1), echo: num(x.echo, 0, 1),
    bass: num(x.bass, -12, 12), treble: num(x.treble, -12, 12),
    spin: x.spin === true, lofi: x.lofi === true, night: x.night === true, karaoke: x.karaoke === true,
  };
}

/**
 * Echo delay: a dotted eighth at the song's tempo (it lands between beats, the classic
 * placement), else 0.33 s. Example: 120 BPM → 0.375 s.
 */
export function echoDelaySec(bpm: number | null | undefined): number {
  return bpm && bpm > 40 && bpm < 240 ? Math.min(1, (60 / bpm) * 0.75) : 0.33;
}

/** Stereo room impulse: decaying noise, a little different per ear so it sounds wide. */
function roomImpulse(ctx: BaseAudioContext, seconds = 2.6): AudioBuffer {
  const len = Math.round(ctx.sampleRate * seconds), buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    let seed = 1234567 + c * 7654321;
    for (let i = 0; i < len; i++) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      d[i] = ((seed / 0x7fffffff) * 2 - 1) * Math.pow(1 - i / len, 3.2);
    }
  }
  return buf;
}

/** The effect stages as Web Audio nodes. `input` takes both decks; `output` goes to the volume. */
export class EffectsChain {
  readonly input: GainNode;
  readonly output: GainNode;
  private readonly ctx: BaseAudioContext;
  private readonly bass: BiquadFilterNode;
  private readonly treble: BiquadFilterNode;
  private readonly lowpass: BiquadFilterNode;
  private readonly highpass: BiquadFilterNode;
  private readonly comp: DynamicsCompressorNode;
  private readonly panner: StereoPannerNode;
  private readonly lfoDepth: GainNode;
  private readonly dry: GainNode;
  private readonly roomWet: GainNode;
  private readonly echoWet: GainNode;
  private readonly delay: DelayNode;
  private readonly feedback: GainNode;

  constructor(ctx: BaseAudioContext) {
    this.ctx = ctx;
    this.input = ctx.createGain();
    this.output = ctx.createGain();
    this.bass = ctx.createBiquadFilter(); this.bass.type = 'lowshelf'; this.bass.frequency.value = 200;
    this.treble = ctx.createBiquadFilter(); this.treble.type = 'highshelf'; this.treble.frequency.value = 3200;
    this.lowpass = ctx.createBiquadFilter(); this.lowpass.type = 'lowpass'; this.lowpass.frequency.value = 20000; this.lowpass.Q.value = 0.5;
    this.highpass = ctx.createBiquadFilter(); this.highpass.type = 'highpass'; this.highpass.frequency.value = 10; this.highpass.Q.value = 0.5;
    this.comp = ctx.createDynamicsCompressor();
    this.panner = ctx.createStereoPanner();
    this.dry = ctx.createGain();
    this.roomWet = ctx.createGain(); this.roomWet.gain.value = 0;
    this.echoWet = ctx.createGain(); this.echoWet.gain.value = 0;
    this.delay = ctx.createDelay(2); this.delay.delayTime.value = 0.33;
    this.feedback = ctx.createGain(); this.feedback.gain.value = 0.35;
    const room = ctx.createConvolver(); room.buffer = roomImpulse(ctx);

    this.input.connect(this.bass).connect(this.treble).connect(this.highpass).connect(this.lowpass).connect(this.comp).connect(this.panner);
    this.panner.connect(this.dry).connect(this.output);
    this.panner.connect(room).connect(this.roomWet).connect(this.output);
    this.panner.connect(this.delay);
    this.delay.connect(this.feedback).connect(this.delay);
    this.delay.connect(this.echoWet).connect(this.output);

    // 8D: a slow oscillator moves the pan; its depth is 0 unless spin is on.
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.09;
    this.lfoDepth = ctx.createGain(); this.lfoDepth.gain.value = 0;
    lfo.connect(this.lfoDepth).connect(this.panner.pan);
    lfo.start();
    this.set(NEUTRAL, 0.33);
  }

  private to(param: AudioParam, value: number): void {
    const now = this.ctx.currentTime;
    param.cancelScheduledValues(now);
    param.setTargetAtTime(value, now, 0.06);
  }

  /** Applies all values, eased (~0.2 s) so changes never click. */
  set(p: EffectParams, delaySec: number): void {
    this.to(this.bass.gain, p.bass);
    this.to(this.treble.gain, p.treble);
    this.to(this.lowpass.frequency, p.lofi ? 3400 : 20000);
    this.to(this.highpass.frequency, p.lofi ? 260 : 10);
    // Late night: a gentle compressor; off = threshold 0 dB, ratio 1 (does nothing).
    this.to(this.comp.threshold, p.night ? -30 : 0);
    this.to(this.comp.ratio, p.night ? 4 : 1);
    this.to(this.comp.knee, p.night ? 18 : 0);
    this.to(this.panner.pan, p.spin ? 0 : p.pan);
    this.to(this.lfoDepth.gain, p.spin ? 0.85 : 0);
    // The dry signal steps back a little as the room grows, so the overall level stays even.
    this.to(this.dry.gain, 1 - 0.35 * p.room);
    this.to(this.roomWet.gain, p.room * 0.9);
    this.to(this.echoWet.gain, p.echo * 0.45);
    this.to(this.delay.delayTime, delaySec);
  }
}
