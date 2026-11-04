# `musicdna` — Python package

All Python for Music DNA lives here. The player (`index.html`, `src/`) only talks to it over HTTP via `service`.

## Layout

```
musicdna/
├── paths.py              project locations (demo audio, caches, corpus, outputs)
├── audio/                audio in, stems out
│   ├── beats.py          Beat This! beat grid (librosa fallback)
│   └── stems.py          Demucs / MIR stem separation
├── features/             per-window descriptors of a recording
│   ├── dsp.py            25-D librosa vector + interpretable descriptors
│   ├── structure.py      key, chords, rhythm, instruments, vocal expression, arrangement
│   ├── vocal.py          pYIN pitch: glide, sustain, vibrato, ornaments
│   ├── spatial.py        stereo width, correlation, balance
│   ├── embeddings.py     CLAP, MERT, DSP+deep fusion, weight-license gate
│   ├── spectral.py       STFT / mel / CQT data for plots
│   └── projection.py     PaCMAP 2-D projection of embeddings
├── preference/           learning what the listener likes
│   ├── implicit_pairs.py within-song pairs from saves, loops, rewinds, skips
│   ├── evaluation.py     behaviour aggregation, A-D ablation, evidence insights
│   ├── active_learning.py which passage/question to ask about next
│   ├── favorite_passages.py FAV-corpus reason taxonomy and passage contrast
│   └── emotion.py        personalised dynamic emotion baseline (DMER)
├── corpus/               research data
│   ├── coke_studio.py    60-song Coke Studio corpus: select, download, verify, load
│   └── feature_store.py  cached per-window features for the corpus
├── experiments/          runnable studies, each writes to research-output/
│   ├── pipeline.py       corpus -> features -> pairs -> R01, in one command
│   ├── r01.py            R01: vocal pitch vs general embeddings
│   ├── benchmark_suite.py older integration benchmark (synthetic tracks, see below)
│   └── acoustic_explorer.py feature CSV + plots for one recording
└── service/              localhost FastAPI the player calls
    ├── app.py, studio.py         HTTP routes
    ├── service.py, studio_service.py  orchestration behind the routes
    ├── repository.py             SQLite store
    ├── streaming.py              stream URL resolver / proxy
    └── templates/studio.html     research studio page
```

**Dependency rule:** each layer imports only from layers above it in this list: `audio` → `features` → `preference` → `corpus` → `experiments` / `service`. Nothing imports from `service`.

Tests: `tests/python/`. Notebook: `notebooks/`.

## Commands

```bash
pip install -r requirements.txt
python -m uvicorn musicdna.service.app:app --port 8765        # API for the player
python -m pytest -q tests/python                               # all Python tests

python -m musicdna.corpus.coke_studio select --per-season 4    # build song list
python -m musicdna.corpus.coke_studio download                 # ~380 MB, local only
python -m musicdna.corpus.feature_store                        # stems, dsp, spatial, vocal, clap
python -m musicdna.experiments.pipeline --profile music-dna-profile.json   # full R01 run
```

Add `--allow-nc-weights` to include MERT and `--lyrics` for Whisper transcripts.

## R01 pipeline

| Step | Module | Output |
| :--- | :--- | :--- |
| Corpus | `corpus.coke_studio` | `data/coke_studio/manifest.json` (committed); audio not committed |
| Vocal stem | `corpus.feature_store` `stems` | Demucs `htdemucs` vocals, 16 kHz FLAC |
| DSP | `features.dsp` | 25-D vector + loudness per 10 s window |
| Spatial | `features.spatial` | width, correlation, balance, per-band width, width movement |
| Vocal pitch | `features.vocal` | voicing, range, glide, velocity, sustain, vibrato, ornaments |
| CLAP | `features.embeddings` | 512-D LAION-CLAP |
| MERT | `features.embeddings` | 768-D MERT-v1-95M (CC BY-NC weights, opt-in) |
| Lyrics | `corpus.feature_store` `lyrics` | Whisper transcript of the vocal stem (optional) |
| Pairs | `preference.implicit_pairs` | preferred vs passed-over windows within a song |
| R01 | `experiments.r01` | `research-output/r01_report.json` |

Each system is a linear pairwise ranker tested on unseen songs, then unseen artists. The main metric is song-averaged pairwise accuracy with a bootstrap 95% CI. Louder-window and later-window baselines catch models that only learned loudness or position. Experiment D (learned temporal vocal encoder) waits for 500+ pairs. With fewer than 20 pairs across 3 songs the report says `insufficient_data`.

## Model weight licenses

Checked by `ModelLicenseManager` in `features/embeddings.py`, separately from code licenses:

- **CLAP**: Apache-2.0 weights. On by default.
- **MERT, MuQ**: CC BY-NC 4.0 weights. Blocked unless `--allow-nc-weights` or `MUSIC_DNA_ALLOW_NC_WEIGHTS=1`.
- **Essentia models**: CC BY-NC-SA 4.0. Blocked by default.

## Known overlaps still to merge

These do similar jobs in different places. They were left as-is to avoid changing results:

| Topic | Places | Note |
| :--- | :--- | :--- |
| Window length | `features.dsp` 12 s / 6 s hop, `preference.implicit_pairs` 10 s, `preference.evaluation` 5 s bins | Pick one grid |
| Listening behaviour | `preference.evaluation.ListeningBehaviorAggregator`, `preference.implicit_pairs`, `src/intelligence/personalize.ts` | Three readings of the same events |
| Vocal analysis | `features.structure` (rough pitch spread), `features.vocal` (pYIN) | Structure's version is not real pitch tracking |
| Audio loading | `features.dsp.load_audio_safely`, `corpus.coke_studio.load_audio` (ffmpeg) | |
| Preference evaluation | `preference.evaluation` (A-D ablation), `experiments.r01` | R01 tests on held-out songs/artists |
| Benchmark | `experiments.benchmark_suite` | Built on synthetic tracks with a planted vocal, so it confirms the code runs, not that preference is learned |
