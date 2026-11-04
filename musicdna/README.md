# `musicdna` — Python package

All Python for Music DNA lives here. The player (`index.html`, `src/`) only talks to it over HTTP via `service`.

## Layout

```
musicdna/
├── config.py             every tunable parameter (see "Parameters")
├── paths.py              project locations (demo audio, caches, corpus, outputs)
├── audio/                audio in, stems out
│   ├── io.py             the one audio decoder (ffmpeg)
│   ├── windows.py        the one analysis window grid
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
│   ├── signals.py        the one reading of listening events -> evidence per window
│   ├── implicit_pairs.py within-song pairs built from that evidence
│   ├── evaluation.py     behaviour summaries, behaviour-only AUC, evidence insights
│   ├── active_learning.py which passage/question to ask about next
│   ├── favorite_passages.py FAV-corpus reason taxonomy and passage contrast
│   └── emotion.py        personalised dynamic emotion baseline (DMER)
├── corpus/               research data
│   ├── coke_studio.py    60-song Coke Studio corpus: select, download, verify, load
│   └── feature_store.py  cached per-window features for the corpus
├── experiments/          runnable studies, each writes to research-output/
│   ├── pipeline.py       corpus -> features -> pairs -> R01, in one command
│   ├── r01.py            R01: vocal pitch vs general embeddings
│   └── acoustic_explorer.py feature CSV + plots for one recording
└── service/              localhost FastAPI the player calls
    ├── app.py, studio.py         HTTP routes
    ├── service.py, studio_service.py  orchestration behind the routes
    ├── repository.py             SQLite store
    ├── streaming.py              stream URL resolver / proxy
    └── templates/studio.html     research studio page
```

**Dependency rule:** each layer imports only from layers above it in this list: `config`/`paths` → `audio` → `features` → `preference` → `corpus` → `experiments` / `service`. Nothing imports from `service`.

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

## Parameters

All analysis parameters live in `config.py`, grouped into sections. `configs/default.toml` lists
every one with its default. Change them by editing that file, pointing `--config` (or
`MUSIC_DNA_CONFIG`) at another TOML file, or overriding single values:

```bash
python -m musicdna.experiments.pipeline --profile p.json --set windows.window_sec=10 --set windows.hop_sec=5
python -m musicdna.corpus.feature_store --set vocal.hop=160 --set vocal.vibrato_min_hz=5
```

| Section | Controls |
| :--- | :--- |
| `windows` | window length, hop, shortest tail window. One grid for every feature, signal and experiment |
| `audio` | analysis and stereo sample rates, max duration, Demucs model |
| `vocal` | pYIN rate/hop/range, vibrato band, ornament prominence and width, glide step limit |
| `spatial` | the 4 band edges for low/mid/high stereo width, FFT size |
| `signals` | overlap and "heard" thresholds, rewind/seek minimums, evidence weights |
| `ranker` | PCA size, regularization, minimum data, bootstrap samples, seed |

Cached corpus features are named by a hash of the sections they depend on
(`data/coke_studio/features/<song>/<stage>-<hash>.npy`, settings in `features/configs/<hash>.json`).
Changing the window recomputes DSP, spatial, vocal and embeddings but reuses stems and pitch contours.
Each pipeline run writes `research-output/r01_report_<hash>.json` with the full config inside.

The player's service reads the same config (`MUSIC_DNA_CONFIG` or `configs/default.toml`).

## Single implementations

| Job | Module | Replaced |
| :--- | :--- | :--- |
| Decode audio | `audio.io.load_audio` | `load_audio_safely`, corpus ffmpeg loader, 4 direct `librosa.load` calls |
| Window grid | `audio.windows.window_grid` | 12 s/6 s in DSP and the stream endpoint, 10 s in pairs, 5 s bins in evaluation |
| Listening evidence | `preference.signals.collect_evidence` | separate parsers in `evaluation` and `implicit_pairs` |
| Vocal pitch | `features.vocal` | rough pitch-spread in `structure`, estimated pitch in `spectral` |
| Preference model comparison | `experiments.r01` | A-D ablation in `evaluation`, synthetic `benchmark_suite` |

`src/intelligence/personalize.ts` still reads listening events itself: it runs in the browser and
cannot call Python.
