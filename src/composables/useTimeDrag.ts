/**
 * Click or drag on a time axis (song strip, Explore lanes, Song anatomy map).
 *
 * LOOP ANYWHERE FIX - only the waveform could set the loop markers; every other timeline only
 * seeked on click. Now a drag on any of them marks a range, and a plain click keeps its old job.
 * Example: drag across the Explore lanes from 1:40 to 1:52 → the loop becomes 1:40–1:52.
 *
 * `toTime(clientX)` maps the pointer to seconds. A move of more than 4 px is a drag.
 */
export interface TimeDragHandlers {
  click(sec: number): void;
  /** phase 'start' once, then 'move' while dragging, then 'end'. a <= b. */
  range(a: number, b: number, phase: 'start' | 'move' | 'end'): void;
}

export function useTimeDrag(toTime: (clientX: number) => number, on: TimeDragHandlers) {
  let x0 = 0, t0 = 0, dragging = false, down = false;

  function pointerdown(e: PointerEvent): void {
    if (e.button !== 0) return;
    down = true; dragging = false;
    x0 = e.clientX; t0 = toTime(e.clientX);
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
  }
  function pointermove(e: PointerEvent): void {
    if (!down) return;
    if (!dragging && Math.abs(e.clientX - x0) > 4) { dragging = true; on.range(t0, t0, 'start'); }
    if (dragging) { const t = toTime(e.clientX); on.range(Math.min(t0, t), Math.max(t0, t), 'move'); }
  }
  function pointerup(e: PointerEvent): void {
    if (!down) return;
    down = false;
    const t = toTime(e.clientX);
    if (dragging) on.range(Math.min(t0, t), Math.max(t0, t), 'end'); else on.click(t);
    dragging = false;
  }
  function pointercancel(): void { down = false; dragging = false; }

  return { pointerdown, pointermove, pointerup, pointercancel };
}
