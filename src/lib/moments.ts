import type { Moment, Segment } from '../data/types';
export function formatTime(sec: number): string {
  if (!Number.isFinite(sec)) return '0:00';
  const total = Math.max(0, Math.floor(sec));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}
export function validSegment(segment: Segment | null | undefined, duration: number): segment is Segment {
  return Boolean(segment && Number.isFinite(segment.start) && Number.isFinite(segment.end) &&
    segment.start >= 0 && segment.end <= duration + .1 && segment.end - segment.start >= .5);
}
export function upsertMoment(current: Moment | undefined, trackId: string, segment: Segment,
  input: Pick<Moment, 'feelings' | 'qualities' | 'note'>): Moment {
  const now = Date.now();
  return { id: current?.id ?? crypto.randomUUID(), trackId, startSec: segment.start, endSec: segment.end,
    feelings: [...input.feelings], qualities: [...input.qualities], note: input.note.trim(),
    createdAt: current?.createdAt ?? now, updatedAt: now };
}
export function isSameSegment(a: Segment, b: Segment, threshold = .35): boolean {
  return Math.abs(a.start - b.start) < threshold && Math.abs(a.end - b.end) < threshold;
}
