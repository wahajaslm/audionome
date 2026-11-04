# Chaap Tilak — High-Definition CQT Music Visualizers

This directory contains the production-grade Constant-Q Transform (CQT) audio-reactive visualizers, rendering scripts, source media, and assets created for the live performance of **"Chaap Tilak"** by Nusrat Fateh Ali Khan & Rahat Fateh Ali Khan.

- **Source Video:** [YouTube: Nusrat Fateh Ali Khan & Rahat Fateh Ali Khan - Chaap Tilak](https://www.youtube.com/watch?v=7SDrjwtfKMk)
- **Active Section:** `00:56 – 01:17` (21.0 seconds duration, 525 frames @ 25 fps)
- **Audio Profile:** 48 kHz / 44.1 kHz Stereo, Pre-buffered from `00:40` to `01:22` (16.0s lead-in for zero-startup-gap retention buffer)
- **Color Palette:** **Inferno** (Deep velvet space black background, glowing incandescent gold/orange/magenta peaks)

---

## Directory Structure

```
chaap_tilak_visualizer/
├── README.md                      # This documentation guide
├── renders/
│   ├── final/                     # Production Deliverables (00:56 - 01:17)
│   │   ├── chaap_tilak_cqt_mobile_final.mp4           # Portrait (1080x1920) Waterfall + Bar Spikes
│   │   ├── chaap_tilak_cqt_desktop_final.mp4          # Landscape (1920x1080) Waterfall + Bar Spikes
│   │   ├── chaap_tilak_cqt_horizontal_mobile_56_77.mp4 # Portrait (1080x1920) Horizontal DAW Piano-Roll
│   │   └── chaap_tilak_cqt_horizontal_desktop_56_77.mp4# Landscape (1920x1080) Horizontal DAW Piano-Roll
│   └── experiments/               # Earlier iterations, 15s backups & experimental formats
│       ├── chaap_tilak_cqt_mobile_final_15s_backup.mp4
│       ├── chaap_tilak_cqt_desktop_final_15s_backup.mp4
│       ├── chaap_tilak_cqt_horizontal_mobile.mp4
│       ├── chaap_tilak_cqt_horizontal_desktop.mp4
│       ├── chaap_tilak_cqt_inferno_notes.mp4
│       ├── chaap_tilak_cqt_mobile_inferno.mp4
│       ├── chaap_tilak_cqt_vertical_9x16.mp4
│       ├── chaap_tilak_cqt_vertical_waterfall.mp4
│       ├── chaap_tilak_cqt_spectrogram.mp4
│       ├── chaap_tilak_3tier_spectrogram.mp4
│       ├── chaap_tilak_melspectrogram.mp4
│       └── chaap_tilak_spectrogram.mp4
├── sources/                       # Downloaded YouTube video clips and prebuffered PCM WAVs
│   ├── chaap_tilak_clip_56_77.mp4         # 21s cut (00:56 - 01:17)
│   ├── chaap_tilak_prebuffered_56_77.wav # 42s uncompressed PCM audio (00:40 - 01:22)
│   ├── chaap_tilak_clip.mp4               # Earlier 15s cut (01:00 - 01:15)
│   ├── chaap_tilak_clip.wav
│   └── chaap_tilak_prebuffered.wav
├── assets/                        # Custom high-contrast piano note rulers & 3D Hald color LUTs
│   ├── axis_1080_v2.png           # 1080x80 note ruler for mobile portrait
│   ├── axis_1920_v2.png           # 1920x60 note ruler for desktop landscape
│   └── inferno_clut.png           # 512x512 3D Hald color lookup table (Inferno)
├── scripts/                       # Executable python scripts & shell workflows
│   ├── render_cqt_waterfall_final.py      # Vertical waterfall + harmonic bars engine
│   ├── render_horizontal_cqt.py           # Horizontal DAW-style CQT spectrogram engine
│   ├── generate_axis_and_luts.py          # Regenerates piano note rulers & Inferno CLUT
│   └── download_sources.sh                # Downloads YouTube video and prebuffered PCM audio
└── previews/                      # Snapshot images & quality verification frames
    ├── preview_mob_final_t8.png
    ├── preview_desk_final_t8.png
    ├── preview_mob_t5.png
    ├── preview_desk_t5.png
    └── ...
```

---

## Visualizer Styles

### 1. Vertical Waterfall + Harmonic Bars (`*_final.mp4`)
- **Top Section**: Native 16:9 performance video with zero stretching or cropping.
- **Middle Section**: Two-tier CQT spectrogram in **Inferno**:
  - Continuous vertical waterfall scrolling upwards (750 px height on mobile, 300 px on desktop).
  - High-energy harmonic frequency spikes tracking each vocal note and harmonium chord (482 px on mobile, 180 px on desktop).
- **Bottom Section**: High-contrast piano keyboard note ruler ($C_2 \to C_9$) with bold gold octave dividers ($C_2, C_3, \dots, C_9$), semitone ticks, and note letter markings.
- **Pre-buffering**: Because audio is pre-buffered from 00:40, the retention waterfall buffer is 100% filled from the very first frame at 00:56 (no black void).

### 2. Horizontal DAW / Piano-Roll (`*_horizontal_*.mp4`)
- **Orientation**: Time flows horizontally along the X-axis from a right-edge playhead needle to the left, exactly like modern digital audio workstations (DAWs) and piano-roll editors.
- **Y-Axis (Musical Pitch)**: Mapped vertically from $C_2$ (65.4 Hz) to $C_8$ (4186 Hz).
  - Eliminates empty high frequencies ($C_8 \to C_9$) and sub-bass rumble, giving 16.7% more vertical resolution to the active vocal and instrument spectrum.
  - 48 bins per octave (4 bins per semitone, 288 total pitch bins).
- **Temporal Resolution**: `hop_length = 128` at 44.1 kHz ($\approx 344.5$ fps sampling rate), capturing fast vocal glides (*meends*), vibrato, and tabla slaps without blockiness.
- **Denoising**: Librosa CQT thresholded dynamically at $-48.0\text{ dB}$ with a soft gamma curve ($\gamma = 1.35$), removing live 1990s room tape hiss into deep velvet black.

---

## How to Run & Reproduce

All scripts can be run directly using Python 3 and FFmpeg:

```bash
# 1. Regenerate Note Rulers & Inferno Color LUT (optional)
python3 chaap_tilak_visualizer/scripts/generate_axis_and_luts.py

# 2. Render Vertical Waterfall Visualizer (Mobile & Desktop)
python3 chaap_tilak_visualizer/scripts/render_cqt_waterfall_final.py --target both
# Options: --target mobile | --target desktop | --target both

# 3. Render Horizontal DAW Visualizer (Mobile & Desktop)
python3 chaap_tilak_visualizer/scripts/render_horizontal_cqt.py --target both
# Options: --target mobile | --target desktop | --target both
```


### 3. Music DNA Intelligence Annotated Edition (`chaap_tilak_music_dna_mobile_final.mp4`)
- **Format**: Mobile Portrait (`1080×1920`, 9:16)
- **Top Section (1080×608)**: Native 16:9 live performance video.
- **Middle Section (1080×260)**: Ultra-premium Obsidian Glassmorphic Music DNA Telemetry HUD:
  - **4-Stem Segmented LED Meters**: 28-segment ladders with peak-decay needles for Vocals (Gold/Amber), Tabla (Coral), Harmonium (Orchid), and Bass (Royal Violet).
  - **Russell's Circular Affect Scope**: Concentric reticle with dynamic $(V, A)$ coordinates and luminous particle beacon.
  - **Tonal Key & Tempo**: Detected Key ($C\sharp\text{ Minor}$), $123.0\text{ BPM}$ with real-time flashing beat-sync LED.
  - **Live Intensity Gauge**: Dynamic build-up and crescendo indicators ($+2.8\text{ dB/s}$).
  - **Vocal Micro-dynamics**: $5.8\text{ Hz}$ vibrato extent and pitch deviation range ($\pm 24.6\text{ st}$).
- **Lower Section (1080×972)**: High-resolution CQT Spectrogram in **Inferno** (`sono_h=580` waterfall + `bar_h=392` harmonic spikes).
- **Base (1080×80)**: High-contrast piano note ruler ($C_2 \to C_9$).
