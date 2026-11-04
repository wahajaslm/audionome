export type SourceKind = 'demo-original' | 'local-file' | 'licensed-provider' | 'external-reference';
export type AudioRight = 'cleared' | 'unconfirmed' | 'restricted';
export interface Track {
  id: string;
  title: string;
  artist: string;
  durationSec: number;
  mimeType: string;
  source: SourceKind;
  analysisRight: AudioRight;
  addedAt: number;
  audioBlob?: Blob; // never upload silently; future adapters may only supply provider references
  providerId?: string;
  // SHA-256 (hex) of the imported file's bytes. Research links a track to a corpus song by this, not by title:
  // a corpus file imported as '7rLxN41avhY.m4a' has the title '7rLxN41avhY', which no song name matches,
  // and a re-encoded copy titled 'Garaj Baras' would match by name but not by audio. Unset for older imports.
  sha256?: string;
  artwork?: string;
}
export interface Moment {
  id: string;
  trackId: string;
  startSec: number;
  endSec: number;
  feelings: string[];
  qualities: string[];
  note: string;
  createdAt: number;
  updatedAt: number;
  source?: 'user_confirmed' | 'user_created';
  familiarity?: number; // TROMPA-MER 1-5 familiarity rating
  favReasons?: string[]; // Canonical FAV Corpus musical reason categories
}
export type EventKind = 'play' | 'pause' | 'seek' | 'skip' | 'volume' | 'select_moment' | 'loop_enabled' | 'loop_disabled' | 'loop_cycle' | 'track_change' | 'listen_span' | 'dismiss_candidate';
export interface ListeningEvent {
  id: string;
  trackId: string;
  sessionId: string;
  kind: EventKind;
  at: number;
  positionSec: number;
  fromSec?: number;
  toSec?: number;
  durationSec?: number;
  endedBy?: string;
  momentStartSec?: number;
  momentEndSec?: number;
  volume?: number;
  candidateId?: string;
  origin: 'user' | 'player';
}
export interface BehavioralFeatures {
  manualRewinds: number;
  manualLoopStarts: number;
  listenedPasses: number;
  distinctSessions: number;
  seekArrivals: number;
  skipDepartures: number;
  relativeVolumeChanges: number;
}
export type AttentionConfidence = 'low attention' | 'possible interest' | 'repeated interest';
export interface AttentionCandidate {
  trackId: string;
  startSec: number;
  endSec: number;
  confidence: AttentionConfidence;
  behavior: BehavioralFeatures;
  backwardSeeks: number;
  loopStarts: number;
  loopCycles: number;
  sessions: number;
  lastSeen: number;
  reason: string[];
  dismissed?: boolean;
}
export interface UserSetting {key: string; value: boolean | number | string}
export interface Segment {start: number; end: number}

export interface MelodyHarmony {
  key: string;
  keyConfidence: number;
  chords: string[];
  harmonicStability: number;
  chroma: number[];
}

export interface RhythmGroove {
  tempoBpm: number;
  beatCount: number;
  syncopation: number;
  pulseClarity: number;
  drumFillDetected: boolean;
}

export interface InstrumentationTimbre {
  probabilities: Record<string, number>;
  topInstruments: string[];
  texture: 'acoustic' | 'electronic' | 'hybrid';
  brightnessHz: number;
}

/** Pitch-contour descriptors from musicdna/features/vocal.py; only present when a real vocal stem was analysed. */
export interface VocalPitch {
  voiced_fraction: number;
  median_pitch_st: number;
  pitch_range_st: number;
  glide_st_per_sec: number;
  pitch_velocity_st_per_sec: number;
  longest_sustain_sec: number;
  vibrato_rate_hz: number;
  vibrato_extent_st: number;
  ornament_rate_per_sec: number;
}
export interface VocalsExpression {
  presence: number;
  breathiness: number;
  expressiveDynamic: number;
  pitch: VocalPitch | null;
}

export interface ArrangementTransitions {
  activeStems: string[];
  layeringDensity: number;
  transitionType: string;
  stemEnergies: Record<string, number>;
}

export interface MusicalDimensions {
  melodyHarmony: MelodyHarmony;
  rhythmGroove: RhythmGroove;
  instrumentationTimbre: InstrumentationTimbre;
  vocalsExpression: VocalsExpression;
  arrangementTransitions: ArrangementTransitions;
}

/** Model outputs are observations, not inferred feelings or validated probabilities. */
export interface AudioSegment {
  startSec: number;
  endSec: number;
  descriptors: {
    energy: number;
    brightness_hz: number;
    onset_activity: number;
    noisiness: number;
    zero_crossing_rate: number;
    energy_slope?: number;
    vocal_presence?: number;
    spectral_flux?: number;
    chroma?: number[];
    dimensions?: MusicalDimensions;
    key?: string;
    chords?: string[];
    tempoBpm?: number;
    activeStems?: string[];
    topInstruments?: string[];
  };
  embedding: number[];
  dspEmbedding?: number[];
  deepEmbedding?: number[];
}
export interface TrackAnalysis {
  trackId: string;
  method: 'dsp'|'clap'|'multimodal';
  modelId: string;
  durationSec: number;
  analyzedAt: number;
  segments: AudioSegment[];
  musicalDimensions?: MusicalDimensions;
  stemsAvailable?: string[];
  components?: {
    dspModelId: string;
    deepModelId: string;
    wDeep: number;
    wDsp: number;
  };
}
export interface MomentRating {
  id: string;
  trackId: string;
  startSec: number;
  endSec: number;
  value: 'like' | 'dislike';
  createdAt: number;
}
