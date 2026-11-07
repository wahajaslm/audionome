import { computed, reactive } from 'vue';

/**
 * Open / closed state of the folds (ui/Fold.vue) in Explore and Nerds, remembered in this
 * browser (a viewing convenience: nothing breaks if storage is blocked, folds use their default).
 * Ids are "<view>.<section>", e.g. "nerds.inspector.hex"; a view's Expand all / Collapse all
 * acts on every fold whose id starts with that view.
 */
const KEY = 'mdna-folds';
const state = reactive<Record<string, boolean>>(load());
const known = reactive(new Set<string>());

function load(): Record<string, boolean> {
  try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { return {}; }
}
function save(): void {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* storage blocked: keep in memory */ }
}

/** A fold's open state (get / set), with its default until the listener changes it. */
export function useFold(id: string, defaultOpen = true) {
  known.add(id);
  return computed<boolean>({
    get: () => state[id] ?? defaultOpen,
    set: v => { state[id] = v; save(); },
  });
}

/** Opens or closes every fold of a view (ids starting with `prefix + '.'`). */
export function setAllFolds(prefix: string, open: boolean): void {
  for (const id of known) if (id.startsWith(prefix + '.')) state[id] = open;
  save();
}

/** True when every known fold of the view is open (the header shows "Collapse all"). */
export function allOpen(prefix: string) {
  return computed(() => [...known].filter(id => id.startsWith(prefix + '.')).every(id => state[id] ?? true));
}
