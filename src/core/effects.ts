/**
 * Effects on what you hear (never on the song file): presets first, then four groups.
 *
 *   decks → EQ (bass · mid · treble) → DJ filter → warmth → late-night compressor → phaser
 *         → tremolo → width → pan / 8D ┬→ dry ───────────┐
 *                                      ├→ room ──────────┤
 *                                      ├→ echo ──────────┼→ volume
 *                                      ├→ chorus ────────┤
 *                                      └→ flanger ───────┘   + vinyl crackle (only while playing)
 *
 * One chain after both decks, so a crossfade keeps the same sound. Off = every stage neutral.
 * Echo and tremolo follow the song's beat when its tempo is known. Tape speed and stems are
 * not nodes: the engine changes the playback rate (pitch moves with it), the store switches
 * the stem source.
 * Example: "Slowed + reverb" → tape 0.85× and a large room; "Radio" → a narrow mono band.
 */

export type StemMode = 'mix' | 'no_vocals' | 'vocals' | 'no_drums';
export type PresetName = 'off' | 'hall' | 'stadium' | 'night' | 'lofi' | 'slowed' | 'nightcore' | 'underwater'
  | 'radio' | 'spin' | 'dream' | 'karaoke' | 'acappella' | 'custom';
export type EffectGroup = 'space' | 'tone' | 'motion' | 'tape';

export interface EffectParams {
  preset: PresetName;
  // Space
  /** −1 (left) … 1 (right). */
  pan: number;
  /** Stereo width: 0 mono · 1 as recorded · 2 extra wide. */
  width: number;
  /** Room (reverb) amount 0 … 1, and its size 0 (small room) … 1 (cathedral). */
  room: number;
  size: number;
  /** Echo amount 0 … 1 (repeats on the beat). */
  echo: number;
  /** 8D: the sound slowly circles your head. */
  spin: boolean;
  // Tone
  /** EQ in dB, −12 … 12. */
  bass: number;
  mid: number;
  treble: number;
  /** DJ filter −1 … 1: below 0 muffles (low-pass), above 0 thins (high-pass). */
  filter: number;
  /** Warmth: tape-like saturation, 0 … 1. */
  warmth: number;
  /** Late night: loud parts pulled down, quiet parts up. */
  night: boolean;
  // Motion (0 … 1 each)
  chorus: number;
  flanger: number;
  phaser: number;
  /** Volume pulse on the beat. */
  tremolo: number;
  // Tape & stems
  /** Tape speed 0.75 … 1.25: tempo and pitch move together ("slowed", "sped up"). */
  tape: number;
  /** Vinyl crackle 0 … 1. */
  crackle: number;
  /** Which stems play (needs separated stems). */
  stem: StemMode;
}

export const NEUTRAL: EffectParams = {
  preset: 'off', pan: 0, width: 1, room: 0, size: 0.5, echo: 0, spin: false,
  bass: 0, mid: 0, treble: 0, filter: 0, warmth: 0, night: false,
  chorus: 0, flanger: 0, phaser: 0, tremolo: 0, tape: 1, crackle: 0, stem: 'mix',
};

const P = (preset: PresetName, x: Partial<EffectParams>): EffectParams => ({ ...NEUTRAL, ...x, preset });
export const PRESETS: Record<Exclude<PresetName, 'custom'>, { label: string; params: EffectParams }> = {
  off: { label: 'Off', params: NEUTRAL },
  hall: { label: 'Concert hall', params: P('hall', { room: 0.5, size: 0.7, treble: -1 }) },
  stadium: { label: 'Stadium', params: P('stadium', { room: 0.45, size: 1, width: 1.5, echo: 0.15 }) },
  night: { label: 'Late night', params: P('night', { night: true, bass: -3, treble: -2, room: 0.1 }) },
  lofi: { label: 'Lo-fi', params: P('lofi', { filter: -0.35, warmth: 0.45, crackle: 0.5, width: 0.7, room: 0.15, size: 0.3 }) },
  slowed: { label: 'Slowed + reverb', params: P('slowed', { tape: 0.85, room: 0.5, size: 0.8, bass: 2 }) },
  nightcore: { label: 'Sped up', params: P('nightcore', { tape: 1.2, treble: 1 }) },
  underwater: { label: 'Underwater', params: P('underwater', { filter: -0.8, room: 0.35, size: 0.6, chorus: 0.4 }) },
  radio: { label: 'Old radio', params: P('radio', { filter: 0.45, mid: 4, warmth: 0.6, width: 0, crackle: 0.25 }) },
  spin: { label: '8D', params: P('spin', { spin: true, room: 0.3, size: 0.6 }) },
  dream: { label: 'Dreamy', params: P('dream', { chorus: 0.5, room: 0.45, size: 0.8, echo: 0.2, treble: -2 }) },
  karaoke: { label: 'Karaoke', params: P('karaoke', { stem: 'no_vocals', room: 0.15 }) },
  acappella: { label: 'A cappella', params: P('acappella', { stem: 'vocals', room: 0.2, size: 0.6 }) },
};

/** Which controls each group shows, with their range and how a value reads. */
export interface Control { key: NumKey; label: string; min: number; max: number; step: number; show: (v: number) => string }
export type NumKey = { [K in keyof EffectParams]: EffectParams[K] extends number ? K : never }[keyof EffectParams];
const pct = (v: number) => Math.round(v * 100) + '%';
const db = (v: number) => (v > 0 ? '+' : '') + v + ' dB';
export const GROUPS: { id: EffectGroup; label: string; controls: Control[]; toggles: ('spin' | 'night')[] }[] = [
  { id: 'space', label: 'Space', toggles: ['spin'], controls: [
    { key: 'pan', label: 'Pan', min: -1, max: 1, step: 0.05, show: v => (v === 0 ? 'centre' : (v < 0 ? 'L ' : 'R ') + Math.round(Math.abs(v) * 100)) },
    { key: 'width', label: 'Width', min: 0, max: 2, step: 0.05, show: v => (v === 0 ? 'mono' : v === 1 ? 'as recorded' : pct(v)) },
    { key: 'room', label: 'Room', min: 0, max: 1, step: 0.05, show: pct },
    { key: 'size', label: 'Size', min: 0, max: 1, step: 0.05, show: v => (v < 0.3 ? 'small' : v < 0.7 ? 'hall' : 'cathedral') },
    { key: 'echo', label: 'Echo', min: 0, max: 1, step: 0.05, show: pct },
  ] },
  { id: 'tone', label: 'Tone', toggles: ['night'], controls: [
    { key: 'bass', label: 'Bass', min: -12, max: 12, step: 1, show: db },
    { key: 'mid', label: 'Mid', min: -12, max: 12, step: 1, show: db },
    { key: 'treble', label: 'Treble', min: -12, max: 12, step: 1, show: db },
    { key: 'filter', label: 'Filter', min: -1, max: 1, step: 0.05, show: v => (v === 0 ? 'open' : v < 0 ? 'muffle ' + pct(-v) : 'thin ' + pct(v)) },
    { key: 'warmth', label: 'Warmth', min: 0, max: 1, step: 0.05, show: pct },
  ] },
  { id: 'motion', label: 'Motion', toggles: [], controls: [
    { key: 'chorus', label: 'Chorus', min: 0, max: 1, step: 0.05, show: pct },
    { key: 'flanger', label: 'Flanger', min: 0, max: 1, step: 0.05, show: pct },
    { key: 'phaser', label: 'Phaser', min: 0, max: 1, step: 0.05, show: pct },
    { key: 'tremolo', label: 'Tremolo', min: 0, max: 1, step: 0.05, show: pct },
  ] },
  { id: 'tape', label: 'Tape & stems', toggles: [], controls: [
    { key: 'tape', label: 'Tape speed', min: 0.75, max: 1.25, step: 0.01, show: v => v.toFixed(2) + '×' },
    { key: 'crackle', label: 'Vinyl', min: 0, max: 1, step: 0.05, show: pct },
  ] },
];
export const STEM_MODES: { id: StemMode; label: string }[] = [
  { id: 'mix', label: 'Full mix' }, { id: 'no_vocals', label: 'Karaoke' }, { id: 'vocals', label: 'A cappella' }, { id: 'no_drums', label: 'No drums' },
];
export const TOGGLE_LABELS: Record<'spin' | 'night', string> = { spin: '8D spin', night: 'Late night' };

const KEYS = Object.keys(NEUTRAL).filter(k => k !== 'preset') as (keyof EffectParams)[];

/** True when anything differs from Off (the Effects button is tinted). */
export function effectsActive(p: EffectParams): boolean {
  return KEYS.some(k => p[k] !== NEUTRAL[k]);
}

/** True when a group has a control away from neutral (its tab shows a dot). */
export function groupActive(p: EffectParams, g: EffectGroup): boolean {
  const def = GROUPS.find(x => x.id === g)!;
  return def.controls.some(c => p[c.key] !== NEUTRAL[c.key]) || def.toggles.some(t => p[t] !== NEUTRAL[t])
    || (g === 'tape' && p.stem !== 'mix');
}

/** Moving a control turns a preset into "custom" with that one value changed. */
export function withControl<K extends keyof EffectParams>(p: EffectParams, key: K, value: EffectParams[K]): EffectParams {
  const next = { ...p, [key]: value };
  return { ...next, preset: effectsActive(next) ? 'custom' : 'off' };
}

/** Clamps stored or typed values into range; unknown input becomes Off. Older saves still load. */
export function cleanEffects(v: unknown): EffectParams {
  const x = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
  const num = (k: NumKey, lo: number, hi: number) => {
    const n = x[k];
    return typeof n === 'number' && Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : NEUTRAL[k];
  };
  const presets = [...Object.keys(PRESETS), 'custom'] as PresetName[];
  const stem = (['mix', 'no_vocals', 'vocals', 'no_drums'] as const).find(s => s === x.stem) ?? (x.karaoke === true ? 'no_vocals' : 'mix');
  return {
    preset: presets.find(p => p === x.preset) ?? 'off',
    pan: num('pan', -1, 1), width: num('width', 0, 2), room: num('room', 0, 1), size: num('size', 0, 1), echo: num('echo', 0, 1),
    spin: x.spin === true,
    bass: num('bass', -12, 12), mid: num('mid', -12, 12), treble: num('treble', -12, 12), filter: num('filter', -1, 1),
    warmth: num('warmth', 0, 1), night: x.night === true,
    chorus: num('chorus', 0, 1), flanger: num('flanger', 0, 1), phaser: num('phaser', 0, 1), tremolo: num('tremolo', 0, 1),
    tape: num('tape', 0.75, 1.25), crackle: num('crackle', 0, 1), stem,
  };
}

/** One beat in seconds at the song's tempo, else 0.5 s (120 BPM). */
export const beatSec = (bpm: number | null | undefined) => (bpm && bpm > 40 && bpm < 240 ? 60 / bpm : 0.5);

/**
 * Echo delay: a dotted eighth at the song's tempo (it lands between beats, the classic
 * placement). Example: 120 BPM → 0.375 s.
 */
export function echoDelaySec(bpm: number | null | undefined): number {
  return Math.min(1, beatSec(bpm) * 0.75);
}

/**
 * DJ filter cutoffs (Hz). Below 0: low-pass from 20 kHz down to ~300 Hz; above 0: high-pass from
 * 10 Hz up to ~2.5 kHz. Exponential, so the knob feels even. Example: −0.5 → low-pass ≈ 2.4 kHz.
 */
export function filterCutoffs(f: number): { lowpass: number; highpass: number } {
  return {
    lowpass: f < 0 ? 20000 * Math.pow(300 / 20000, -f) : 20000,
    highpass: f > 0 ? 10 * Math.pow(2500 / 10, f) : 10,
  };
}

/** Width as an L/R mix: out L = a·L + b·R, out R = b·L + a·R (mid/side with side × width). */
export function widthGains(w: number): { a: number; b: number } {
  return { a: (1 + w) / 2, b: (1 - w) / 2 };
}

/** Soft-clip curve for warmth; null = straight through. */
function warmthCurve(drive: number): Float32Array | null {
  if (drive <= 0.001) return null;
  const k = 1 + drive * 9, n = 2048, c = new Float32Array(n), norm = Math.tanh(k);
  for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * 2 - 1; c[i] = Math.tanh(k * x) / norm; }
  return c;
}

/** Stereo room impulse: decaying noise, a little different per ear so it sounds wide. */
function roomImpulse(ctx: BaseAudioContext, size: number): AudioBuffer {
  const seconds = 0.6 + size * 3.4, len = Math.round(ctx.sampleRate * seconds), buf = ctx.createBuffer(2, len, ctx.sampleRate);
  const curve = 4.5 - size * 2;
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    let seed = 1234567 + c * 7654321;
    for (let i = 0; i < len; i++) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      d[i] = ((seed / 0x7fffffff) * 2 - 1) * Math.pow(1 - i / len, curve);
    }
  }
  return buf;
}

/** 4 s of record surface: faint hiss and sparse clicks, looped. */
function crackleBuffer(ctx: BaseAudioContext): AudioBuffer {
  const len = ctx.sampleRate * 4, buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    let seed = 42 + c * 99;
    const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
    for (let i = 0; i < len; i++) {
      d[i] = (rnd() * 2 - 1) * 0.015;
      if (rnd() < 0.0004) { const amp = 0.2 + rnd() * 0.6; for (let j = 0; j < 30 && i + j < len; j++) d[i + j] += amp * (rnd() * 2 - 1) * Math.exp(-j / 6); }
    }
  }
  return buf;
}

/** The effect stages as Web Audio nodes. `input` takes both decks; `output` goes to the volume. */
export class EffectsChain {
  readonly input: GainNode;
  readonly output: GainNode;
  private readonly ctx: BaseAudioContext;
  private readonly n: Record<string, AudioNode & { [k: string]: unknown }> = {};
  private roomSize = -1;
  private playingNow = false;
  private last: EffectParams = NEUTRAL;

  constructor(ctx: BaseAudioContext) {
    this.ctx = ctx;
    const gain = (v = 1) => { const g = ctx.createGain(); g.gain.value = v; return g; };
    const biquad = (type: BiquadFilterType, f: number, q?: number) => { const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; if (q) b.Q.value = q; return b; };
    const lfo = (hz: number) => { const o = ctx.createOscillator(); o.frequency.value = hz; o.start(); return o; };

    // Stereo from here on, so width works on mono files too.
    this.input = gain(); this.input.channelCount = 2; this.input.channelCountMode = 'explicit'; this.input.channelInterpretation = 'speakers';
    this.output = gain();

    const bass = biquad('lowshelf', 200), mid = biquad('peaking', 1000, 0.8), treble = biquad('highshelf', 3200);
    const lp = biquad('lowpass', 20000, 0.7), hp = biquad('highpass', 10, 0.7);
    const shaper = ctx.createWaveShaper(); shaper.oversample = '2x';
    const comp = ctx.createDynamicsCompressor();
    this.input.connect(bass).connect(mid).connect(treble).connect(hp).connect(lp).connect(shaper).connect(comp);

    // Phaser: dry + four all-pass stages swept by a slow LFO.
    const phIn = gain(), phOut = gain(), phWet = gain(0);
    comp.connect(phIn); phIn.connect(phOut);
    let prev: AudioNode = phIn;
    const phLfo = lfo(0.3), phDepth = gain(0);
    phLfo.connect(phDepth);
    for (let i = 0; i < 4; i++) { const ap = biquad('allpass', 600 + i * 500, 0.7); phDepth.connect(ap.frequency); prev.connect(ap); prev = ap; }
    prev.connect(phWet).connect(phOut);

    // Tremolo: the level pulses on the beat.
    const trem = gain(1), tremLfo = lfo(4), tremDepth = gain(0);
    tremLfo.connect(tremDepth).connect(trem.gain);
    phOut.connect(trem);

    // Width: mid/side as an L/R matrix.
    const split = ctx.createChannelSplitter(2), merge = ctx.createChannelMerger(2);
    const ll = gain(1), rl = gain(0), lr = gain(0), rr = gain(1);
    trem.connect(split);
    split.connect(ll, 0); split.connect(rl, 1); split.connect(lr, 0); split.connect(rr, 1);
    ll.connect(merge, 0, 0); rl.connect(merge, 0, 0); lr.connect(merge, 0, 1); rr.connect(merge, 0, 1);

    // Pan, with the 8D oscillator on top.
    const pan = ctx.createStereoPanner(), spinLfo = lfo(0.09), spinDepth = gain(0);
    spinLfo.connect(spinDepth).connect(pan.pan);
    merge.connect(pan);

    // Sends: dry, room, echo, chorus, flanger.
    const dry = gain(1), roomWet = gain(0), echoWet = gain(0), chorusWet = gain(0), flangerWet = gain(0);
    const room = ctx.createConvolver();
    const delay = ctx.createDelay(2), fb = gain(0.35);
    const chDelay = ctx.createDelay(0.1); chDelay.delayTime.value = 0.022;
    const chLfo = lfo(0.7), chDepth = gain(0.004); chLfo.connect(chDepth).connect(chDelay.delayTime);
    const flDelay = ctx.createDelay(0.05); flDelay.delayTime.value = 0.004;
    const flLfo = lfo(0.2), flDepth = gain(0.0025), flFb = gain(0.6); flLfo.connect(flDepth).connect(flDelay.delayTime);
    pan.connect(dry).connect(this.output);
    pan.connect(room).connect(roomWet).connect(this.output);
    pan.connect(delay); delay.connect(fb).connect(delay); delay.connect(echoWet).connect(this.output);
    pan.connect(chDelay).connect(chorusWet).connect(this.output);
    pan.connect(flDelay); flDelay.connect(flFb).connect(flDelay); flDelay.connect(flangerWet).connect(this.output);

    // Vinyl: a looped surface noise, heard only while the song plays.
    const crackle = ctx.createBufferSource(); crackle.buffer = crackleBuffer(ctx); crackle.loop = true;
    const crackleGain = gain(0); crackle.connect(crackleGain).connect(this.output); crackle.start();

    Object.assign(this.n, { bass, mid, treble, lp, hp, shaper, comp, phDepth, phWet, trem, tremLfo, tremDepth, ll, rl, lr, rr,
      pan, spinDepth, dry, room, roomWet, delay, echoWet, chorusWet, flangerWet, crackleGain });
    this.set(NEUTRAL, null);
  }

  private to(param: AudioParam, value: number): void {
    const now = this.ctx.currentTime;
    param.cancelScheduledValues(now);
    param.setTargetAtTime(value, now, 0.06);
  }
  private p(name: string, param: string): AudioParam { return (this.n[name] as unknown as Record<string, AudioParam>)[param]; }

  /** The song plays or pauses: vinyl crackle follows it (no crackle over silence). */
  setPlaying(on: boolean): void {
    this.playingNow = on;
    this.to(this.p('crackleGain', 'gain'), on ? this.last.crackle * 0.5 : 0);
  }

  /** Applies all values, eased (~0.2 s) so changes never click. `bpm` times echo and tremolo. */
  set(p: EffectParams, bpm: number | null): void {
    this.last = p;
    const beat = beatSec(bpm);
    this.to(this.p('bass', 'gain'), p.bass);
    this.to(this.p('mid', 'gain'), p.mid);
    this.to(this.p('treble', 'gain'), p.treble);
    const cut = filterCutoffs(p.filter);
    this.to(this.p('lp', 'frequency'), cut.lowpass);
    this.to(this.p('hp', 'frequency'), cut.highpass);
    (this.n.shaper as unknown as WaveShaperNode).curve = warmthCurve(p.warmth) as Float32Array<ArrayBuffer> | null;
    // Late night: a gentle compressor; off = threshold 0 dB, ratio 1 (does nothing).
    this.to(this.p('comp', 'threshold'), p.night ? -30 : 0);
    this.to(this.p('comp', 'ratio'), p.night ? 4 : 1);
    this.to(this.p('comp', 'knee'), p.night ? 18 : 0);
    this.to(this.p('phDepth', 'gain'), p.phaser * 900);
    this.to(this.p('phWet', 'gain'), p.phaser * 0.8);
    // Tremolo: two pulses per beat; at full depth the level dips to 20 % on each pulse.
    this.to(this.p('tremLfo', 'frequency'), 2 / beat);
    this.to(this.p('trem', 'gain'), 1 - p.tremolo * 0.4);
    this.to(this.p('tremDepth', 'gain'), p.tremolo * 0.4);
    const w = widthGains(p.width);
    this.to(this.p('ll', 'gain'), w.a); this.to(this.p('rr', 'gain'), w.a);
    this.to(this.p('rl', 'gain'), w.b); this.to(this.p('lr', 'gain'), w.b);
    this.to(this.p('pan', 'pan'), p.spin ? 0 : p.pan);
    this.to(this.p('spinDepth', 'gain'), p.spin ? 0.85 : 0);
    // Room size changes the impulse itself; rebuilt only when it moves by a tenth.
    const size = Math.round(p.size * 10) / 10;
    if (size !== this.roomSize) { this.roomSize = size; (this.n.room as unknown as ConvolverNode).buffer = roomImpulse(this.ctx, size); }
    // The dry signal steps back a little as the room grows, so the overall level stays even.
    this.to(this.p('dry', 'gain'), 1 - 0.35 * p.room);
    this.to(this.p('roomWet', 'gain'), p.room * 0.9);
    this.to(this.p('echoWet', 'gain'), p.echo * 0.45);
    this.to(this.p('delay', 'delayTime'), echoDelaySec(bpm));
    this.to(this.p('chorusWet', 'gain'), p.chorus * 0.7);
    this.to(this.p('flangerWet', 'gain'), p.flanger * 0.7);
    this.to(this.p('crackleGain', 'gain'), this.playingNow ? p.crackle * 0.5 : 0);
  }
}

/**
 * PER-SONG FIX - effects were one global setting, so a mix made for one song played on every
 * song after it. Now each song has its own state:
 *   mix       what you are building (presets and controls change it)
 *   versions  mixes you saved and named ("My version", "Late drive" …)
 *   listen    what plays: 'original' (no effects), 'mix', or a version id
 * "Original" is an A/B switch: your mix is kept, one tap brings it back.
 * Example: song A has "Slowed + reverb"; song B starts as Original; back on A it is still slowed.
 */
export interface FxVersion { id: string; name: string; params: EffectParams; at: number }
export interface FxState { mix: EffectParams; versions: FxVersion[]; listen: string }

export const emptyFx = (): FxState => ({ mix: { ...NEUTRAL }, versions: [], listen: 'original' });

/** What plays for a song's state. */
export function effectiveParams(s: FxState): EffectParams {
  if (s.listen === 'mix') return s.mix;
  const v = s.versions.find(x => x.id === s.listen);
  return v ? v.params : NEUTRAL;
}

/** Stored state, cleaned; anything unreadable becomes a fresh Original. */
export function cleanFxState(v: unknown): FxState {
  const x = (v && typeof v === 'object' ? v : {}) as Partial<FxState>;
  const versions = (Array.isArray(x.versions) ? x.versions : [])
    .filter((r): r is FxVersion => !!r && typeof r.id === 'string' && typeof r.name === 'string')
    .map(r => ({ id: r.id, name: r.name.slice(0, 40) || 'My version', params: cleanEffects(r.params), at: Number(r.at) || 0 }));
  const listen = x.listen === 'mix' || versions.some(r => r.id === x.listen) ? String(x.listen) : 'original';
  return { mix: cleanEffects(x.mix), versions, listen };
}

/** The next free default name. Example: "My version", "My version 2", … */
export function nextVersionName(versions: { name: string }[]): string {
  const taken = new Set(versions.map(v => v.name));
  if (!taken.has('My version')) return 'My version';
  for (let i = 2; ; i++) if (!taken.has('My version ' + i)) return 'My version ' + i;
}

/** One group back to neutral (its ↺). */
export function resetGroup(p: EffectParams, g: EffectGroup): EffectParams {
  const def = GROUPS.find(x => x.id === g)!;
  const next: EffectParams = { ...p };
  for (const c of def.controls) (next as unknown as Record<string, unknown>)[c.key] = NEUTRAL[c.key];
  for (const t of def.toggles) next[t] = NEUTRAL[t];
  if (g === 'tape') next.stem = NEUTRAL.stem;
  return { ...next, preset: effectsActive(next) ? 'custom' : 'off' };
}

/**
 * How far a slider's fill reaches, as [from, to] in 0..1 of its track: from the neutral point to
 * the value, so a bipolar control (pan, EQ, filter) fills from the middle.
 * Example: bass +6 dB on −12…12 → [0.5, 0.75].
 */
export function sliderFill(c: Control, v: number): [number, number] {
  const at = (x: number) => (x - c.min) / (c.max - c.min);
  const n = at(NEUTRAL[c.key]), x = at(v);
  return [Math.min(n, x), Math.max(n, x)];
}
