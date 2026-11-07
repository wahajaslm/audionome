/**
 * Stats for nerds: everything known about what is playing, in three groups.
 *
 *   File      codec, encoder settings, bitrate, sample format, tags   ← core/bitrate.ts (always),
 *             MediaInfo (mediainfo.js, in the browser), ffprobe (local service, when running)
 *   Playback  deck, buffer, speed, audio device, latency, loudness gain, effects, crossfade
 *   Analysis  tempo, key, bars, parts, stems, melody, loudness measured
 *
 * Each source fills what it knows; a row shows the first source that has a value, so the panel
 * works with the service off (browser sources only) and gets richer when it is on.
 * Example row: ["Encoder settings", "-m j -V 0 -q 0 -lowpass 22.1 --vbr-new", "MediaInfo"].
 */
import type { BitrateInfo } from './bitrate.ts';

export type NerdRow = [label: string, value: string, source?: string];

/** ffprobe's facts (musicdna/service/probe_api.py). */
export interface ProbeInfo {
  container?: string; codec?: string; codecName?: string; profile?: string | null; sampleFormat?: string; bitDepth?: number | null;
  sampleRate?: number | null; channels?: number; channelLayout?: string; durationSec?: number | null; startSec?: number | null;
  sizeBytes?: number | null; bitRate?: number | null; encoder?: string; pictures?: number; tags?: Record<string, string>;
}

/** The MediaInfo fields used here (General and first Audio track). */
export interface MediaInfoFacts {
  general: Record<string, unknown>;
  audio: Record<string, unknown>;
}

/** Reads MediaInfo from a file in the browser; the 4 MB WebAssembly loads on first use only. */
export async function readMediaInfo(blob: Blob): Promise<MediaInfoFacts | null> {
  const [{ default: mediaInfoFactory }, { default: wasmUrl }] = await Promise.all([
    import('mediainfo.js'),
    import('mediainfo.js/MediaInfoModule.wasm?url'),
  ]);
  const mi = await mediaInfoFactory({ format: 'object', locateFile: () => wasmUrl });
  try {
    const res = await mi.analyzeData(blob.size, async (size: number, offset: number) =>
      new Uint8Array(await blob.slice(offset, offset + size).arrayBuffer()));
    const tracks = (res.media?.track ?? []) as unknown as Record<string, unknown>[];
    const general = tracks.find(t => t['@type'] === 'General') ?? {};
    const audio = tracks.find(t => t['@type'] === 'Audio') ?? {};
    return { general, audio };
  } finally { mi.close(); }
}

/** GET /api/probe/<id>; null when the service is off or does not have the file. */
export async function fetchProbe(serviceUrl: string, trackId: string, fetcher: typeof fetch = fetch): Promise<ProbeInfo | null> {
  try {
    const r = await fetcher(serviceUrl + '/api/probe/' + encodeURIComponent(trackId), { signal: AbortSignal.timeout(8000) });
    return r.ok ? await r.json() : null;
  } catch { return null; }
}

const str = (v: unknown) => (v === undefined || v === null || v === '' ? '' : String(v));
const kbps = (bps: unknown) => { const n = Number(bps); return Number.isFinite(n) && n > 0 ? Math.round(n / 1000) + ' kbps' : ''; };
const khz = (hz: unknown) => { const n = Number(hz); return n > 0 ? (n / 1000).toFixed(n % 1000 ? 1 : 0) + ' kHz' : ''; };
export const bytes = (n: unknown) => {
  const v = Number(n);
  if (!(v > 0)) return '';
  return v >= 1e6 ? (v / 1e6).toFixed(1) + ' MB' : Math.round(v / 1e3) + ' kB';
};
export const clock = (sec: unknown) => {
  const s = Number(sec);
  if (!(s >= 0)) return '';
  return Math.floor(s / 60) + ':' + (s % 60).toFixed(2).padStart(5, '0');
};

/** First non-empty value, with its source's name. */
function first(...c: [unknown, string][]): [string, string] | null {
  for (const [v, src] of c) { const s = str(v); if (s) return [s, src]; }
  return null;
}

/**
 * File rows from the three sources. `bitrate` (frame parser) is always there when the file was
 * read; MediaInfo and ffprobe add encoder settings, profile and tags.
 */
export function fileRows(br: BitrateInfo | null, mi: MediaInfoFacts | null, pr: ProbeInfo | null, nowKbps: number | null): NerdRow[] {
  const g = mi?.general ?? {}, a = mi?.audio ?? {};
  const rows: NerdRow[] = [];
  const add = (label: string, ...c: [unknown, string][]) => { const f = first(...c); if (f) rows.push([label, f[0], f[1]]); };
  add('Container', [g.Format, 'MediaInfo'], [pr?.container, 'ffprobe'], [br?.container, 'frames']);
  add('Codec', [[a.Format, a.Format_Version, a.Format_Profile].filter(Boolean).join(' '), 'MediaInfo'],
    [[pr?.codec, pr?.profile].filter(Boolean).join(' · '), 'ffprobe'], [br?.codec, 'frames']);
  add('Format settings', [a.Format_Settings, 'MediaInfo'], [a.Format_Settings_Mode, 'MediaInfo'], [a.Format_AdditionalFeatures, 'MediaInfo']);
  add('Compression', [a.Compression_Mode, 'MediaInfo'], [br && (br.mode === 'lossless' || br.mode === 'PCM' ? 'Lossless' : 'Lossy'), 'frames']);
  add('Bitrate mode', [a.BitRate_Mode, 'MediaInfo'], [br?.mode, 'frames']);
  add('Bitrate', [br ? `avg ${br.avgKbps} kbps` + (nowKbps != null && br.exact ? ` · now ${nowKbps} kbps` : '') : '', 'frames'],
    [kbps(a.BitRate), 'MediaInfo'], [kbps(pr?.bitRate), 'ffprobe']);
  add('Max bitrate', [kbps(a.BitRate_Maximum), 'MediaInfo'], [br?.exact && br.mode === 'VBR' ? Math.max(...br.kbps) + ' kbps (per ½ s)' : '', 'frames']);
  add('Sample rate', [khz(a.SamplingRate), 'MediaInfo'], [khz(pr?.sampleRate), 'ffprobe'], [khz(br?.sampleRate), 'frames']);
  add('Sample format', [[pr?.sampleFormat, pr?.bitDepth ? pr.bitDepth + '-bit' : ''].filter(Boolean).join(' · '), 'ffprobe'], [a.BitDepth ? a.BitDepth + '-bit' : '', 'MediaInfo']);
  add('Channels', [[a.Channels, a.ChannelLayout].filter(Boolean).join(' · '), 'MediaInfo'],
    [[pr?.channels, pr?.channelLayout].filter(Boolean).join(' · '), 'ffprobe'], [br?.channels, 'frames']);
  add('Samples per frame', [a.SamplesPerFrame, 'MediaInfo']);
  add('Duration', [clock(pr?.durationSec), 'ffprobe'], [clock(g.Duration), 'MediaInfo'], [clock(br?.durationSec), 'frames']);
  add('File size', [bytes(g.FileSize), 'MediaInfo'], [bytes(pr?.sizeBytes), 'ffprobe']);
  add('Audio stream size', [bytes(a.StreamSize), 'MediaInfo']);
  add('Encoder', [a.Encoded_Library, 'MediaInfo'], [g.Encoded_Library, 'MediaInfo'], [g.Encoded_Application, 'MediaInfo'], [pr?.encoder, 'ffprobe']);
  add('Encoder settings', [a.Encoded_Library_Settings, 'MediaInfo']);
  add('ReplayGain', [[a.ReplayGain_Gain && a.ReplayGain_Gain + ' dB', a.ReplayGain_Peak && 'peak ' + a.ReplayGain_Peak].filter(Boolean).join(' · '), 'MediaInfo'],
    [[pr?.tags?.replaygain_track_gain, pr?.tags?.replaygain_track_peak && 'peak ' + pr.tags.replaygain_track_peak].filter(Boolean).join(' · '), 'ffprobe']);
  add('Cover art', [g.Cover === 'Yes' ? 'embedded' : '', 'MediaInfo'], [pr?.pictures ? pr.pictures + ' embedded' : '', 'ffprobe']);
  add('Tags', [[g.Title, g.Performer, g.Album, g.Recorded_Date].filter(Boolean).join(' · '), 'MediaInfo'],
    [[pr?.tags?.title, pr?.tags?.artist, pr?.tags?.album, pr?.tags?.date].filter(Boolean).join(' · '), 'ffprobe']);
  add('Written by', [g.Writing_Application ?? g.Encoded_Application, 'MediaInfo'], [pr?.tags?.handler_name, 'ffprobe']);
  return rows;
}

/** Live playback rows (engine.stats() and the store). */
export function playbackRows(s: {
  deck: string; bufferedAhead: number; readyState: number; networkState: number; rate: number; pitchKept: boolean;
  crossfading: boolean; loudnessDb: number; webAudio: boolean;
  device: { sampleRate: number; baseLatency: number; outputLatency: number; state: string } | null;
}, x: { source: string; stem: string; practiceRate: number; effects: string; lufs?: number; peakDb?: number }): NerdRow[] {
  const READY = ['nothing', 'metadata', 'current frame', 'future frames', 'enough to play'];
  const NET = ['empty', 'idle', 'loading', 'no source'];
  const ms = (v: number) => Math.round(v * 1000) + ' ms';
  const rows: NerdRow[] = [
    ['Source', x.source + (x.stem !== 'all' ? ' · stem ' + x.stem.replace('no_', 'without ') : '')],
    ['Deck', s.deck + (s.crossfading ? ' · crossfading' : '')],
    ['Buffered ahead', s.bufferedAhead.toFixed(1) + ' s'],
    ['Media state', `${READY[s.readyState] ?? s.readyState} · network ${NET[s.networkState] ?? s.networkState}`],
    ['Speed', `${s.rate.toFixed(2)}× · ${s.pitchKept ? 'pitch kept' : 'pitch moves (tape)'}` + (x.practiceRate !== 1 ? ` · practice ${x.practiceRate}×` : '')],
    ['Loudness', (x.lufs !== undefined && Number.isFinite(x.lufs) ? `${x.lufs.toFixed(1)} LUFS (mono)` : 'not measured yet')
      + (x.peakDb !== undefined && Number.isFinite(x.peakDb) ? ` · peak ${x.peakDb.toFixed(1)} dBFS` : '')
      + ` · gain ${s.loudnessDb > 0 ? '+' : ''}${s.loudnessDb.toFixed(1)} dB`],
    ['Effects', x.effects],
  ];
  rows.push(s.device
    ? ['Audio device', `${khz(s.device.sampleRate)} · ${s.device.state} · latency ${ms(s.device.baseLatency)} + output ${ms(s.device.outputLatency)}`]
    : ['Audio device', s.webAudio ? '—' : 'direct (Web Audio starts on first play)']);
  return rows;
}

/** Analysis rows from the song's timeline. */
export function analysisRows(tl: {
  tempoBpm?: number | null; key?: string | null; beats?: number[]; downbeats?: number[]; sections?: { label: string }[];
  chords?: unknown[]; chordSource?: string; stemSource?: string; melody?: { fps: number; midi: (number | null)[] }; durationSec?: number;
} | null): NerdRow[] {
  if (!tl) return [['Analysis', 'not available (service off or not analysed yet)']];
  const rows: NerdRow[] = [];
  if (tl.tempoBpm) rows.push(['Tempo', tl.tempoBpm.toFixed(1) + ' BPM']);
  if (tl.key) rows.push(['Key', tl.key]);
  if (tl.beats?.length) rows.push(['Beats · bars', `${tl.beats.length} · ${tl.downbeats?.length ?? 0}`]);
  if (tl.sections?.length) rows.push(['Parts', `${tl.sections.length} (${new Set(tl.sections.map(p => p.label)).size} kinds)`]);
  if (tl.chords?.length) rows.push(['Chords', `${tl.chords.length} changes` + (tl.chordSource ? ' · from ' + tl.chordSource : '')]);
  if (tl.stemSource) rows.push(['Stems', tl.stemSource]);
  if (tl.melody?.midi?.length) {
    const voiced = tl.melody.midi.filter(v => v != null).length;
    rows.push(['Melody', `${tl.melody.fps} fps · ${Math.round(voiced / tl.melody.midi.length * 100)}% voiced`]);
  }
  if (tl.durationSec) rows.push(['Analysed length', clock(tl.durationSec)]);
  return rows;
}
