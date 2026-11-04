/**
 * The research studio tab and the app share one listening session, so only one may play.
 *
 * ONE PLAYER FIX - the studio has its own <audio>. Before, both could play at once (the app
 * kept playing while you pressed play in the studio). Now the app opens the studio with a
 * window handle, and each side pauses when the other starts.
 * Example: the app plays 1:10, you press play in the studio -> the app pauses at 1:10.
 */
import { STUDIO_URL } from './diagnostics';

const STUDIO_ORIGIN = new URL(STUDIO_URL).origin;
let studio: Window | null = null;

/** Opens (or focuses) the studio tab and keeps its handle, so the app can pause it. */
export function openStudio(): void {
  studio = window.open(STUDIO_URL, 'music-dna-studio');
  studio?.focus();
}

/** The app started playing: pause the studio tab, if it is open. */
export function pauseStudio(): void {
  if (studio && !studio.closed) studio.postMessage({ source: 'music-dna', type: 'pause' }, STUDIO_ORIGIN);
}

/** Calls `onPlay` when the studio tab starts playing. */
export function onStudioPlay(onPlay: () => void): void {
  window.addEventListener('message', e => {
    if (e.origin === STUDIO_ORIGIN && e.data?.source === 'music-dna-studio' && e.data.type === 'playing') onPlay();
  });
}
