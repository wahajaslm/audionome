# Music Structure and Theory Analysis: 2024-2026 State of the Art vs Current librosa Implementation

Current app baseline (from assignment): key = Krumhansl template on mean chroma; chords = cosine match of chroma frames to 24 maj/min triad templates; tempo = librosa beat tracker, single global tempo; structure = fixed 12 s windows / 6 s hop, no boundaries or labels.

Licence check method: GitHub API `license` field plus reading LICENSE / README licence sections directly (via `gh api`) on 2026-11-03. "Verified" = read in primary source. "Unverified" = not read.

## Q1. Best current models/libraries per task, with reported accuracy

### Takeaway
Clear upgrades exist for every task. Beat This! (beats/downbeats), All-In-One / allin1 (beats + downbeats + boundaries + labels in one pass), SongFormer (current best structure labels), S-KEY (key) and BTC / ChordFormer-style models (chords) all beat template-matching baselines. The commercially clean picks are Beat This! (MIT code and weights), allin1 (MIT code), BTC (MIT, weights in repo) and SongFormer's own code (CC-BY 4.0). SongFormer's backbone weights and S-KEY's weights are non-commercial.

### Cited Findings

**Beat / downbeat / tempo**
- Beat This! (Foscarin, Schlüter, Widmer, ISMIR 2024). It is a transformer that alternates frequency and time attention, trained with a shift-tolerant loss, and needs **no DBN post-processing**. — [arXiv 2407.21658](https://arxiv.org/abs/2407.21658)
- GTZAN test results: beat F1 **89.1**, downbeat F1 **78.3**. The prior best (Hung et al.) scored 88.7 / 75.6. The ~2M-param "small" variant reaches about the same F1. Downbeat CMLt continuity is lower (67.3 vs 71.5). — [arXiv HTML](https://arxiv.org/html/2407.21658)
- Weak spots: SMC beat F1 62.7. RWC Classical scores 77.1 beat / 66.3 downbeat. — [arXiv HTML](https://arxiv.org/html/2407.21658)
- Feeding Beat This! activations through madmom's DBN on SMC lowers F1 (0.627 to 0.576) but raises AMLt (0.610 to 0.656). — [SMC Blind Spot, arXiv 2605.12287](https://arxiv.org/html/2605.12287v1)
- `pip install beat-this`. Runs on CPU via `--gpu=-1`. Optional `--dbn` needs madmom from GitHub (the PyPI madmom only supports Python <3.10). Small checkpoints `small0-2` are about **8.1 MB** each. — [beat_this README](https://github.com/CPJKU/beat_this)
- A C++ port exists. — [beat_this_cpp](https://github.com/mosynthkey/beat_this_cpp)

**All-in-one (beats, downbeats, segments, labels)**
- All-In-One (Kim and Nam, WASPAA 2023). It uses Demucs-separated stems plus neighbourhood attention (NATTEN). — [arXiv 2307.16425](https://arxiv.org/abs/2307.16425)
- Harmonix Set results with about 300K params: beat F1 **.958**, downbeat F1 **.915**, segment HR.5F **.660**, label PWF **.738**. Prior bests: .954 (Beat Transformer, 9.3M params), .908 (SpecTNT-TCN), .558 / .712 (SpecTNT). — [arXiv HTML v1](https://arxiv.org/html/2307.16425v1)
- Outputs: beats, downbeats, tempo, and segments labelled from `allin1.HARMONIX_LABELS` (intro/verse/chorus/bridge/inst/outro/break/solo/start/end). The default `harmonix-all` model is an ensemble of 8 fold models. It can also export embeddings. — [all-in-one README](https://github.com/mir-aidj/all-in-one)
- Install: `pip install allin1` plus madmom from GitHub. The README says NATTEN auto-installs on macOS. Audio is loaded through Demucs. Default device is CUDA, otherwise CPU. Benchmark: 10 songs (33 min) in 73 s on an RTX 4090. No CPU timing is given. — [all-in-one README](https://github.com/mir-aidj/all-in-one)
- The repo was last pushed in **May 2024**. Treat it as unmaintained. — GitHub API `pushed_at` 2024-05-09 ([repo](https://github.com/mir-aidj/all-in-one))

**Structure segmentation and labels**
- SongFormer (ASLP-lab, 2025). It fuses multi-resolution self-supervised features (MuQ and MusicFM at 30 s and 420 s windows). It ships with the SongFormDB dataset and the SongFormBench benchmark. It outputs 8 classes; pre-chorus is mapped to verse for 7-class evaluation. — [SongFormer README](https://github.com/ASLP-lab/SongFormer)
- SongFormBench-Harmonix results (ACC / HR.5F / HR3F):

| Model | ACC | HR.5F | HR3F |
|---|---|---|---|
| SongFormer (HX+E+H+G) | **0.807** | 0.696 | 0.780 |
| TA (Zhang 2025) | 0.787 | 0.610 | 0.801 |
| LinkSeg | 0.780 | 0.630 | 0.762 |
| Gemini 2.5 Pro | 0.748 | 0.423 | 0.813 |
| All-In-One | 0.740 | 0.596 | 0.730 |

  Source: [SongFormer README](https://github.com/ASLP-lab/SongFormer)
- SongFormBench-CN (Chinese pop) ACC: SongFormer **0.891** vs All-In-One 0.834. — [SongFormer README](https://github.com/ASLP-lab/SongFormer)
- SongFormer is GPU-oriented. Benchmarks were run on an NVIDIA L40. The README says it runs "locally on single GPU", and the inference script is configured around `CUDA_VISIBLE_DEVICES`. It needs MuQ and MusicFM checkpoints. — [SongFormer README](https://github.com/ASLP-lab/SongFormer)
- An open-source app (ChordMiniApp, MIT) already bundles SongFormer, Beat-Transformer, Chord-CNN-LSTM, BTC and madmom. It is a useful reference integration. — [ChordMiniApp README](https://github.com/ptnghia-j/ChordMiniApp)

**Key**
- STONE (Deezer, ISMIR 2024) was the first self-supervised tonality estimator (ChromaNet, trained on 60k songs). It reached 79% key-signature accuracy vs 81% for the supervised SOTA. — [STONE arXiv 2407.07408](https://arxiv.org/pdf/2407.07408)
- S-KEY (ICASSP 2025) scales training to 1M songs. MIREX weighted scores:

| Dataset | S-KEY | madmom key CNN |
|---|---|---|
| FMAKv2 | 73.2 | 73.1 |
| GTZAN | 74.4 | 67.9 |
| GiantSteps | 72.1 | 71.0 |
| SWD | 90.4 | 87.7 |

  Source: [S-KEY arXiv 2501.12907](https://arxiv.org/html/2501.12907)
- `skey` Python package (Deezer). The README says a PyPI release is coming. It uses ChromaNet. — [deezer/skey](https://github.com/deezer/skey)

**Chords**
- BTC (ISMIR 2019) remains the common transformer baseline. The repo ships `btc_model.pt` (maj/min) and `btc_model_large_voca.pt` (170-class). — [BTC-ISMIR19](https://github.com/jayg996/BTC-ISMIR19)
- On uspop2002 (2026 Mamba paper, Table 1): CRNN root 0.8185, 435K params. BTC root 0.8202 / majmin 0.8051 / mirex 0.7531, 2.9M params. BMACE (Mamba) root 0.8212 with only 114K params. The authors say the differences are "not likely to be statistically significant". — [Yuan and Devaney, arXiv 2601.02101](https://arxiv.org/pdf/2601.02101)
- ChordFormer (Feb 2025) is a Conformer on CQT input. It reports a 6% gain in class-wise accuracy on large-vocabulary datasets. — [arXiv 2502.11840](https://arxiv.org/abs/2502.11840)
- Its official repo (`mwaseemrandhawa/ChordFormer`) is derived from music-x-lab's ISMIR2019 large-vocabulary code. — [ChordFormer README](https://github.com/mwaseemrandhawa/ChordFormer)
- A 2025 thesis finds a McFee-and-Bello-style CRNN "remains competitive with state-of-the-art". It points to a "glass ceiling" in ACR. — [Mackenzie, arXiv 2512.22621](https://arxiv.org/pdf/2512.22621); code: [PierreRL/AutomaticChordRecognition](https://github.com/PierreRL/AutomaticChordRecognition)
- Other 2025 work: consonance-based decomposed training for chord estimation. — [arXiv 2509.01588](https://arxiv.org/html/2509.01588v1)

### Inferences
- Chords are a plateaued field. Gains from BTC to ChordFormer or Mamba are a few points. The big jump for this app is going from chroma triad templates to any trained model (CRNN/BTC), plus HMM/Viterbi smoothing and beat-synchronous decoding.
- Beat This! fixes the "single global tempo" weakness directly. Per-beat timestamps give a local tempo curve (60 / inter-beat interval) and downbeats give bars.
- For structure, allin1 is the most practical CPU option today. SongFormer is more accurate (about +6.7 ACC points on Harmonix) but heavier and GPU-oriented.

### Gaps
- No primary source found that gives librosa baseline numbers (Krumhansl key, chroma-template chords, `librosa.beat`) on the same benchmarks. The size of the improvement over the current app is therefore not quantified.
- The ChordFormer paper's absolute WCSR numbers and its BTC comparison were not extracted.
- Beat This! paper gives no inference speed.
- No CPU or Apple-Silicon runtime numbers were found for allin1, SongFormer or Beat This!.

## Q2. pip-installability, CPU/Mac (Apple Silicon, 16 GB) suitability, model sizes

### Takeaway
Beat This! and S-KEY are small and easy on a Mac CPU. allin1 works on CPU, but it needs Demucs separation (slow on CPU) and a madmom install from GitHub. SongFormer is the heaviest: two foundation-model backbones and a GPU-oriented pipeline.

### Cited Findings
- Beat This!: `pip install beat-this`. Needs `rotary-embedding-torch`, `einops`, `soxr`. Small model about 8.1 MB; full model about 20M params. Forced CPU with `--gpu=-1`. — [README](https://github.com/CPJKU/beat_this); [paper](https://arxiv.org/html/2407.21658)
- allin1: `pip install allin1` plus `pip install git+https://github.com/CPJKU/madmom`. NATTEN auto-installs on macOS. Demucs is used for loading and separation. Model about 300K params (ensemble of 8). — [README](https://github.com/mir-aidj/all-in-one); [paper](https://arxiv.org/html/2307.16425v1)
- SongFormer: `pip install -r requirements.txt` from a git clone (not on PyPI). Needs MuQ and MusicFM checkpoints downloaded from Hugging Face. Scripts are configured for CUDA GPUs. — [README](https://github.com/ASLP-lab/SongFormer)
- madmom: the PyPI version only supports Python <3.10 and numpy <1.20, so install from GitHub. — [beat_this README](https://github.com/CPJKU/beat_this)
- skey: install from GitHub via poetry. PyPI release pending. — [deezer/skey](https://github.com/deezer/skey)
- BTC: clone the repo. Weights are included. Model is 2.9M params. — [BTC repo](https://github.com/jayg996/BTC-ISMIR19); [arXiv 2601.02101](https://arxiv.org/pdf/2601.02101)

### Inferences
- On a 16 GB Apple Silicon Mac, Beat This!, BTC and S-KEY should run comfortably on CPU or on PyTorch MPS. This is not benchmarked.
- allin1's Demucs step will likely dominate runtime on CPU.
- SongFormer's MuQ + MusicFM backbones are the most likely to strain 16 GB. Running it as an offline batch job, or skipping it, is safer.

### Gaps
- MuQ and MusicFM checkpoint sizes and RAM use were not verified.
- Whether NATTEN or SongFormer support MPS was not verified.

## Q3. Exact licences (code AND weights) and commercial safety

### Takeaway
Safe for commercial use: Beat This! (MIT code and weights), BTC (MIT, weights in repo), allin1 code (MIT), SongFormer's own code (CC-BY 4.0), crema (BSD-2), music-x-lab large-vocabulary code (MIT). Not safe for commercial use: madmom model files (CC BY-NC-SA 4.0), S-KEY weights (non-commercial research only), MuQ weights (CC-BY-NC 4.0, and SongFormer depends on them). Essentia and compIAM are AGPL-3.0. ChordFormer's repo has no licence file.

### Cited Findings

| Project | Code licence | Weights licence | Commercial? | Source |
|---|---|---|---|---|
| Beat This! | MIT | MIT ("code and the published model weights") | Yes. Training data copyright caveat noted. | [README](https://github.com/CPJKU/beat_this) |
| allin1 (All-In-One) | MIT | No separate weights licence in README (unverified) | Probably yes. Its madmom dependency is used for DBN code, not model files (inference). | [repo](https://github.com/mir-aidj/all-in-one) |
| madmom | BSD-style (source files) | **CC BY-NC-SA 4.0** (.npy/.pkl/.h5 model files) | Code yes; models **no** | [LICENSE](https://github.com/CPJKU/madmom/blob/main/LICENSE) |
| SongFormer | CC-BY 4.0 (LICENSE file) | Depends on MuQ (CC-BY-NC 4.0) and MusicFM | **No** while it depends on MuQ weights | [LICENSE](https://github.com/ASLP-lab/SongFormer) |
| MuQ | MIT | **CC-BY-NC 4.0** | No | [MuQ README](https://github.com/tencent-ailab/MuQ) |
| MusicFM | README shows MIT badge; GitHub API returns NOASSERTION | Released model trained on FMA (Creative Commons audio) to "avoid licensing complications" | Unclear (unverified) | [musicfm README](https://github.com/minzwon/musicfm) |
| S-KEY (`skey`) | MIT | **Non-commercial research only** (skey.pt) | No | [skey README](https://github.com/deezer/skey) |
| STONE | GitHub API: no licence detected | Unverified | Unclear | [deezer/stone](https://github.com/deezer/stone) |
| BTC-ISMIR19 | MIT | Weights committed in repo under MIT (inference) | Yes | [repo](https://github.com/jayg996/BTC-ISMIR19) |
| ChordFormer (official) | **No licence file** (all rights reserved by default) | Unverified | No, until a licence is added | [repo](https://github.com/mwaseemrandhawa/ChordFormer) |
| music-x-lab ISMIR2019 large-voca | MIT | Unverified | Code yes | [repo](https://github.com/music-x-lab/ISMIR2019-Large-Vocabulary-Chord-Recognition) |
| crema | BSD-2-Clause | Bundled (unverified separately) | Likely yes | [repo](https://github.com/bmcfee/crema) |
| Essentia | AGPL-3.0 | Varies per model (not checked) | Only if AGPL obligations are met | [repo](https://github.com/MTG/essentia) |
| compIAM | AGPL-3.0, with per-tool exceptions noted in files | Per tool | Only if AGPL obligations are met | [README](https://github.com/MTG/compIAM) |

- Beat This! adds a caveat: some training files are copyrighted or under limited CC licences, and users must assess their own case. — [README](https://github.com/CPJKU/beat_this)

### Inferences
- For a commercial or closed app: use Beat This! for beats, BTC for chords, and allin1 for structure.
- Avoid madmom's pretrained processors (key CNN, chord CNN, RNNDownBeat) and S-KEY in a commercial product. Using madmom's DBN *code* alone is fine.
- AGPL (Essentia, compIAM) matters if the app is served over a network. Running locally for personal use carries no obligation.

### Gaps
- allin1 weight licence is not stated separately. It is assumed MIT, but this is unverified.
- MusicFM's licence is ambiguous: the badges show MIT and Apache, and the API says NOASSERTION.
- STONE licence was not verified.

## Q4. Raga/tonic and taal methods for South Asian repertoire (qawwali, Coke Studio Pakistan)

### Takeaway
Western-trained models degrade on South Asian rhythm. Zero-shot Beat This! is *worse* than a classical bar-pointer model on Carnatic downbeats. Fine-tuning fixes it. For pitch, the right tool is tonic (Sa) detection plus raga-style pitch analysis, not major/minor key. Essentia's TonicIndianArtMusic is the practical tonic tool. compIAM (AGPL) bundles CompMusic tools.

### Cited Findings
- Carnatic meter tracking on the CMRf dataset (2025):

| Model | Beat F1 | Downbeat F1 |
|---|---|---|
| Beat This! zero-shot | 71.3 | 27.6 |
| Bar-pointer DBN baseline | 82.5 | 57.4 |
| Beat This! fine-tuned | **90.3** | **66.8** |
| TCN from scratch (best continuity) | 84.6 | 63.9 |

  Source: [Revisiting Meter Tracking in Carnatic Music, arXiv 2509.11241](https://arxiv.org/html/2509.11241v1)
- That paper covers Carnatic only: Ādi, Rūpaka, Miśra chāpu, Khaṇḍa chāpu. It does not cover Hindustani or tabla. — [arXiv 2509.11241](https://arxiv.org/html/2509.11241v1)
- The CompMusic Hindustani rhythm dataset has 151 two-minute excerpts with tāl annotations. This makes Hindustani fine-tuning possible. — [CompMusic thesis page](https://compmusic.upf.edu/phd-thesis-ajay); [ISMIR 2017 informed meter analysis](https://archives.ismir.net/ismir2017/paper/000093.pdf)
- compIAM (MTG, AGPL-3.0) includes `FTANetCarnatic` pitch extraction and `FourWayTabla` tabla stroke transcription. It has loaders for Saraga Hindustani/Carnatic, the Indian Art Music Raga dataset and the Tonic dataset. — [compIAM README](https://github.com/MTG/compIAM)
- Tonic identification survey: [Gulati et al., JNMR 2014](https://www.justinsalamon.com/uploads/4/3/9/4/4394963/gulati_tonicid_jnmr_14.pdf).
- One open-source project swapped compIAM's tonic for Essentia `TonicIndianArtMusic`:
  - Clean clips: 35/39 (90%) vs 34/39.
  - Degraded audio: 23/39 (59%) vs 18/39 (46%).
  - Essentia instances are stateful, so create a new one per call.
  - Caveat: small third-party benchmark. — [twelveswaras PR #21](https://github.com/twelveswaras/twelveswaras/pull/21)
- Raga recognition 2024-2026:
  - Explainable DL raga ID. — [arXiv 2406.02443](https://arxiv.org/pdf/2406.02443)
  - Identification and clustering of unseen ragas. — [arXiv 2411.18611](https://arxiv.org/pdf/2411.18611)
  - Older but standard: DeepSRGM sequence ranking. — [ISMIR 2019](https://archives.ismir.net/ismir2019/paper/000064.pdf)
- Tonic normalisation of chromagrams improves raga classifiers. — [Explainable DL raga ID](https://arxiv.org/pdf/2406.02443)
- Taal detection with classical onset/cycle methods covers Dadra, Rupak, Keherwa, Jhaptaal, Ektaal and Teentaal. — [arXiv 1611.05182](https://arxiv.org/pdf/1611.05182)
- MAML meta-learning has been used for low-resource tabla stroke transcription and tāla ID (from search summary; primary not read).

### Inferences
- For qawwali and Coke Studio material, show "Tonic (Sa)" plus an estimated scale or raga-like pitch-class set instead of forcing "C major / A minor". Tonic-normalised pitch histograms from a melody pitch track are better than mean chroma. Harmonium and drone defeat triad templates.
- Use Beat This! for beat positions. Treat downbeat/sam output as low-confidence on tabla/dholak-led tracks unless fine-tuned on CompMusic Hindustani data.
- Keherwa (8) and Dadra (6) map reasonably onto Western 4/4 and 6/8. Teentaal (16) and Rupak (7, which starts on khali) will break 3/4- or 4/4-assuming DBN meter priors.
- Chord labels on drone-heavy or modal material are often meaningless. Consider a confidence gate, or hide chords when the harmonic-change rate is low.
- No pretrained, permissively licensed *Hindustani taal* tracker was found. This would need fine-tuning.

### Gaps
- No 2024-2026 pretrained Hindustani/qawwali taal tracker with released weights was found.
- No evaluation of SongFormer, allin1, S-KEY or BTC on South Asian popular music was found.
- No primary source on qawwali-specific analysis.

## Q5. Innovative approaches (foundation-model features)

### Takeaway
The current frontier is self-supervised music foundation models used as feature extractors with light task heads. SongFormer (MuQ + MusicFM features) is the leading structure example. S-KEY/STONE show self-supervised key estimation can match supervised models without labels. Even general LLMs (Gemini 2.5 Pro) are now competitive on coarse boundaries (HR3F).

### Cited Findings
- SongFormer fuses short (30 s) and long (420 s) windows of MuQ and MusicFM features. It beats MusicFM-only and MuQ-only baselines (ACC 0.725 and 0.772 on Harmonix). — [SongFormer README](https://github.com/ASLP-lab/SongFormer)
- Gemini 2.5 Pro scores HR3F **0.813** on SongFormBench-Harmonix, the best of all methods on that metric. It scores only 0.423 at HR.5F. So it finds sections roughly but places boundaries poorly. — [SongFormer README](https://github.com/ASLP-lab/SongFormer)
- STONE / S-KEY use an equivariant self-supervised objective (pitch-shift / transposition) on unlabelled Deezer audio. — [STONE](https://arxiv.org/pdf/2407.07408); [S-KEY](https://arxiv.org/html/2501.12907)
- allin1 can export per-stem embeddings (`[4 stems, T, 24, 8 models]`) for downstream use. — [README](https://github.com/mir-aidj/all-in-one)
- Mamba (state-space) chord models match BTC with 1/25 the parameters. — [arXiv 2601.02101](https://arxiv.org/pdf/2601.02101)
- Fine-tuning a general beat tracker on a culture-specific dataset beats bespoke probabilistic models. — [arXiv 2509.11241](https://arxiv.org/html/2509.11241v1)

### Inferences
- A practical "innovative" path for this app: one shared feature backbone (e.g. allin1 embeddings or a permissive foundation model) feeding small heads for structure, key/tonic and chords. Fine-tune these heads on a small set of annotated South Asian tracks.
- Beat-synchronous everything is a cheap win: chords per beat, structure boundaries snapped to downbeats, key per section. It is easy once Beat This! or allin1 provides the beat grid.

### Gaps
- No permissively licensed (commercial-safe) music foundation model was verified. MuQ weights are NC. MERT's licence was not checked here. MusicFM's is ambiguous.
- MARBLE or other foundation-model benchmark numbers for beat, chord and key were not collected.
