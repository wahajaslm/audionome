# Upgrade Music DNA with trained, licensed models

**Bottom line:** Every analysis in the app has a clear 2024-2026 upgrade. For about half of them, the best option is also commercial-safe:

- Commercial-safe and best overall: **Beat This!** (beats/tempo), **BTC** (chords), **PaCMAP** (map), better fusion, and all the taste-learning upgrades.
- Non-commercial only: the best encoders (**MuQ**, MERT), the best key model (**S-KEY**), the best structure model (**SongFormer**) and the best stem models.
- Weakest commercial area: **stem separation**. Almost no strong separation weights have a clear commercial licence.
- Two fixes to make now:
  - The licence registry lists **MERT as Apache-2.0**. MERT's weights are **CC BY-NC 4.0**.
  - The HF checkpoint `laion/larger_clap_music` **returns near-constant embeddings**. Swap it for `laion/larger_clap_music_and_speech`.
- Recommended setup: **commercial-safe defaults**, with non-commercial models as **opt-in downloads** behind the existing ModelLicenseManager.

Licences were checked against GitHub and Hugging Face on 2026-11-03. Rows marked **(unverified)** were not confirmed from a primary licence text. This is not legal advice.

---

## Main summary table

| Analysis | Current | Best commercial-safe | Best non-commercial | Expected gain |
|---|---|---|---|---|
| Tempo / beats | librosa beat tracker, one global tempo | **Beat This!** (MIT code + weights, small model ~8 MB) | **Same** | Beat F1 89.1, downbeat F1 78.3 on GTZAN. Adds downbeats, bars and a local tempo curve. |
| Key | Krumhansl template on mean chroma | **No trained model verified.** Keep the template but run it per section and beat-synced, with a confidence score. | **S-KEY** (code MIT, weights non-commercial) | S-KEY scores 74.4 on GTZAN vs 67.9 for madmom's key CNN. No librosa baseline was found. |
| Key, South Asian music | Major/minor only | Tonic (Sa) plus a tonic-normalised pitch histogram, written in-house | Essentia `TonicIndianArtMusic` (AGPL) | 90% tonic accuracy on clean clips (small third-party test). Avoids forcing "C major" on drone-based music. |
| Chords | Cosine match to 24 triad templates | **BTC** (MIT, weights in repo; weight licence inferred) + beat-synced Viterbi smoothing | **Same** (the large-vocab BTC has 170 classes) | Big jump from templates to any trained model. BTC majmin 0.805 on uspop2002. The field has plateaued above that. |
| Structure | Fixed 12 s windows, no labels | **allin1** (MIT code; weights unverified; uses Demucs) | **SongFormer** (depends on MuQ weights, which are CC BY-NC) | From no labels to intro/verse/chorus. Harmonix ACC: SongFormer 0.807, allin1 0.740. |
| Stem separation | Demucs htdemucs / 6s + HPSS fallback | **Mel-RoFormer vocals** (`KimberleyJSN/melbandroformer`, MIT tag, 870 MiB) + htdemucs for the rest (**weights unclear** per its author) | **BS-RoFormer vocals** (viperx, 609 MiB) + **SCNet XL IHF** 4-stem (204 MiB) | Vocals ~+2.6 dB SDR (10.87-10.98 vs 8.24). 4-stem average 10.08 vs 9.00 dB. |
| Instrument guessing | Hand-written spectral heuristic | **PANNs CNN14** (weights CC BY 4.0, 327 MB; MobileNetV2 is 21 MB) + **CLAP zero-shot** for harmonium/dholak | Small probe on **MuQ** embeddings, trained on a few hundred labelled clips | From no learned timbre model to 527 AudioSet classes, including Sitar, Tabla and Flute. |
| Vocal detection | Not dedicated | Vocal stem energy + PANNs "Singing" probability, smoothed | **Same**, using the stronger RoFormer vocal stem | Older dedicated models reach 91.8-94.2% on Jamendo. Separate-then-detect is simpler and current. |
| Embeddings (similarity) | LAION-CLAP | **MATPAC music** (Apache-2.0, safetensors, 342 MB) | **MuQ** (CC BY-NC, safetensors, 1.33 GB) | MARBLE average: MuQ 77.0 vs MERT 74.4. MATPAC++ beats MERT on NSynth (79.0 vs 72.6). |
| Embeddings (text search) | LAION-CLAP | **LAION-CLAP** `larger_clap_music_and_speech` (Apache-2.0) or the original CC0 music `.pt` | **MuQ-MuLan** (CC BY-NC, 2.65 GB) | Fixes the collapse bug. MuQ-MuLan zero-shot tagging ROC-AUC 79.3. |
| DSP + deep fusion | sqrt(0.7)·deep + sqrt(0.3)·DSP | Z-score DSP features, separate views, late fusion, learned projection from likes | **Same** | Stops a few high-variance DSP features dominating. Enables "similar because of rhythm". |
| 2D map | PCA | **PaCMAP** (Apache-2.0); UMAP (BSD-3) when new points must be added without refitting | **Same** | Keeps local and global layout. Less sensitive to settings than UMAP or t-SNE. |
| Dynamic emotion | Home-made dual-scale attention on hand-crafted features; tested on synthetic tracks | Frozen MATPAC or CLAP frames + small temporal head, trained on **your own labels** | MuQ or MERT frames + head trained on DEAM; or **Music2Emo** | Realistic DEAM target: arousal CCC ~0.39, valence ~0.10. Current synthetic scores do not compare. |
| Favorite-passage reasons | Keyword matching | **`deberta-v3-large-zeroshot-v2.0-c`** (MIT, commercial-friendly training data) | **`deberta-v3-large-zeroshot-v2.0`** (non-"c") | Macro F1 0.622 (c) vs 0.676 (non-c) on the authors' tests. |
| Highlight detection | Passage-vs-track contrast | Structure labels + repetition + loudness build-up + in-app replay signals | Same, with SongFormer labels | FAV listeners cite energy gain 14x more than energy drop. |
| Taste learning | Cosine nearest example | **Bayesian logistic regression** on frozen embeddings, with a population prior | **Same** (your own code, no licence issue) | Calibrated probabilities plus uncertainty. No benchmark exists. This is reasoning, not a measured result. |
| Active learning | TROMPA-inspired mix | **TypiClust-style** picks for the first ~15 labels, then uncertainty + diversity, with 1 in 5 random | **Same** | At low budgets, typical examples beat uncertainty picks. |
| Taste insights | Templates | Claims built from statistics (effect size, CI, supporting passages), with abstention | **Same**; optional phrasing by Music Flamingo (non-commercial) | Every sentence becomes checkable. Weak evidence leads to "not enough evidence yet". |

---

## What to do first

Ordered by impact for effort.

1. **Fix the MERT registry entry.** Change it to "CC BY-NC 4.0 weights, Apache-2.0 code". Minutes.
2. **Check which CLAP checkpoint you load.** If it is `laion/larger_clap_music`, switch to `laion/larger_clap_music_and_speech`. Same size and architecture. ([mteb #5069](https://github.com/embeddings-benchmark/mteb/issues/5069))
3. **Z-score the 25 DSP features** before fusion. A one-line change.
4. **Replace PCA with PaCMAP.** Set `init="pca"` and a fixed `random_state`. Small change, Apache-2.0.
5. **Add Beat This!** `pip install beat-this`, ~8 MB, runs on CPU. You get downbeats, a local tempo curve and a beat grid for everything else.
6. **Upgrade taste learning in TypeScript.** Bayesian logistic regression, TypiClust cold start, 1 in 5 random queries. No models or licences needed.
7. **Make insights evidence-based.** Each sentence needs a claim record. Abstain when evidence is weak.
8. **Replace reason keywords** with the DeBERTa "-c" zero-shot classifier.
9. **Replace the instrument heuristic** with PANNs plus CLAP zero-shot prompts.
10. **Add BTC chords and allin1 structure.** Both are beat-synced to the Beat This! grid.
11. **Add a RoFormer vocal model** as a background job. Cache the stems.
12. **Retrain emotion on embeddings** and evaluate on real human labels.
13. **Add opt-in non-commercial models**: MuQ, S-KEY, SongFormer.

---

## Analysis details

### Beats, tempo, key, chords, structure

**Beats and tempo**
- Beat This! (ISMIR 2024) needs no DBN post-processing. GTZAN beat F1 is 89.1 and downbeat F1 is 78.3 ([arXiv 2407.21658](https://arxiv.org/html/2407.21658)).
- The README says the code **and** published weights are MIT ([beat_this](https://github.com/CPJKU/beat_this)).
- Its weak spot is expressive or classical timing: SMC beat F1 is 62.7.
- Local tempo = 60 / inter-beat interval. This fixes the "single global tempo" limit.
- Avoid madmom's pretrained models. They are **CC BY-NC-SA 4.0** ([madmom LICENSE](https://github.com/CPJKU/madmom/blob/main/LICENSE)). Its DBN *code* is fine.

**Key**
- S-KEY (ICASSP 2025) MIREX scores: GTZAN 74.4 vs 67.9 for madmom; GiantSteps 72.1 vs 71.0 ([arXiv 2501.12907](https://arxiv.org/html/2501.12907)).
- S-KEY weights are **non-commercial research only** ([deezer/skey](https://github.com/deezer/skey)).
- No commercial-safe trained key model was verified. STONE's licence is unclear.

**Key for qawwali and Coke Studio**
- Show "Tonic (Sa)" plus a scale estimate, not major/minor.
- Essentia's tonic tool scored 90% on clean clips and 59% on degraded audio. This is a small third-party test ([twelveswaras PR #21](https://github.com/twelveswaras/twelveswaras/pull/21)).
- Essentia and compIAM are **AGPL-3.0** ([Essentia](https://github.com/MTG/essentia), [compIAM](https://github.com/MTG/compIAM)).
- Hide chords on drone-heavy tracks, or gate them by confidence.

**Chords**
- BTC ships `btc_model.pt` (maj/min) and a 170-class large-vocabulary model in an MIT repo ([BTC-ISMIR19](https://github.com/jayg996/BTC-ISMIR19)).
- On uspop2002: BTC majmin 0.805. A 114K-parameter Mamba model matches it, but the authors call the gaps "not likely to be statistically significant" ([arXiv 2601.02101](https://arxiv.org/pdf/2601.02101)).
- ChordFormer reports +6% class-wise accuracy, but its repo has **no licence file**. Do not use it ([repo](https://github.com/mwaseemrandhawa/ChordFormer)).

**Structure**

| Model | Harmonix ACC | HR.5F | Licence |
|---|---|---|---|
| SongFormer | **0.807** | 0.696 | Code CC-BY 4.0. Needs MuQ (CC BY-NC) + MusicFM |
| allin1 | 0.740 | 0.596 | Code MIT. Weights unverified |
| Gemini 2.5 Pro | 0.748 | 0.423 | Cloud only, so not local |

Source: [SongFormer README](https://github.com/ASLP-lab/SongFormer).

- allin1 also gives beats, downbeats and tempo in one pass. It has ~300K parameters ([all-in-one](https://github.com/mir-aidj/all-in-one)).
- allin1 was last updated in May 2024. Treat it as unmaintained.
- allin1 runs Demucs internally, so the Demucs weight question also applies (see stems).
- SongFormer's scripts target CUDA. On a 16 GB Mac, run it as an offline batch job or skip it.
- ChordMiniApp (MIT) already bundles SongFormer, BTC and others. It is a useful reference integration ([ChordMiniApp](https://github.com/ptnghia-j/ChordMiniApp)).

### Stems, instruments, vocals

**Stem separation**

| Model | Score | Size | Weight licence |
|---|---|---|---|
| htdemucs (current) | 9.00 dB MUSDB avg; vocals 8.24 Multisong | 80 MiB | **Unclear**, says its author |
| htdemucs_6s (current) | vocals 8.05 | 52 MiB | "Likely CC-NC-BY", says its author |
| SCNet XL IHF | 10.08 dB MUSDB avg | 204 MiB | MUSDB-only training, so research-data concern (unverified) |
| BS-RoFormer (viperx) vocals | 10.87 vocal SDR | 609 MiB | No licence found (unverified) |
| Mel-RoFormer (KimberleyJSN) vocals | 10.98 vocal SDR | 870 MiB | **MIT tag on HF** |

Sources: [Demucs README](https://github.com/adefossez/demucs/blob/main/README.md), [ZFTurbo pretrained models](https://github.com/ZFTurbo/Music-Source-Separation-Training/blob/main/docs/pretrained_models.md), [HF KimberleyJSN](https://huggingface.co/KimberleyJSN/melbandroformer).

- The Demucs author writes: "The license of the weights is not clear." The current default is therefore **not clearly commercial-safe either**.
- Only the KimberleyJSN Mel-RoFormer carries an explicit permissive weight tag. Its training data is still of unknown origin.
- RoFormer models are slow. One report gives about 1:49 per track on an M3 Max ([discussion #133](https://github.com/nomadkaraoke/python-audio-separator/discussions/133)). Run them in the background and cache.
- `mlx-audio-separator` runs these models natively on Apple Silicon. The full set is 2.51 GiB, so download only what you use ([HF](https://huggingface.co/ssmall256/mlx-audio-separator)).
- Wrapper code is MIT: `python-audio-separator` and ZFTurbo MSST.
- Harmonium, sitar and flute land in "other". AudioSep (MIT code; weights unverified) can try text-queried stems such as "harmonium" ([AudioSep](https://github.com/Audio-AGI/AudioSep)).

**Instruments**
- AudioSet labels include Sitar, Tabla, Flute, Accordion, Harmonica, Organ, Drum kit, Singing and Music of Bollywood. There is **no Harmonium or Dholak** label ([PANNs labels](https://github.com/qiuqiangkong/audioset_tagging_cnn/blob/master/metadata/class_labels_indices.csv)).
- PANNs weights are **CC BY 4.0**. Sizes: Cnn14 327 MB, MobileNetV2 20.8 MB ([Zenodo](https://zenodo.org/records/3987831)).
- EfficientAT reaches 0.478 mAP with small CNNs. Code is MIT; weights are unverified ([EfficientAT](https://github.com/fschmid56/EfficientAT)).
- Use CLAP zero-shot prompts for "harmonium", "dholak" and "qawwali clapping". Calibrate on a few labelled clips.
- Essentia's MTG-Jamendo instrument model (87 classes) is **CC BY-NC-SA** and needs an AGPL library ([Essentia models](https://essentia.upf.edu/models.html)).

**Vocal detection**
- Threshold the vocal stem's energy relative to the mix. Use hysteresis and a 200-500 ms median filter. Cross-check with the PANNs "Singing" class.
- Watch for qawwali hand-claps leaking into the vocal stem.

### Embeddings, fusion, map

| Model | MARBLE / key score | Weights licence | File, size | Loads safely? |
|---|---|---|---|---|
| MuQ | avg **77.0** | CC BY-NC 4.0 | safetensors, 1.33 GB | Yes, via the `muq` package |
| MuQ-MuLan (text + audio) | ROC-AUC 79.3 | CC BY-NC 4.0 | `.bin`, 2.65 GB | Pickle |
| MERT-v1-95M / 330M | avg 74.4 | **CC BY-NC 4.0** | `.bin`, 378 MB / 1.26 GB | Pickle + remote code |
| MATPAC music | NSynth 79.0 (MATPAC++) | **Apache-2.0** | safetensors, 342 MB | Needs remote code; vendor it |
| MusicFM (FMA checkpoint) | avg 75.4 | MIT tag; GitHub says NOASSERTION (**unverified**) | `.pt`, 1.32 GB | Pickle |
| LAION-CLAP HF | — | Apache-2.0 | `.bin`, 615-776 MB | Pickle, standard class |
| LAION-CLAP original music `.pt` | — | CC0-1.0 | 2.35 GB (includes optimiser state) | Pickle |
| CLaMP 3 | — | MIT, but needs MERT at run time | ~2.5 GB | Not cleanly commercial |
| OMAR-RQ | strong on chord/pitch | CC BY-NC-SA; **AGPL code** | 2.33 GB | Avoid |
| M2D-CLAP | — | Evaluation-only licence | — | Avoid |

Sources: [MuQ paper](https://arxiv.org/html/2501.01108), [MATPAC++](https://arxiv.org/html/2508.12709), [HF MERT](https://huggingface.co/api/models/m-a-p/MERT-v1-95M), [HF MATPAC](https://huggingface.co/api/models/auriankelen/matpac_music), [OMAR-RQ](https://github.com/MTG/omar-rq), [M2D licence](https://github.com/nttcslab/m2d/blob/master/LICENSE.pdf).

- **CLAP bug:** `larger_clap_music` text embeddings have a mean pairwise cosine of 0.9993. Working checkpoints score 0.18-0.29. It reproduces across transformers versions, so the checkpoint itself is at fault ([mteb #5069](https://github.com/embeddings-benchmark/mteb/issues/5069)).
- CLAP text search for "build-up" will be weak. These models learn from track-level captions. Combine text search with RMS slope and onset density.
- Fusion: keep separate indexes (timbre, harmony, rhythm) and let the UI change the weights.
- Multi-layer: average a few middle layers for harmony. Late layers carry genre.
- Map: PaCMAP keeps both local and global structure ([JMLR 2021](http://jmlr.org/papers/volume22/20-1061/20-1061.pdf)). Use UMAP `transform()` so new songs do not reshuffle the map.

### Emotion and favorite passages

**Dynamic emotion**
- The PDMER paper (AAAI 2025) reaches only **arousal CCC 0.377, valence CCC 0.092** on DEAM ([arXiv 2412.19200](https://arxiv.org/html/2412.19200)). Dynamic emotion is still hard.
- The app's near-perfect synthetic scores only test plumbing. Use real labels, split by track and by listener.
- PDMER code is Apache-2.0 but ships no weights. It uses ImageBind, whose licence is **unverified** ([repo](https://github.com/Littleor/Personalized-DMER)).
- Music2Emo r2 (valence/arousal): DEAM 0.518/0.623, EmoMusic 0.651/0.762. Its card says Apache-2.0, but it is built on MERT (CC BY-NC). Its commercial status is **unclear** ([HF](https://huggingface.co/amaai-lab/music2emo)).
- Keep chroma and key features next to embeddings. This hybrid generalised best across datasets ([arXiv 2510.04688](https://arxiv.org/abs/2510.04688)).
- **Training data trap:** DEAM is CC BY-NC-SA. A model trained on it is non-commercial in practice. GlobalMood and Memo2496 show CC licences, but these may cover only the papers (**unverified**).
- No dataset covers qawwali or Pakistani pop. Expect domain shift.
- A per-listener valence/arousal offset is a strong, simple baseline for personalisation.

**Favorite passages**
- FAV listeners cite melody (34.2%), texture (27.6%) and harmony (27.2%) most often. They cite energy gain 14x more than energy drop ([ISMIR 2023](https://ismir2023program.ismir.net/poster_114.html)).
- The FAV corpus has **no licence** and contains commercial recordings. Use it only for private evaluation ([FAV page](https://www.ethanlustig.com/favcorpus.html)).
- DeBERTa-v3 is English-only. Urdu or Roman Urdu reasons need a multilingual model (inference).
- In-app replay, seek and loop events are a clean first-party "most replayed" signal.

### Taste learning, active learning, insights

**Taste learning**
- Use Bayesian logistic regression with a Laplace approximation. Use population weights as the prior.
- The variance it produces drives both active learning and insight abstention.
- Linear probes on frozen pretrained features work well with few labels ([arXiv 2409.07730](https://arxiv.org/html/2409.07730)).
- Treat implicit signals as weighted soft labels. Learn each event type's weight from how often it agrees with explicit likes (the Deezer Beta-posterior idea; [UMAP 2025](https://research.deezer.com/publication/2025/06/16/umap-sguerra.html)).
- A passage the user never reached is unlabelled, not disliked.
- Count seek-to as positive only if the user then keeps listening.

**Active learning**
- TROMPA-MER found **random selection a strong baseline**. Gains appeared only late ([Gómez-Cañón et al. 2022](https://d-nb.info/1274808243/34)).
- At low budgets, TypiClust (the most typical point per cluster) beats uncertainty methods ([ICML 2022](https://proceedings.mlr.press/v162/hacohen22a/hacohen22a.pdf)).
- Add the two things TROMPA used that the app lacks: **class balancing** and a **population-disagreement prior**.
- Ask for at most one passage per song per batch.

**Insights**
- Every sentence needs a record: feature, direction, effect size, CI, counts and supporting passage IDs.
- Test against the population baseline, not only liked vs disliked.
- Resample by song, and correct for multiple comparisons (Benjamini-Hochberg).
- Abstain when the CI crosses zero or the effect comes from only 1-2 songs.
- LLM self-reported confidence is not a usable abstention signal ([arXiv 2608.10008](https://arxiv.org/html/2608.10008)).
- Optional audio-language phrasing:

| Model | Licence | Fits 16 GB / 7 GB disk? |
|---|---|---|
| Qwen2-Audio-7B-Instruct | Apache-2.0 (HF). GitHub has no SPDX licence | MLX 4-bit port, roughly 4.5-5 GB (estimate). Tight on disk |
| Music Flamingo (8B) | NVIDIA non-commercial | No Mac port verified |
| Qwen2.5-Omni-3B | Qwen Research Licence (non-commercial) | Yes, roughly 2-3 GB at 4-bit (estimate) |

Sources: [HF Qwen2-Audio](https://huggingface.co/api/models/Qwen/Qwen2-Audio-7B-Instruct), [HF Music Flamingo](https://huggingface.co/nvidia/music-flamingo-hf), [Qwen2.5-Omni-3B LICENSE](https://huggingface.co/Qwen/Qwen2.5-Omni-3B/raw/main/LICENSE).

- Pass the model only the verified claim record. Reject any output that mentions a feature outside the record.
- Popular music QA benchmarks do not measure factual correctness ([arXiv 2511.05550](https://arxiv.org/abs/2511.05550)).

---

## If you open source the app

**Code licence and weight licence are separate**
- Your code licence (MIT or Apache-2.0) covers only your code.
- Each model's weights keep their own licence. Your MIT licence cannot relax a CC BY-NC weight licence.
- Apache-2.0 adds an explicit patent grant. MIT is shorter. Both suit commercial reuse.

**Non-commercial weights**
- **Do not bundle** CC BY-NC weights (MuQ, MERT, S-KEY, madmom models) in the repo or in release builds. Bundling would make a "commercially usable" repo misleading.
- **Runtime download is fine.** The user's machine fetches the weights from the original host, and the user accepts the licence.
- Show the licence name and a "non-commercial use only" note before download.

**AGPL dependencies**
- Essentia, compIAM and OMAR-RQ code are **AGPL-3.0**.
- If you import them and distribute the app, the combined app must be released under AGPL.
- AGPL also reaches network use. Running a hosted version triggers the obligation to share source.
- Personal local use carries no obligation.
- Safer path: write the needed algorithm yourself (for example, a tonic-normalised pitch histogram) or keep AGPL tools out of the default install.

**Weight-file safety**
- `.pt`, `.bin`, `.ckpt` and `.pth` files are pickle files. Loading an untrusted pickle can run arbitrary code.
- Prefer safetensors. MuQ and MATPAC ship it.
- Convert pickle weights to safetensors once, locally, then load with `use_safetensors=True`.
- On `torch>=2.6`, `weights_only=True` is the default. Keep it on.
- Avoid `trust_remote_code=True`. Instead, copy the modeling file into the repo (MERT, MATPAC) and pin the commit hash.
- Pin the download revision (commit hash) for every model.

**Recommended setup**
- **Default install:** only commercial-safe models.
- **Opt-in pack:** non-commercial models, downloaded at runtime behind a licence flag in ModelLicenseManager.
- Each registry entry should hold: code licence, weight licence, training-data caveat, verified (yes/no), source URL, file hash.
- Unverified entries should be treated as non-commercial until confirmed.
- **Fix now:** MERT entry is Apache-2.0 → change to **CC BY-NC 4.0 (weights)**, Apache-2.0 (code) ([HF MERT-v1-330M](https://huggingface.co/m-a-p/MERT-v1-330M)).
- Also tag CLaMP 3 and Music2Emo as non-commercial in practice, because both depend on MERT.

---

## Unverified licences

Treat these as non-commercial until you confirm them.

| Item | What is unclear |
|---|---|
| Demucs htdemucs / 6s weights | The author says it is unclear. 6s is "likely CC-NC-BY". |
| allin1 weights | No separate weight licence stated. Also runs Demucs. |
| BTC weights | In an MIT repo; MIT for the weights is inferred. |
| BS-RoFormer viperx, BS-RoFormer-SW | No licence found / "unknown". |
| SCNet XL IHF, MUSDB-only weights | Inherit MUSDB's research-only data terms (inference). |
| EfficientAT, PaSST, BEATs weights | Only code licences verified. |
| AudioSep checkpoint | Only the code (MIT) verified. |
| MusicFM | MIT tag vs GitHub NOASSERTION. MSD checkpoint has data-origin risk. |
| SongFormer checkpoint | Code is CC-BY 4.0. Checkpoint not verified, and MuQ dependency is CC BY-NC. |
| Music2Emo | Apache-2.0 card, but built on MERT (CC BY-NC). |
| STONE, crema bundled models | Not verified. |
| ImageBind (used by PDMER) | Not verified. |
| MS-CLAP | MS-PL (HF) vs MIT (GitHub). Both permissive. |
| Qwen2-Audio | HF says Apache-2.0. GitHub has no SPDX licence. |
| Audio Flamingo 3, SALMONN, MU-LLaMA | Base-LLM licence terms likely apply. |
| DEAM, PMEmo, GlobalMood, Memo2496 | DEAM from a secondary source. Others unconfirmed. |
| FAV corpus | No licence stated. |

---

## Disk and memory budget (~7 GB free, 16 GB RAM)

**Commercial-safe default set: about 2.5 GB**

| Model | Size |
|---|---|
| Beat This! small | ~8 MB |
| BTC | 2.9M parameters (small) |
| allin1 + htdemucs | ~80 MB + tiny model |
| Mel-RoFormer vocals | 870 MiB |
| MATPAC music | 342 MB |
| LAION-CLAP music_and_speech | 615-776 MB |
| PANNs CNN14 (or MobileNetV2) | 327 MB (or 21 MB) |
| DeBERTa-v3-large zero-shot | Size not checked |

**Non-commercial opt-in pack**
- MuQ (1.33 GB) **or** MuQ-MuLan (2.65 GB). Both together use ~4 GB of disk, which is too much alongside the default set.
- S-KEY: small.
- SongFormer: needs MuQ + MusicFM (~1.3 GB each). Heavy. Batch only.

**Avoid on this machine**
- The LAION original `.pt` (2.35 GB).
- The MERT-330M fairseq checkpoint (4 GB).
- Qwen3-Omni-30B.
- The full `mlx-audio-separator` set (2.51 GiB).

None of these models had measured Apple Silicon speed numbers in the sources. Test each one on MPS with `PYTORCH_ENABLE_MPS_FALLBACK=1`.

---

## Gaps in the evidence

- No source gives librosa baseline scores (Krumhansl key, template chords, `librosa.beat`) on the same benchmarks. The size of each gain over the current app is therefore not measured.
- No separation, structure or emotion model has been evaluated on qawwali or Coke Studio music.
- No pretrained Hindustani taal tracker with released weights exists. Beat This! fine-tuned on Carnatic data jumped from 27.6 to 66.8 downbeat F1 ([arXiv 2509.11241](https://arxiv.org/html/2509.11241v1)), so fine-tuning is the realistic route.
- The taste-learning ranking is engineering reasoning. No benchmark exists for single-user preference on frozen embeddings.
