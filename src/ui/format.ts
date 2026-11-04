/**
 * Time label used across the player: m:ss, rounded to the nearest second (index.html's fmt).
 * Example: formatTime(83.6) -> "1:24".
 */
export function formatTime(sec: number): string {
  const s = Math.max(0, Math.round(Number.isFinite(sec) ? sec : 0));
  return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
}

/** Reads a design token, e.g. token('--accent'). Canvas cannot resolve var(--x) itself. */
export function token(name: string, el: Element = document.documentElement): string {
  return getComputedStyle(el).getPropertyValue(name).trim();
}
