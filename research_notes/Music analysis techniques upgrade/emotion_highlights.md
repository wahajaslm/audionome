# Dynamic MER, Personalized MER, and Music Highlight / Favorite-Passage Detection (2024-2026)

Context: the app currently has (a) a home-made "Personalized-DMER inspired" model (numpy dual-scale attention over hand-crafted features, ridge-regression population prior, listener support-set adaptation) scored on synthetic tracks from one recording, and (b) a FAV-corpus-style favorite-passage module (keyword matching of reason text plus passage-vs-track acoustic contrast). Repertoire includes qawwali and Coke Studio Pakistan.

## Q1. Best dynamic (time-varying V/A) MER models and datasets; do foundation embeddings beat hand-crafted features?

### Takeaway
Self-supervised music embeddings (MERT, MERT2, MuQ) with small heads are the current default and clearly beat older baselines on static V/A regression. Dynamic (per-0.5 s) V/A is still hard: even the AAAI 2025 SOTA reaches only about 0.39 arousal CCC and 0.10 valence CCC on DEAM. The strongest embeddings carry non-commercial weight licenses.

### Cited Findings
- MARBLE benchmark (EmoMusic, 744 clips of 45 s, metric r2): MERT variants score valence r2 52.9-59.0 and arousal r2 69.9-76.3 — [MARBLE arXiv](https://arxiv.org/html/2306.10548)
- MERT2-30s reports valence r2 63.23 / arousal r2 80.01 on EmoMusic; prior best arousal was PupuJEPA-Huge at 78.50 (as summarized by search of the MERT2 model card) — [m-a-p/MERT-v2-30s](https://huggingface.co/m-a-p/MERT-v2-30s) (numbers not opened directly; verify)
- Music2Emo (2025, "Towards Unified MER across Dimensional and Categorical Models") uses MERT embeddings plus key/chord features, multitask + knowledge distillation, trained on MTG-Jamendo, DEAM, PMEmo, EmoMusic — [arXiv 2502.03979](https://arxiv.org/abs/2502.03979)
- Music2Emo reported r2 (valence / arousal): DEAM 0.518 / 0.623; PMEmo 0.547 / 0.794; EmoMusic 0.651 / 0.762. Weights/code card says Apache-2.0 — [HF amaai-lab/music2emo](https://huggingface.co/amaai-lab/music2emo)
- Music2Emo paper says adding musical features, multitask learning and distillation "significantly enhances performance" — [arXiv 2502.03979](https://arxiv.org/abs/2502.03979)
- Cross-dataset study (2025): MER models fail out-of-distribution due to genre dominance and dataset bias; best generalization came from combining Jukebox embeddings with chroma features and training on several datasets (EmoMusic, DEAM, PMEmo, WTC, WCMED) — [arXiv 2510.04688](https://arxiv.org/abs/2510.04688)
- PDMER (AAAI 2025) on DEAM dynamic labels (0.5 s): traditional DMER arousal CCC 0.39, valence CCC 0.104, arousal RMSE 0.202; baseline DAMFF arousal CCC 0.354, valence CCC 0.055 — [arXiv 2412.19200 HTML](https://arxiv.org/html/2412.19200)
- DEAM: 1,744 clips + 58 full songs, V/A every 0.5 s, has annotator IDs; license CC BY-NC-SA 4.0 (non-commercial) — [arXiv 2412.19200](https://arxiv.org/html/2412.19200); license per [Kaggle mirror](https://www.kaggle.com/datasets/imsparsh/deam-mediaeval-dataset-emotional-analysis-in-music) (secondary source)
- PMEmo: 794 songs, dynamic labels but only mean/std, no per-annotator data — [arXiv 2412.19200](https://arxiv.org/html/2412.19200)
- Memo2496 (Dec 2025): 2,496 instrumental tracks, dynamic V/A labels by 30 certified music specialists; DAMER model (mel + cochleagram dual-stream attention, curriculum pseudo-labels, style-anchored memory); "dataset and source code are publicly available"; CC BY-SA 4.0 shown — [arXiv 2512.13998](https://arxiv.org/abs/2512.13998) (CC BY-SA may be the paper's license, not the dataset's; verify)
- GlobalMood (2025): 1,180 songs from 59 countries, 2,519 annotators in US, France, Mexico, South Korea, Egypt; 988,925 ratings; V/A structure is shared across cultures but dictionary-equivalent emotion words diverge; fine-tuning on balanced data helps non-English contexts. No South Asian rater site — [arXiv 2505.09539](https://arxiv.org/abs/2505.09539)

### Inferences
- Replacing hand-crafted features with frozen MERT/MuQ frame embeddings plus a small temporal head is the most likely single accuracy gain. Expect static V/A r2 roughly 0.5-0.8 on standard sets.
- For dynamic V/A, target CCC rather than r2. Realistic DEAM-level targets are about 0.3-0.4 arousal CCC and around 0.1 valence CCC. The app's near-perfect synthetic scores are not comparable to any of this.
- Keep a few music-theory features (chroma, key) next to embeddings. Two 2025 papers found this hybrid helps, especially for cross-dataset transfer.
- None of the major datasets cover qawwali or Pakistani pop. Expect domain shift. GlobalMood's results suggest valence/arousal transfers better than emotion words.
- Commercial path: MERT and MuQ weights are CC-BY-NC (see Q5). LAION-CLAP (CC0) and Music2Emo (Apache-2.0 card, but built on MERT) need checking.

### Gaps
- No head-to-head study found comparing MERT/MuQ/CLAP vs hand-crafted features on dynamic DEAM with one protocol. Size of the gain on dynamic labels is unquantified.
- Music2Emo card was summarized as "dynamic"; the paper appears clip-level. Unverified.
- Music2Emo Apache-2.0 vs MERT CC-BY-NC dependency: unresolved whether the released checkpoint is commercially usable.
- EMOPIA (piano, 4-quadrant categorical), MuSe, Emo-Soundscapes: not re-checked in this pass. EMOPIA is categorical, not dynamic V/A.
- PMEmo license not found.

## Q2. What does Personalized-DMER (AAAI 2025) propose; are there newer personalized MER methods?

### Takeaway
PDMER uses frozen ImageBind audio features plus a small trainable adapter, a dual-scale attention transformer, and MAML meta-learning where each task is one annotator. It adapts from one support sample. The app's numpy re-implementation (hand-crafted features, ridge prior) keeps the idea but drops the pretrained encoder and the meta-learning.

### Cited Findings
- Paper: Zhang, You, Liu, Sun, Chen, "Personalized Dynamic Music Emotion Recognition with Dual-Scale Attention-Based Meta-Learning", AAAI 39(2):1629-1637 — [AAAI OJS](https://ojs.aaai.org/index.php/AAAI/article/view/32155)
- Method: dual-scale feature extractor; global features from frozen ImageBind, local features from a trainable ImageBind adapter (~2 conv + FC) on log-mel; fused as z = sigma(z_l + z_g); dual-scale attention transformer for short- and long-term dependencies — [arXiv 2412.19200](https://arxiv.org/html/2412.19200)
- Meta-learning: MAML with tasks built per annotator so a task has consistent perception — [arXiv 2412.19200](https://arxiv.org/html/2412.19200)
- Protocol: DEAM training on 1,000 clips with annotator IDs; test on the 58 full-length songs with individual annotator labels. PMEmo used only for non-personalized DMER (40 songs > 65 s) — [arXiv 2412.19200](https://arxiv.org/html/2412.19200)
- Support: 1 sample in training; 15 samples per task in evaluation (as reported in summary) — [arXiv 2412.19200](https://arxiv.org/html/2412.19200)
- PDMER results on DEAM: arousal CCC 0.377, valence CCC 0.092, arousal RMSE 0.236 — [arXiv 2412.19200](https://arxiv.org/html/2412.19200)
- Code: Apache-2.0; uses DEAM (and PMEmo); no pretrained weights released; users train themselves — [GitHub Littleor/Personalized-DMER](https://github.com/Littleor/Personalized-DMER)
- Newer personalization work is mostly in speech: Meta-PerSER (Interspeech 2025) meta-learns listener-specific SER on top of SSL encoders — [ISCA](https://www.isca-archive.org/interspeech_2025/fang25b_interspeech.html)
- In-context few-shot personalization with a speech-language model (2025) — [arXiv 2509.08344](https://arxiv.org/pdf/2509.08344)

### Inferences
- Upgrade path for the app: swap hand-crafted inputs for frozen MERT/MuQ/CLAP frames. Keep the population prior. Replace ridge adaptation with either MAML-style fine-tuning of the head or a simpler per-listener bias/scale offset on V/A. The simple offset is a strong baseline to beat.
- ImageBind weights are, to my knowledge, CC-BY-NC (not verified here). The official PDMER stack is then research-only.
- Personalized results in the paper are only slightly below non-personalized ones. Personalization gains in absolute CCC are small, so measure carefully.

### Gaps
- No 2025-2026 music-specific personalized DMER paper beyond PDMER was found.
- ImageBind license not verified in this pass.

## Q3. What does the FAV corpus propose; better highlight detection approaches?

### Takeaway
FAV is a small (about 420 excerpts, 140 US music students) descriptive corpus, not a trained highlight model. For automatic highlights, use structure/chorus models (SongFormer 2025) plus energy build-up cues, and consider replay data as weak labels.

### Cited Findings
- FAV (ISMIR 2023, Lustig & Temperley): 140 American university students (mostly music majors) each gave 3 favorite 15-second excerpts with free-text reasons; >400 excerpts — [ISMIR 2023 paper](https://archives.ismir.net/ismir2023/paper/000039.pdf)
- Reasons: melody 34.2%, texture 27.6%, harmony 27.2%, instrumentation 24.3%, timbre 12.5%; simplicity cited 3x more than complexity; energy gain 14x more than energy decrease ("build-up") — [ISMIR 2023 program](https://ismir2023program.ismir.net/poster_114.html)
- Contents: excerpts (1.1 GB), full pieces (18.3 GB + 7.1 GB), metadata spreadsheet, formal analyses; metadata says whether the excerpt was liked "much more than" or "about as much as" the rest. No license on the page — [FAV Corpus page](https://www.ethanlustig.com/favcorpus.html)
- SongFormer (2025): music structure analysis (intro/verse/chorus + boundaries), fuses short- and long-window SSL features, learned source embedding for noisy/mismatched labels; inference code and checkpoints released Sept 2025; SongFormDB and SongFormBench released; code CC-BY-4.0 — [GitHub ASLP-lab/SongFormer](https://github.com/ASLP-lab/SongFormer/), [arXiv 2510.02797](https://arxiv.org/abs/2510.02797)
- DeepChorus: multi-scale conv + self-attention, detects multiple choruses; +8.67% AUC and +9.7% F1 over prior SOTA — [arXiv 2202.06338](https://arxiv.org/pdf/2202.06338)
- Supervised chorus detection with CNN multitask (chorusness curve + boundary curve) — [arXiv 2103.14253](https://arxiv.org/abs/2103.14253)
- Baseline: Pop Music Highlighter uses attention in an emotion classifier as a surrogate for highlight extraction; highlight evaluated by overlap with chorus — [TISMIR](https://transactions.ismir.net/articles/10.5334/tismir.14)
- Replay signals: Mr. HiSum (NeurIPS 2023) uses YouTube "Most replayed" stats as highlight labels for video — [NeurIPS paper](https://proceedings.neurips.cc/paper_files/paper/2023/file/7f880e3a325b06e3601af1384a653038-Paper-Datasets_and_Benchmarks.pdf)
- Most-replayed curve is retrievable from the public watch page (reverse-engineered) — [priyavr.at blog](https://priyavr.at/blog/reversing-most-replayed/); scraping likely conflicts with YouTube ToS (inference, not verified)

### Inferences
- Better highlight pipeline: (1) SongFormer section labels, (2) chorus/repetition prior, (3) energy/loudness build-up slope (FAV's 14x energy-gain finding), (4) optional emotion-arousal peak from the dynamic MER model. Rank 15-s windows by a learned or tuned combination.
- In-app replay/seek/loop events are a clean, first-party "most replayed" signal. Log them per user and aggregate per track. This is better than scraping YouTube.
- Qawwali form (long alaap, repeated refrains, rising tempo/intensity) differs from verse-chorus pop. Structure models trained on Western pop may mislabel it. Build-up and refrain-repetition cues may transfer better than "chorus" labels.

### Gaps
- No 2024-2026 paper found that trains music highlight detection on replay data.
- No dedicated 2024-2026 music thumbnailing model beyond structure analysis found in this pass.
- SongFormer weight license (vs code license) and the all-in-one structure analyzer (mir-aidj) license not verified.

## Q4. Better ways to classify free-text "why I like this passage" reasons

### Takeaway
Replace keyword matching with zero-shot NLI or sentence embeddings against label descriptions. A commercially-safe NLI model exists (`deberta-v3-large-zeroshot-v2.0-c`).

### Cited Findings
- `MoritzLaurer/deberta-v3-large-zeroshot-v2.0`: MIT-licensed, zero-shot classification via NLI; non "-c" version includes non-commercial training data — [HF card](https://huggingface.co/MoritzLaurer/deberta-v3-large-zeroshot-v2.0)
- "-c" variant is trained only on commercially-friendly data; F1 macro 0.622 vs 0.676 for the non-c version — [HF card](https://huggingface.co/MoritzLaurer/deberta-v3-large-zeroshot-v2.0)
- LAION-CLAP repo is CC0-1.0 and ships music checkpoints (music_audioset, music_speech_audioset, music_speech); its text tower can embed reason labels in the same space as audio — [GitHub LAION-AI/CLAP](https://github.com/LAION-AI/CLAP)
- FAV categories to use as labels: melody, harmony, texture, instrumentation, timbre, simplicity/complexity, energy gain (build-up) — [ISMIR 2023 program](https://ismir2023program.ismir.net/poster_114.html)

### Inferences
- Recommended: multi-label zero-shot NLI with hypotheses like "This comment praises the vocals." Use thresholds tuned on a small hand-labeled set (100-200 comments).
- Cheaper option: a small sentence-embedding model with cosine similarity to label descriptions, then a logistic-regression head once labels exist.
- CLAP text tower is useful for linking a reason ("the build-up") to the audio passage, not as the main text classifier.
- Comments in Urdu/Roman Urdu need a multilingual model; DeBERTa-v3 is English-only (inference).

### Gaps
- No MIR paper found benchmarking reason-text classifiers on FAV-style comments.
- Licenses of specific sentence-embedding models not checked.

## Q5. Which pretrained models and datasets allow commercial use?

### Takeaway
Most top music encoders and MER datasets are non-commercial. Commercially usable pieces found: LAION-CLAP (CC0), MuQ code (MIT, weights NC), PDMER code (Apache-2.0, no weights), DeBERTa zero-shot "-c" (MIT), SongFormer code (CC-BY-4.0).

### Cited Findings
| Item | Code license | Weights / data license | Commercial? | Source |
|---|---|---|---|---|
| MERT-v1-95M | — | CC-BY-NC-4.0 | No | [HF](https://huggingface.co/m-a-p/MERT-v1-95M) |
| MuQ / MuQ-MuLan | MIT | CC-BY-NC 4.0 | Weights no | [GitHub](https://github.com/tencent-ailab/MuQ) |
| LAION-CLAP | CC0-1.0 | repo CC0; training data copyright caveat | Likely yes, verify | [GitHub](https://github.com/LAION-AI/CLAP) |
| Music2Emo | Apache-2.0 (card) | built on MERT (NC) | Unclear | [HF](https://huggingface.co/amaai-lab/music2emo) |
| Personalized-DMER | Apache-2.0 | no weights; uses ImageBind | Code yes | [GitHub](https://github.com/Littleor/Personalized-DMER) |
| SongFormer | CC-BY-4.0 | checkpoint license not verified | Code yes | [GitHub](https://github.com/ASLP-lab/SongFormer/) |
| DeBERTa zero-shot v2.0-c | MIT | commercial-friendly data | Yes | [HF](https://huggingface.co/MoritzLaurer/deberta-v3-large-zeroshot-v2.0) |
| DEAM | — | CC BY-NC-SA 4.0 | No | [Kaggle mirror](https://www.kaggle.com/datasets/imsparsh/deam-mediaeval-dataset-emotional-analysis-in-music) (secondary) |
| GlobalMood | — | CC BY 4.0 shown on arXiv (may be paper only) | Verify | [arXiv](https://arxiv.org/abs/2505.09539) |
| Memo2496 | — | CC BY-SA 4.0 shown (may be paper only) | Verify | [arXiv](https://arxiv.org/abs/2512.13998) |
| FAV corpus | — | no license stated; contains commercial recordings | No / ask | [FAV page](https://www.ethanlustig.com/favcorpus.html) |

### Inferences
- A model trained on DEAM inherits NC restrictions in practice. Commercial use needs own-collected labels or permissive datasets.
- For a local personal-use app, NC weights are fine. For any paid product, plan on CLAP (CC0) or a self-trained encoder.

### Gaps
- PMEmo, EMOPIA, ImageBind, SongFormer weights, MERT2 licenses: not verified from primary sources.

## Q6. How to evaluate honestly

### Takeaway
Use real human labels with splits by track and by listener. Report CCC/RMSE for dynamic V/A and window overlap for highlights. Synthetic tracks from one recording only test plumbing.

### Cited Findings
- PDMER evaluates on held-out full-length songs (DEAM 58 songs) with per-annotator labels and tasks grouped by annotator — [arXiv 2412.19200](https://arxiv.org/html/2412.19200)
- Standard dynamic metrics: CCC and RMSE on 0.5 s V/A — [arXiv 2412.19200](https://arxiv.org/html/2412.19200)
- Static benchmark metric: r2 for valence and arousal (MARBLE/EmoMusic) — [MARBLE](https://arxiv.org/html/2306.10548)
- Cross-dataset tests reveal large out-of-distribution drops; train on one dataset, test on another — [arXiv 2510.04688](https://arxiv.org/abs/2510.04688)
- Highlight evaluation via overlap of predicted 30-s highlight with annotated chorus — [Pop Music Highlighter](https://transactions.ismir.net/articles/10.5334/tismir.14)
- FAV gives human-chosen 15-s favorite excerpts on full pieces, usable as ground truth for hit-rate/overlap tests (non-commercial research use) — [FAV page](https://www.ethanlustig.com/favcorpus.html)

### Inferences
- Protocol for the app:
  - Dynamic MER: train on DEAM train clips; test on DEAM's 58 full songs; report CCC and RMSE per dimension; compare to PDMER (arousal CCC 0.39, valence 0.10).
  - Personalization: leave-listener-out. Give k = 1, 5, 15 support clips; test on that listener's unseen songs. Compare against (a) population model, (b) per-listener mean offset.
  - Highlights: on FAV, report hit rate (predicted 15-s window overlaps the chosen excerpt) and mean IoU; compare to random, loudest-window and chorus-only baselines.
  - Reason classifier: hand-label a held-out set of comments; report per-label F1.
  - South Asian music: collect a small in-house set (e.g., 20-50 qawwali/Coke Studio tracks, several listeners) as a separate out-of-domain test. Report it separately.
- Report confidence intervals with bootstrap over songs, since test sets are small.

### Gaps
- No public dynamic-emotion or favorite-passage dataset for South Asian music was found.
