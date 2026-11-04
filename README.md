# Music DNA Player · M3.1 — Original UI restored

**The supplied `reference/music-dna/player/index.html` is the canonical visual specification.** The actual running `index.html` keeps its **exact CSS**, responsive layout, waveform selection toolbar, playback bar, My Moments rows, Discover rows, and circular Music DNA ring/trait/evidence visuals. **No replacement React player is shipped.** The prototype's simulated playback and fabricated artist/trait data are replaced by real audio controls, persistent listener data, and cautious personal insights.

## Run

Requires **Node 20.19+** and a browser that can play the imported audio formats.

```bash
npm install
npm run dev
```

Open the local Vite address (typically `http://localhost:5173`). The included **original, 32-second WAV recording** makes the player immediately usable without importing music.

For authorized local music analysis, run the Python service in a second terminal:

```bash
python -m venv .venv
source .venv/bin/activate       # Windows: .venv\\Scripts\\activate
pip install -r requirements.txt
python -m uvicorn musicdna.service.app:app --host 127.0.0.1 --port 8765
```

In **Library**, import MP3/WAV or other browser-supported audio; press **Analyze locally** only if you have the necessary analysis rights. Analysis is opt-in. Original recordings remain in the browser's IndexedDB; temporary analysis copies sent to your own localhost Python service are removed after processing. Streamed tracks are **not** assumed to be analyzable.

## What works in the original UI

- **Player:** real WaveSurfer media playback, actual waveform-derived bars, seek, volume, drag-to-select, save, loop, optional describe feedback.
- **My Moments:** the original collection/list design; saved passages, tags and notes are stored with their exact recording. Play a passage or play the collection consecutively.
- **My Music DNA:** the **original circular ring**, trait chips, expandable traits, playback evidence and privacy control. No fake traits. Ring shares are computed **only from musical qualities explicitly named in saved moments**, not AI-derived emotions. The portrait starts empty and develops with real annotations. Correct a trait by removing its label from a particular moment.
- **Discover:** original row/chip styling; suggests new passages only after analysis and positive examples. Likes/dislikes update the local M3 ranking model. No unsupported emotion claims.
- **Implicit attention:** optional and **off by default**. User-initiated replays and loops may create attention candidates. Automatic loop cycles do not independently prove preference. The player never records microphone audio or OS-level volume.

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

See `docs/ACCEPTANCE.md` for manual browser checks. The source-level design regression tests, five M3 model tests, and four Python analysis tests passed in the build environment. **End-to-end live Vite/browser runtime remains unverified:** dependency downloads and Chromium navigation were blocked here. Please run `npm install && npm run build` and acceptance checks locally before relying on it.

## Privacy and rights

Listening events are opt-in; active feedback and saved moments are explicitly user-created. Your music and preferences are local to your browser; the research analyzer runs on localhost only, not a remote service. The profile export omits the audio files. A playback entitlement or user upload does not automatically grant permission for commercial music analysis, AI training, or generative conditioning.
