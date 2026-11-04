import { defineStore } from 'pinia';
import { computed, ref, shallowRef } from 'vue';
import { fetchStudioBundle, type PythonDiagnostics, type StudioBundle } from '../core/diagnostics';
import { fetchPythonDiagnostics, intelligenceHealth, type IntelligenceHealth } from '../intelligence/client';
import { useIntelligenceStore } from './intelligence';
import { useLibraryStore } from './library';
import { useMomentsStore } from './moments';
import { usePlaybackStore } from './playback';

/**
 * Feature Analysis screen state: which recording is inspected and what the local service
 * reported for it. Every request fails soft: with the service off, health is null and the
 * screen says so instead of throwing.
 */
export const useDiagnosticsStore = defineStore('diagnostics', () => {
  const trackId = ref<string | null>(null);
  const health = shallowRef<IntelligenceHealth | null>(null);
  const bundle = shallowRef<StudioBundle | null>(null);
  const diag = shallowRef<PythonDiagnostics | null>(null);
  const loading = ref(false);
  /** Set after the first load attempt, so "service offline" is not shown while still asking. */
  const checked = ref(false);
  let loadedFor: string | null = null;

  /** The inspected recording: chosen one, else the loaded one, else the first in the library. */
  const currentId = computed(() => trackId.value || usePlaybackStore().trackId || useLibraryStore().tracks[0]?.id || 'original-demo');

  /** The service's multimodal analysis when it has one, else the local one in IndexedDB. */
  const analysis = computed(() => bundle.value?.multimodal || useIntelligenceStore().analysisFor(currentId.value));

  async function load(force = false): Promise<void> {
    const tid = currentId.value;
    if ((!force && loadedFor === tid && checked.value) || loading.value) return;
    loading.value = true;
    try {
      const intel = useIntelligenceStore();
      const [h, b, d] = await Promise.all([
        intelligenceHealth().catch(() => null),
        fetchStudioBundle(tid),
        fetchPythonDiagnostics({ analyses: intel.analyses, moments: useMomentsStore().moments, ratings: intel.ratings, events: intel.events })
          .catch(() => null) as Promise<PythonDiagnostics | null>,
      ]);
      health.value = h; bundle.value = b; diag.value = d; loadedFor = tid;
    } finally {
      loading.value = false;
      checked.value = true;
    }
  }

  async function select(id: string): Promise<void> {
    trackId.value = id;
    bundle.value = null;
    await load(true);
  }

  return { trackId, currentId, health, bundle, diag, loading, checked, analysis, load, select };
});
