import { defineStore } from 'pinia';
import { markRaw, ref } from 'vue';
import type { EventKind, ListeningEvent } from '../data/types';
import { ListeningLog, readMediaTime, type ExtraFields } from '../core/listening';
import { eventSink, getSetting, putSetting } from '../core/repository';
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
    context: () => ({ trackId: usePlaybackStore().trackId, learning: learning.value }),
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

  async function setLearning(on: boolean): Promise<void> {
    learning.value = on;
    await putSetting('learning', on);
  }

  return { learning, log, mediaTime, emit, openSpan, flushSpan, loadSettings, setLearning };
});
