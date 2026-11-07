import type { Track } from '../data/types';
import { artFromAnalysis, artRecipe, type ArtInput } from '../core/artwork';
import { useIntelligenceStore } from '../stores/intelligence';

/**
 * What a song's cover shows, for ui/Artwork.vue (`v-bind="artworkFor(t)"`): its tag picture when
 * it has one, else the drawn cover's input (key, tempo, energy from its analysis; waveform peaks
 * before that). `washFor` is the colour behind Now playing's header, from whichever cover shows.
 * Example: an analysed link song → artworkFor: { art: { key: 'A Minor', … } }, washFor: 'hsl(98 40% 40%)'.
 */
export function useArtwork() {
  const intelligence = useIntelligenceStore();
  function artworkFor(t: Track | undefined): { src?: string; art: ArtInput } {
    if (!t) return { art: { seed: 'none' } };
    const analysis = intelligence.analysisFor(t.id);
    const fromAnalysis = analysis ? artFromAnalysis(analysis.segments) : {};
    // Analysis energy wins over waveform peaks, but only when the analysis has enough windows.
    const art: ArtInput = { ...fromAnalysis, seed: t.sha256 || t.id, energy: fromAnalysis.energy ?? t.peaks?.peaks[0] };
    return t.artwork ? { src: t.artwork, art } : { art };
  }
  function washFor(t: Track | undefined): string {
    if (!t) return 'transparent';
    return t.artwork ? t.artworkColor || 'transparent' : artRecipe(artworkFor(t).art).wash;
  }
  return { artworkFor, washFor };
}
