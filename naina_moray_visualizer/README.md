# Naina Moray — High-Definition CQT Music Visualizers & Intelligence Analysis

This directory contains the production Constant-Q Transform (CQT) audio-reactive visualizers, rendering engines, and source media for the passage of **"Naina Moray"** by **Javed Bashir & Akbar Ali featuring Aamir Zaki** (Coke Studio Season 10).

- **Source Video:** [YouTube: Naina Moray | Coke Studio Season 10](https://www.youtube.com/watch?v=q90zq1-heR4)
- **Active Section:** `02:09 – 03:25` (76.0 seconds duration, 1,900 frames @ 25 fps)
- **Audio Profile:** 44.1 kHz Stereo PCM, Pre-buffered with a 16.0s lead-in buffer (`01:53` to `03:25`) for zero-startup-gap retention.
- **Color Palette:** **Inferno** (Deep velvet space black background, glowing incandescent gold/orange/magenta peaks).

---

## Music DNA Intelligence Telemetry

Extracted dynamically using `services.intelligence.acoustic_features` and `research.dynamic_emotion`:

* **Tonal Key & Scale:** `D# Minor` (92% confidence)
* **Tempo & Meter:** `143.6 BPM` (71.8 BPM half-time groove)
* **Dynamic Affect (Russell Circumplex):** `ECSTATIC` (Valence: `+0.14`, Arousal: `+0.45`)
* **Instrument Stem Breakdown:**
  * **Lead Vocals:** 86% (Javed Bashir & Akbar Ali classical taans and improvisations)
  * **Bass & Low End:** 98%
  * **Drums & Percussion:** 54% (Tabla, dholak, drum kit)
  * **Guitar & Harmony:** 78% (Aamir Zaki's iconic blues-rock electric guitar lines)
  * **Air & Transients:** 45%
* **Live Harmonic Tracking:** Frame-by-frame chord tracking mapped to CQT chroma vectors.

---

## Deliverables in `renders/final/`

1. **`naina_moray_cqt_mobile_annotated.mp4`** (1080×1920, 9:16 Portrait, 86 MB)
   * Top 16:9 performance video with zero stretching.
   * Inferno CQT continuous vertical waterfall (750 px) + harmonic bar spikes (482 px).
   * High-contrast piano keyboard note ruler ($C_2 \to C_9$) with gold octave dividers.
   * Floating Glass Telemetry HUD pill: live BPM pulse, tonal key, dynamic affect, real-time live chords, and vocal/drum dynamic level meters.
   * In-spectrum horizontal stem brackets marking frequency allocations.

2. **`naina_moray_cqt_lr_daw_mobile.mp4`** (1080×1920, 9:16 Portrait, 51 MB)
   * Horizontal DAW Piano-Roll editor with time scrolling right-to-left towards a glowing playhead.
   * 96 bins/octave (576 vertical bins across 6 octaves, $C_2 \to C_8$).
   * Authentic black & white piano keys on the left axis with octave markers.
   * High-contrast HUD and frequency stem badges.

3. **`naina_moray_cqt_mobile_final.mp4`** (1080×1920, 9:16 Portrait, 75 MB)
   * Clean broadcast edition of the vertical waterfall visualizer without text overlays.

4. **`naina_moray_cqt_desktop_final.mp4`** (1920×1080, 16:9 Landscape, 68 MB)
   * Full widescreen desktop edition with letterboxed 16:9 video and horizontal panoramic waterfall.

---

## Web Player Integration

The analyzed passage has also been exported to:
- `public/Naina-Moray-Coke-Studio-129-205.mp3`

It is ready to be loaded directly into the Music DNA web player library for interactive playback, waveform selection, and personal preference annotation.

