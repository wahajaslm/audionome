import { onBeforeUnmount, onMounted } from 'vue';

export type ShortcutMap = Record<string, (e: KeyboardEvent) => void>;

// SPACE FIX - Space was skipped whenever a button, chip or the waveform had focus, which is
// right after any click; Space then re-pressed that button or did nothing. Like Spotify,
// shortcuts now run everywhere except while typing, and they win over the focused button.
// Example: click "Vocals", then press Space -> playback pauses (it used to re-click Vocals).
/** True while typing: text fields and editable text keep their keys. */
function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable || target.closest('textarea, select')) return true;
  const input = target.closest('input');
  return !!input && !['button', 'checkbox', 'radio', 'range', 'submit', 'reset'].includes(input.type);
}

/**
 * Page-wide shortcuts while the calling component is mounted. Keys are KeyboardEvent.key
 * values (' ' for Space). Ignored while typing.
 * Example: useKeyboardShortcuts({ ' ': () => playback.togglePlay() }).
 */
export function useKeyboardShortcuts(map: ShortcutMap): void {
  function onKey(e: KeyboardEvent): void {
    if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey || e.repeat || isTyping(e.target)) return;
    const fn = map[e.key];
    if (!fn) return;
    e.preventDefault();
    fn(e);
  }
  // Capture phase: runs before the focused button sees the key, so preventDefault stops the
  // button from being pressed by Space.
  onMounted(() => window.addEventListener('keydown', onKey, true));
  onBeforeUnmount(() => window.removeEventListener('keydown', onKey, true));
}

