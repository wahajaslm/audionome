import { defineStore } from 'pinia';
import { markRaw, ref } from 'vue';
import type { EventKind, ListeningEvent } from '../data/types';
import { ListeningLog, readMediaTime, type ExtraFields } from '../core/listening';
import { clearListeningEvents, deleteAllUserData, downloadProfile, eventSink, getSetting, putSetting } from '../core/repository';
import { useMomentFlowStore } from './momentFlow';
import { useUiStore } from './ui';
import { usePlaybackStore } from './playback';
import { useIntelligenceStore } from './intelligence';

/**
 * The private listening log and the "Learning" switch. Every timestamp comes from the media
 * clock (readMediaTime), never from the UI copy of the time.
 */
export const useListeningStore = defineStore('listening', () => {
  const learning = ref(true);

  const log = markRaw(new ListeningLog({
    sink: eventSink,
    context: () => {
      const p = usePlaybackStore();
      return { trackId: p.trackId, learning: learning.value, practice: p.practicing, rate: p.rate };
    },
    mediaTime: () => mediaTime(),
    refresh: () => useIntelligenceStore().refresh(),
  }));

  /** SYNC FIX 7: the position the listener actually heard (see core/listening.ts). */
  function mediaTime(): number {
    const playback = usePlaybackStore();
    return readMediaTime(playback.engine(), playback.t);
  }

  function emit(kind: EventKind, origin: ListeningEvent['origin'] = 'user', extra: ExtraFields = {}) {
    return log.emit(kind, origin, extra);
  }
  const openSpan = (atSec?: number) => log.openSpan(atSec);
  const flushSpan = (endedBy?: string) => log.flushSpan(endedBy);

  async function loadSettings(): Promise<void> {
    // 'privateListening' is the older key for the same switch.
    const pref = (await getSetting<boolean>('learning')) ?? (await getSetting<boolean>('privateListening'));
    learning.value = pref === undefined ? true : pref === true;
  }

  /**
   * The Learning / private listening switch (Settings and My Music DNA). Both keys are written so
   * the classic player reads the same answer. Pausing also closes any open question.
   * Example: off → no seek / loop / volume events are stored and no attention hints are shown.
   */
  async function setLearning(on: boolean): Promise<void> {
    learning.value = on;
    await putSetting('learning', on);
    await putSetting('privateListening', on);
    if (!on) { const flow = useMomentFlowStore(); flow.ask = null; flow.nudge = false; }
    useUiStore().notify(on ? 'Private listening insights enabled' : 'Private listening insights paused');
  }

  /** Erases the listening log (saved moments stay) and recomputes attention hints. */
  async function clearHistory(): Promise<void> {
    await clearListeningEvents();
    await useIntelligenceStore().refresh();
    useUiStore().notify('Listening event history cleared');
  }

  /** Deletes every song, moment, rating, event, analysis and setting on this device (the demo stays). */
  async function deleteAllData(): Promise<number> {
    return deleteAllUserData();
  }

  /** Downloads the profile JSON (no audio). */
  async function exportProfile(): Promise<void> {
    await downloadProfile();
    useUiStore().notify('Profile exported; audio files are not included.');
  }

  return { learning, log, mediaTime, emit, openSpan, flushSpan, loadSettings, setLearning, clearHistory, deleteAllData, exportProfile };
});
