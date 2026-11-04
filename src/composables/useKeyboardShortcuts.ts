import { onBeforeUnmount, onMounted } from 'vue';

export type ShortcutMap = Record<string, (e: KeyboardEvent) => void>;

/** True when the key press belongs to a control that handles keys itself. */
function ownsKeys(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  if (target.closest('input, textarea, select, button, a[href], [role="slider"], [role="switch"]')) return true;
  return false;
}

/**
 * Page-wide shortcuts while the calling component is mounted. Keys are KeyboardEvent.key
 * values (' ' for Space). Ignored while typing or when a focused control owns the key.
 * Example: useKeyboardShortcuts({ ' ': () => playback.togglePlay() }).
 */
export function useKeyboardShortcuts(map: ShortcutMap): void {
  function onKey(e: KeyboardEvent): void {
    if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey || ownsKeys(e.target)) return;
    const fn = map[e.key];
    if (!fn) return;
    e.preventDefault();
    fn(e);
  }
  onMounted(() => window.addEventListener('keydown', onKey));
  onBeforeUnmount(() => window.removeEventListener('keydown', onKey));
}

