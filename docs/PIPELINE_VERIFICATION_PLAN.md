# Pipeline verification plan (handoff)

Goal: prove every step of the research pipeline is correct on a few songs **before** the full corpus
feature build. Written 2026-11-04 for a fresh session.

## Current state
- Research code: `musicdna/` (see `musicdna/README.md`). Pipeline: `musicdna.experiments.pipeline.ResearchPipeline`
  = corpus -> feature stages (`stems, dsp, spatial, vocal, intonation, clap, mert, lyrics`) -> preference pairs -> R01 + R02.
- All parameters: `musicdna/config.py` + `configs/default.toml` (override with `--set section.field=value`).
- Player: Vue app at `/` (`src/`, layers in `src/README.md`); legacy player at `/legacy/original-player.html`.
- Data was **cleared** on purpose: no corpus features, empty service DB, empty `research-output/`.
  Kept: 60 songs in `data/coke_studio/audio/` + `data/coke_studio/manifest.json`, models in `~/.cache/huggingface`.
- MERT is approved by the user (CC BY-NC weights, research use, `trust_remote_code`). Hugging Face models load locally (`musicdna/local_models.py`).
- Servers that may be running: Vue dev on 5173 (user's) and 5174 (`VITE_MUSIC_DNA_SERVICE=http://127.0.0.1:8766`), analysis service on 8766.
  Port 8765 may hold an old, broken service the user started before the code moved; do not kill user processes.

## Rules for this work
- **Do not run the full corpus feature build** (`musicdna.corpus.feature_store` over all songs, or the pipeline on the corpus)
  until the user approves after this plan passes. Verify on 2-3 songs, preferably in memory or in a temp `FeatureStore` root.
- Keep the notebook in step with the pipeline (`tests/python/test_notebook.py` enforces a pipeline fingerprint); re-run it after pipeline changes.
- Explain each fix in a code comment with a concrete example. Plain, short reports to the user.
- Another Claude session may be editing `src/` concurrently: commit only your own files (`git add <paths>`, never `-A`).

## Steps and pass criteria
Pick 3 songs with different character, e.g. Garaj Baras (S1, `7rLxN41avhY`), Chaap Tilak (S7), Pasoori (S14).

1. **Corpus integrity.** `CokeStudioManifest.load().verify()` is clean; decoded duration (ffmpeg) matches manifest `duration_sec` within 1 s;
   review odd title parses (e.g. "Na Tutteya Ve" has artists "Season Opener").
2. **Decoding and alignment.** Mono 22.05 kHz, stereo 44.1 kHz and 16 kHz decodes of the same file have the same length in seconds (+-10 ms)
   and zero lag between them (cross-correlation). Report AAC priming/offset if any.
3. **Window grid and context.** For each stage, row count == `WindowGrid.windows(duration)` count; context clips start/end where
   `context_span` says; first/last windows clipped correctly.
4. **Vocal stems (Demucs).** Vocal stem length and lag vs the mix are 0 (cross-correlation on a vocal-heavy passage). Export 3 short
   vocal-stem clips per song to a scratch folder for the user to **listen-check** (leakage, artefacts).
5. **Singing gate.** Export clips of frames *kept* vs *dropped* (`buried_under_accompaniment`) for listen-checking; report kept fraction per
   song and how it changes at -12 / -15 / -20 dB.
6. **Pitch (pYIN).** Synthetic tests pass; on real stems report octave-jump rate (frame-to-frame jumps near 12 st) and voiced fraction;
   plot contour over 30 s with gate marks.
7. **Tonic.** Ask the user (or find reliable sources) for the Sa of 5-10 corpus songs; add to `data/coke_studio/tonic_annotations.json`
   (`{"<video_id>": <Hz>}`); report detection error in cents (pass: median <= 25 cents) and confidence.
8. **Intonation / held notes.** Overlay held notes, slides and tonic grid on the contour for one passage; sanity-check numbers by ear.
9. **DSP and spatial.** Spot-check values against direct librosa/numpy computations on one window; confirm pre/post-roll only changes
   edge-sensitive features.
10. **Embeddings.** CLAP and MERT are deterministic (same input -> same vector), tail windows not padded, shapes 512/768.
11. **Player -> pairs alignment (most important).** In the real app, import the *exact* corpus file, save a moment at a known time and
    loop/skip at known times (Playwright), export the profile, build pairs, and confirm the pair windows land on the same audio in the
    corpus features (time offset between browser playback and ffmpeg decode < 50 ms). Decide how to guarantee the player file == corpus file
    (title matching alone is not enough).
12. **Experiments dry run.** Using real feature files for 3 songs and synthetic pairs with a planted signal, R01 and R02 must recover the signal;
    with random pairs they must report ~0.5 and `no clear difference`.

Deliver: a short report (pass/fail per step, numbers, listen-check files), fixes committed with tests, notebook re-run.
Then ask the user before the full feature build.
