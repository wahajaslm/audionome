/**
 * Address of the local Python analysis service, in one place.
 *
 * Defaults to http://127.0.0.1:8765. Set VITE_MUSIC_DNA_SERVICE to use another one, e.g.
 *   VITE_MUSIC_DNA_SERVICE=http://127.0.0.1:8766 npm run dev
 * Before, the address was written out in four files, so moving the service meant editing all four.
 */
export const SERVICE_URL: string =
  (import.meta as { env?: Record<string, string | undefined> }).env?.VITE_MUSIC_DNA_SERVICE || 'http://127.0.0.1:8765';
