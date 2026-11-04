# Music DNA Player · M3.1

The player is a **Vue 3 app** (`index.html` → `src/main.ts`) built on the Music DNA design system (`reference/music-dna/design-system/`). It has real playback, persistent listener data and cautious personal insights; nothing about the listener is invented. Songs, moments and settings live in the browser's IndexedDB database (`music-dna-v1`).

## Run

Requires **Node 20.19+** and a browser that can play the imported audio formats.

```bash
npm install
npm run dev
```

Open the local Vite address (typically `http://localhost:5173`). That is the player. The included **original, 32-second WAV recording** makes the player usable without importing music.

For authorized local music analysis, run the Python service in a second terminal:

```bash
python -m venv .venv
source .venv/bin/activate       # Windows: .venv\\Scripts\\activate
pip install -r requirements.txt
npm run service   # = uvicorn musicdna.service.app:app --port 8765 --reload: restarts itself when musicdna/ changes
```

In **Library**, import MP3/WAV or other browser-supported audio; press **Analyse locally** only if you have the necessary analysis rights (with automatic analysis off, the row asks you to confirm them first). Analysis is opt-in. Original recordings remain in the browser's IndexedDB; temporary analysis copies sent to your own localhost Python service are removed after processing. Streamed tracks are **not** assumed to be analyzable.

## Screens

- **Now playing:** real media playback, waveform from the decoded audio, seek, volume, drag-to-select, save, loop, ask row / describe strip, stem explore.
- **Library:** import audio, add from a link (YouTube / SoundCloud / direct, needs the local service), play, delete (with its moments), analyse locally (opt-in, rights confirmed in place), analysis status.
- **My Moments:** saved passages with tags and notes; play one, play a collection back to back, edit tags and note, remove. Collections: chills, home, melodies.
- **Discover:** suggestions from the personal ranker once a song is analysed and a moment saved; *I like it* / *Not for me* are stored as ratings and re-rank the list. Moments you return to can be saved or dismissed.
- **My Music DNA:** TraitRing + TraitRow. Shares come **only from qualities you named on saved moments**. Expand a trait to play its passages or *Correct* (remove that label from a moment). Learning switch, profile export.
- **Settings:** private listening insights, automatic analysis, volume, clear listening history, export profile.
- **Feature analysis:** service health, analysis windows with every measured value, active-learning queue, research baselines, held-out ranking. The full plots are in the research studio (`http://127.0.0.1:8765/studio`).
- **Implicit attention:** optional. User-initiated replays and loops may create attention hints. The player never records microphone audio or OS-level volume.

## Research separation

Detailed audio features, spectrogram-like analysis, acoustic plots, embeddings and held-out evaluation belong to the **Python research workflow**, not the listener UI:

```bash
pip install matplotlib  # optional, for images
python -m musicdna.experiments.acoustic_explorer public/demo.wav --out research-output
```

Outputs: `features.csv`, `segments.json`, and optional time-aligned acoustic plots. This uses the same `librosa` extractor as the API. The M3 contrastive personal ranker resides at `src/intelligence/personalize.ts`; the optional deep CLAP encoder requires **separately licensed local checkpoint weights**.

## Verify

```bash
npm test
npm run test:model
python -m pytest -q tests/python
npm run build
```

See `docs/ACCEPTANCE.md` for manual browser checks. `npm test` covers the Vue app's sources (routes, components, no Dexie in components, honest copy) and the framework-free rules in `src/core` (playback, listening log, DNA, Discover, diagnostics).

## Privacy and rights

Listening events are opt-in; active feedback and saved moments are explicitly user-created. Your music and preferences are local to your browser; the research analyzer runs on localhost only, not a remote service. The profile export omits the audio files. A playback entitlement or user upload does not automatically grant permission for commercial music analysis, AI training, or generative conditioning.
