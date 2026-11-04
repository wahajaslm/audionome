# Personal Music Preference Learning, Active Learning, and Grounded Taste Insights (2024-2026)

Scope: compare the current local app (cosine nearest-example scoring in TS, implicit seek/loop/rewind signals, "TROMPA-MER inspired" query selection, template "Music DNA" sentences) with current methods. Target: Apple Silicon Mac, 16 GB RAM, ~7 GB free disk, on-device.

Note on evidence: items marked "Inference" are my reasoning from cited sources or from standard ML practice. They are not separately sourced. License facts were pulled from GitHub API / Hugging Face API metadata and LICENSE files on 2026-11-03.

## Q1. Best methods for learning one user's taste from very few labels (and which run in a browser)

### Takeaway
With tens of labels, the strongest practical approach is a tiny model on frozen pretrained embeddings: a regularized linear probe or Bayesian logistic regression, with a population prior. The current cosine nearest-example scorer is a reasonable baseline but has no calibrated uncertainty and is sensitive to single noisy examples. All the recommended upgrades run easily in browser TypeScript.

### Cited Findings
- ISMIR 2024 work on long-tail auto-tagging shows that features from pretrained models fed into a lightweight linear classifier (linear probe) work well with only limited labeled data, testing several pretrained feature sets and few-shot settings — [Music auto-tagging in the long tail: A few-shot approach (arXiv 2409.07730)](https://arxiv.org/html/2409.07730)
- TROMPA-MER found that with ~10 queries per round, personalized SGD logistic-regression and XGBoost ensembles improved steadily, while Gaussian Naive Bayes ensembles largely failed to personalize ("inappropriate given the non-gaussian distribution of data") — [Gómez-Cañón et al., J. Intell. Inf. Syst. 2022](https://d-nb.info/1274808243/34)
- In TROMPA-MER, personalized models started from models pre-trained on a population dataset (DEAM) and were fine-tuned on the user's labels; this "population prior then personalize" pattern is the core of their method — [Gómez-Cañón et al. 2022](https://d-nb.info/1274808243/34)
- Personalization was not reached for every user: on average 7.47 of 12 ensembles per participant showed effective personalization; users with low self-consistency personalized worst — [Gómez-Cañón et al. 2022](https://d-nb.info/1274808243/34)

### Inferences
- Ranked recommendation for this app (all trivially on-device in TS, <1 ms per update for tens of labels):
  1. **Bayesian logistic regression (Laplace approx.) on frozen embeddings, prior mean = population baseline weights.** Gives a posterior predictive probability plus variance. The variance feeds active learning and insight abstention. Strongest fit for "tens of labels + population baseline".
  2. **L2-regularized linear probe** (same features), with strength picked by leave-one-song-out. Simpler; no uncertainty without bootstrapping.
  3. **Prototype scoring (current approach, upgraded):** use class means (prototypical-network style) plus shrinkage toward the population prototype, rather than raw nearest-example max. Less noisy than nearest-neighbor.
  4. **Gaussian-process classification / GP preference learning:** good uncertainty, cost O(n^3) is fine at n<200. Feasible in TS but more code; benefit over Bayesian LR is mainly nonlinearity, which frozen embeddings rarely need at this data size.
  5. **Pairwise Bradley-Terry** ("which of these two passages do you prefer?"): useful as an extra label type. It avoids scale drift in absolute likes and can be fit as logistic regression on embedding differences, so it shares code with option 1.
  6. **Contrastive user embeddings / fine-tuning the encoder:** not worth it for one user with tens of labels. Risk of overfitting; needs GPU-scale training.
- Keep leave-one-song-out evaluation (it prevents passage leakage within a song). Add calibration metrics (Brier score / ECE) next to accuracy, since insights depend on calibrated probabilities.
- Allow evaluation with only positives by reporting ranking metrics against the population baseline. Requiring both positive and negative labels blocks early feedback.

### Gaps
- I found no 2024-2026 paper benchmarking Bayesian LR vs. GP vs. prototype scoring specifically for single-user music preference on frozen embeddings. The ranking above is reasoning, not a sourced benchmark.
- No source checked for the best frozen embedding (MERT, CLAP, MusicFM, etc.) for preference, as opposed to tagging.

## Q2. Combining implicit signals (replays, seeks, skips) with explicit likes

### Takeaway
Treat implicit signals as noisy, weighted evidence with their own reliability, not as labels equal to likes. Repetition consistency is a good reliability signal. Skips are useful negatives, but exposure bias matters: only passages the user actually heard can generate signals.

### Cited Findings
- Deezer (UMAP 2025) models repeated listening as (play count, time gap) bins with a Beta posterior per bin. This gives both replay likelihood and confidence. Weighting interactions by that uncertainty improved recommendations on two datasets. Example: a 9th replay after a one-day gap is a strong signal; 40 plays with long gaps is much less consistent — [Sguerra et al., UMAP 2025](https://research.deezer.com/publication/2025/06/16/umap-sguerra.html)
- RecSys 2024 work improves sequential music recommendation by modelling skips as negative feedback in the loss (contrastive) — [Negative Feedback-informed Contrastive Learning, RecSys '24](https://dl.acm.org/doi/fullHtml/10.1145/3640457.3688188)
- ReCRec (ACM TOIS 2024) reasons about why implicit feedback is missing: lack of exposure vs. disinterest. Missing interactions must not be read as dislikes — [ReCRec](https://dl.acm.org/doi/10.1145/3672275)
- Older evidence: replay likelihood rises up to around ten plays, then drops as overexposure sets in — [Considering Durations and Replays (arXiv 1711.05237)](https://arxiv.org/pdf/1711.05237)

### Inferences
- Concrete upgrade for the app:
  - Keep explicit likes/dislikes as hard labels (weight 1).
  - Turn each implicit event type (loop, rewind-to, seek-to, seek-away/skip) into a soft label with a weight in [0,1].
  - Learn each event type's weight via a Beta posterior on "how often this event type agrees with the user's explicit label on the same passage". This is the Deezer idea, shrunk to one user.
  - Add a repetition-consistency term: repeated loops across sessions count more than many loops in one session.
- Debias exposure: only treat "no interaction" as information for passages that were actually played. A passage the user never reached is unlabeled, not negative.
- Seek-to may mean "searching", not "liking". Count it as positive only if followed by dwell (e.g., listening ≥N seconds). Seek-away within a few seconds is a weak negative.
- Ignoring volume changes and automatic cycles is correct. Both are weak or confounded signals.

### Gaps
- No 2024-2026 source found for per-user (single-person, on-device) implicit-explicit fusion. The literature is population-scale.
- No source found for passage-level (within-track) seek/loop semantics. Most work is track-level.

## Q3. Active learning / query strategies for small personal labeling; what TROMPA-MER actually did

### Takeaway
TROMPA-MER used consensus entropy over a classifier ensemble, with crowd disagreement as a prior and per-class balancing. Random selection was a strong baseline. In the very-low-budget regime (first ~10-30 labels), typicality/diversity methods beat uncertainty methods. So: start with representative, diverse passages, then switch to uncertainty.

### Cited Findings: TROMPA-MER (primary source)
- Paper: "TROMPA-MER: an open dataset for personalized music emotion recognition", Gómez-Cañón et al., Journal of Intelligent Information Systems, published 19 Sept 2022. 181 participants, 4,721 annotations, 1,161 excerpts — [paper PDF](https://d-nb.info/1274808243/34)
- Task: classify emotion into four arousal-valence quadrants. It is emotion recognition, not preference. Preference and familiarity were collected as extra fields — [paper](https://d-nb.info/1274808243/34)
- Features: 260 acoustic features (mean/std of 65 low-level descriptors and derivatives, 1 s windows, 50% overlap, IS13 ComParE set, openSMILE). No deep embeddings — [paper](https://d-nb.info/1274808243/34)
- Models: per-user ensemble of 15 classifiers pre-trained on DEAM: 5 Gaussian NB, 5 SGD logistic regression, 5 XGBoost, each from a different CV split — [paper](https://d-nb.info/1274808243/34)
- Query rule ("consensus entropy"): ensemble predicts quadrant probabilities, averages them, computes Shannon entropy, queries highest-entropy items, retrains. Four variants:
  - MC (machine consensus): entropy over model predictions.
  - HC (human consensus): entropy over the crowd's annotation histogram for that excerpt.
  - MIX: both.
  - RAND: random baseline. — [paper](https://d-nb.info/1274808243/34)
- Class balancing: entropy is computed separately within each predicted-quadrant group, and top items are taken from each, so queries are not all one class — [paper](https://d-nb.info/1274808243/34)
- Online setup: q = 10 excerpts per round. Offline tests used several q/epoch splits, 85/15 train/test per user (36 users with 80-173 annotations each) — [paper](https://d-nb.info/1274808243/34)
- Results: SGD and XGB improved with more queries. Proposed methods beat random significantly for SGD and XGB (paired t-tests, Bonferroni). But "RAND is a strong baseline", and gains only appeared after most data had been used. HC with XGB was best when queries were class-balanced — [paper](https://d-nb.info/1274808243/34)
- Absolute performance was low: weighted F1 roughly 0.3-0.44 across models (Fig. 6) — [paper](https://d-nb.info/1274808243/34)

### Cited Findings: modern low-budget AL
- "Active Learning on a Budget" (ICML 2022): opposite strategies suit high vs. low budgets. At low budget, typical/representative examples beat uncertainty. TypiClust (cluster self-supervised embeddings, pick the most typical point per cluster) beat uncertainty, BADGE, and CoreSet in the low-budget regime. Many baselines did no better than random there — [Hacohen et al., PMLR v162](https://proceedings.mlr.press/v162/hacohen22a/hacohen22a.pdf)
- BADGE picks a diverse set of points with large hypothesized loss-gradient embeddings (uncertainty plus diversity in one step) — [Survey summary / Hacohen et al.](https://arxiv.org/html/2202.02794v4)
- Cold-start AL methods often perform worse than random at very low budgets — [Hacohen et al.](https://arxiv.org/html/2202.02794v4)
- ProbCover (NeurIPS 2022) is a covering-based low-budget method in the same family as TypiClust — [Active Learning Through a Covering Lens](https://proceedings.neurips.cc/paper_files/paper/2022/file/8c64bc3f7796d31caa7c3e6b969bf7da-Paper-Conference.pdf)

### Inferences
- The app's "TROMPA-MER inspired" mix (uncertainty + DSP-vs-deep disagreement + diversity) is a reasonable analogue. "Cross-modal disagreement" maps onto TROMPA's MC variant (disagreement across model families). TROMPA had no equivalent of deep vs. DSP views.
- The app lacks two things TROMPA-MER used:
  - A **crowd-disagreement prior (HC)**. The app's population baseline could supply this if it stores per-passage population variance.
  - **Class balancing** of queries.
- Recommended schedule:
  - Labels 0-~15: TypiClust/ProbCover-style selection on frozen embeddings (k-means in TS, pick most typical passage per cluster, one per song).
  - After ~15 labels with both classes: BALD-style or posterior-variance selection from the Bayesian LR in Q1, plus a diversity penalty (k-center or determinantal). BADGE is overkill for a linear model; for logistic regression, gradient-embedding norm reduces to uncertainty times feature norm.
  - Always keep a small share of random queries (e.g., 1 in 5). TROMPA-MER found random strong, and random queries give an unbiased evaluation set.
- Limit to one passage per song per batch so leave-one-song-out stays meaningful.

### Gaps
- No 2024-2026 music-specific active-learning-for-preference paper found in this pass.
- The TROMPA-MER authors' follow-up consensus-entropy paper (Gómez-Cañón et al. 2021) was not fetched.

## Q4. Audio-language models for describing passages: quality, size, local 16 GB Mac feasibility, licenses

### Takeaway
Music Flamingo is the strongest music-specific open model, but its weights are non-commercial and its card targets NVIDIA A100/H100 on Linux. The most practical permissively licensed local option is Qwen2-Audio-7B-Instruct (Apache-2.0, MLX 4-bit exists). LAION CLAP (music checkpoint, Apache-2.0) is the best fit for grounded, checkable tags. All LALMs need guardrails because music factual accuracy is weak and hard to measure.

### Cited Findings: model facts
- **Music Flamingo (NVIDIA, Nov 2025; ICLR 2026):** 8B params, Qwen2.5-7B LLM, AF-Whisper encoder, 30 s windows, up to 20 min input. Weights under NVIDIA OneWay Noncommercial License; card also cites Qwen Research License and OpenAI terms for data generation. Commercial use not permitted. Tested on A100 80GB, Linux — [HF model card](https://huggingface.co/nvidia/music-flamingo-hf); [paper](https://arxiv.org/pdf/2511.10289)
- Music Flamingo reports MuChoMusic 74.58% vs. Qwen3-Omni 52.10%; MusicCaps GPT-5-judge score 8.8 vs. 7.2 for Qwen3-Omni; human SongCaps rating 8.3/10 vs. 6.5 for Audio Flamingo 3. These are author-reported — [Emergent Mind summary of 2511.10289](https://www.emergentmind.com/papers/2511.10289); [OpenReview ICLR 2026 PDF](https://openreview.net/pdf/e76bd5ec20f54bbb3ce65404bd70623732279792.pdf)
- **Audio Flamingo 3 (NVIDIA):** ~8.3B params (safetensors total 8,267,215,360); HF license tag "other" — [HF API](https://huggingface.co/api/models/nvidia/audio-flamingo-3-hf). The NVIDIA audio-flamingo GitHub repo has no SPDX license detected — [GitHub API](https://api.github.com/repos/NVIDIA/audio-flamingo). The NVIDIA Audio Flamingo 2 Space ships an `incl_licenses` folder — [HF Space](https://huggingface.co/spaces/nvidia/audio-flamingo-2/tree/main/incl_licenses). Treat AF3 weights as non-commercial (consistent with Music Flamingo), but exact terms are unverified.
- **Qwen2-Audio-7B-Instruct:** Apache-2.0 on HF; ~8.4B params (8,397,094,912) — [HF API](https://huggingface.co/api/models/Qwen/Qwen2-Audio-7B-Instruct). MLX 4-bit community port exists, Apache-2.0 — [mlx-community/Qwen2-Audio-7B-Instruct-4bit](https://huggingface.co/mlx-community/Qwen2-Audio-7B-Instruct-4bit/blob/main/tokenizer.json). GitHub repo QwenLM/Qwen2-Audio has no SPDX license detected — [GitHub API](https://api.github.com/repos/QwenLM/Qwen2-Audio)
- **Qwen2.5-Omni-7B:** HF license tag "other", license_name apache-2.0; ~10.7B params — [HF API](https://huggingface.co/api/models/Qwen/Qwen2.5-Omni-7B). Code repo Apache-2.0 — [GitHub](https://github.com/qwenlm/qwen2.5-omni)
- **Qwen2.5-Omni-3B:** weights under **Qwen Research License** (non-commercial; release date Sept 19, 2024 in the license text) — [HF API](https://huggingface.co/api/models/Qwen/Qwen2.5-Omni-3B); [LICENSE](https://huggingface.co/Qwen/Qwen2.5-Omni-3B/raw/main/LICENSE). Conflict: a community Core AI port claims Apache-2.0 inheritance — [mlboydaisuke port](https://huggingface.co/mlboydaisuke/Qwen2.5-Omni-3B-Audio-CoreAI). The primary LICENSE file wins: non-commercial. MLX 4-bit "Thinker" port exists (license "other") — [mlx-community](https://huggingface.co/mlx-community/Qwen2.5-Omni-3B-Thinker-4bit)
- **Qwen3-Omni-30B-A3B (Instruct and Captioner):** license_name apache-2.0; ~35B / ~32B params — [HF API Instruct](https://huggingface.co/api/models/Qwen/Qwen3-Omni-30B-A3B-Instruct); [HF API Captioner](https://huggingface.co/api/models/Qwen/Qwen3-Omni-30B-A3B-Captioner). Code repo Apache-2.0 — [GitHub API](https://api.github.com/repos/QwenLM/Qwen3-Omni)
- **SALMONN (ByteDance/Tsinghua):** code Apache-2.0 — [GitHub API](https://api.github.com/repos/bytedance/SALMONN); HF card apache-2.0 — [HF API](https://huggingface.co/api/models/tsinghua-ee/SALMONN). It is built on a Vicuna LLM, so the LLM's terms likely also apply (unverified).
- **MU-LLaMA:** code GPL-3.0 — [GitHub API](https://api.github.com/repos/shansongliu/MU-LLaMA); HF card says MIT — [HF API](https://huggingface.co/api/models/mu-llama/MU-LLaMA). Code and weights licenses conflict; it is LLaMA-based, so Meta license terms likely apply (unverified).
- **MusiLingo:** HF checkpoint "MusiLingo-long-v1" tagged CC-BY-4.0, ~7B params — [HF API](https://huggingface.co/api/models/m-a-p/MusiLingo-long-v1). GitHub repo has no license — [GitHub API](https://api.github.com/repos/zihaod/MusiLingo). README requires Vicuna-7B v0 weights (LLaMA-1-derived) — [README](https://raw.githubusercontent.com/zihaod/MusiLingo/main/README.md). Treat as non-commercial in practice (inference).
- **LLark (Spotify):** code Apache-2.0 — [LICENSE](https://raw.githubusercontent.com/spotify-research/llark/main/LICENSE). README describes a code release; I found no released weights — [README](https://raw.githubusercontent.com/spotify-research/llark/main/README.md); [paper](https://arxiv.org/pdf/2310.07160)
- **LAION CLAP:** repo CC0-1.0 — [GitHub API](https://api.github.com/repos/LAION-AI/CLAP); `laion/larger_clap_music` weights Apache-2.0 — [HF API](https://huggingface.co/api/models/laion/larger_clap_music). A transformers.js port of a CLAP checkpoint exists (`Xenova/clap-htsat-unfused`, library transformers.js) — [HF API](https://huggingface.co/api/models/Xenova/clap-htsat-unfused)
- **Microsoft CLAP (msclap):** MS-PL — [HF API](https://huggingface.co/api/models/microsoft/msclap)
- **LP-MusicCaps:** HF weights MIT — [HF API](https://huggingface.co/api/models/seungheondoh/lp-music-caps)
- CMI-Bench (2025) evaluates open audio-text LLMs (LTU, Qwen-Audio, SALMONN, MusiLingo, etc.) on music instruction following — [CMI-Bench arXiv 2506.12285](https://arxiv.org/html/2506.12285v1)

### Cited Findings: reliability of LALM music descriptions
- ISMIR 2026 (Lin, Freeman, Thickstun): the popular MusicQA benchmark "fails to measure whether a model's responses about music are factually correct". They propose precision/recall/F1 on structured facts extracted from open-ended answers, testing nine LALMs including Gemini and Music Flamingo — [arXiv 2511.05550](https://arxiv.org/abs/2511.05550)
- MuChoMusic (ISMIR 2024) is the main multiple-choice music-understanding benchmark used in these comparisons — [arXiv 2408.01337](https://arxiv.org/pdf/2408.01337)

### Inferences
- Size vs. 16 GB RAM / 7 GB disk:
  - Qwen2-Audio-7B 4-bit: roughly 4.5-5 GB on disk and similar RAM. Fits, but uses most of the free disk.
  - Qwen2.5-Omni-3B 4-bit: roughly 2-3 GB. Fits easily, but non-commercial.
  - Music Flamingo / AF3 (8B): could fit at 4-bit in principle, but no MLX/GGUF port was verified and the license is non-commercial.
  - Qwen2.5-Omni-7B (10.7B) at 4-bit is about 6 GB: tight on disk.
  - Qwen3-Omni-30B-A3B (~32-35B total): does not fit.
  - CLAP music: a few hundred MB. Runs in browser (ONNX/transformers.js) or MLX.
- Commercial-safe shortlist: Qwen2-Audio-7B-Instruct (Apache-2.0), LAION CLAP music (Apache-2.0 / CC0 code), LP-MusicCaps (MIT, older and weaker). SALMONN is uncertain because of its Vicuna base.
- Non-commercial only: Music Flamingo, Audio Flamingo 3, Qwen2.5-Omni-3B, MusiLingo (via Vicuna), MU-LLaMA (via LLaMA; conflicting tags).
- Can LALMs give grounded "why you like this" explanations? Not on their own. They describe a passage ("bright synth lead, building drums"), but they do not know the user's labels. Factual accuracy is also not well measured. The safe design is:
  1. The preference model (Q1) finds which features separate liked from disliked passages. That is the "why".
  2. A LALM or CLAP only supplies **descriptive vocabulary** for the specific passages already chosen as evidence.
  3. Each descriptor is cross-checked against DSP features (e.g., LALM says "gets louder" → check the RMS slope).
- CLAP zero-shot tagging (score each passage against a fixed text vocabulary such as "female vocals", "build-up", "distorted guitar") is the most checkable option. Outputs are scores, not free text. Tag-vs-preference correlations can be tested statistically. It is also small enough to run in the browser.

### Gaps
- No verified MLX or GGUF port of Music Flamingo or Audio Flamingo 3 found; no measured Mac latency for any LALM found.
- Exact NVIDIA OneWay Noncommercial License text was not fetched.
- Independent (non-author) head-to-head numbers for Qwen2-Audio vs. Music Flamingo on music captioning were not found.
- SALMONN and MU-LLaMA effective weight licenses (base-LLM inheritance) not verified.

## Q5. Keeping generated insights honest (evidence-only claims, uncertainty, abstention)

### Takeaway
Generate claims from statistics, not from a language model. Each "Music DNA" sentence should map to a tested feature effect with an effect size, an uncertainty interval, and the passages that support it. Abstain when the evidence is weak. If an LLM is used, use it only to rephrase verified claims.

### Cited Findings
- LLM recommender audit (2026): split-conformal abstention thresholds give finite-sample guarantees. LLMs were systematically under-confident about catalog faithfulness, hedging on correct and hallucinated items alike. Self-reported LLM confidence is not a usable abstention signal — [arXiv 2608.10008](https://arxiv.org/html/2608.10008)
- ICLR 2025 "Walk the Talk?" measures LLM explanation faithfulness via causal concept faithfulness. Explanations can mention concepts that did not causally drive the output — [ICLR 2025 paper](https://proceedings.iclr.cc/paper_files/paper/2025/file/b5ec50eb177908f21f78ed0d76ed525c-Paper-Conference.pdf)
- OpenAI (2025): models hallucinate partly because training rewards guessing over saying "I don't know". Making abstention a valid output helps — [Why Language Models Hallucinate](https://cdn.openai.com/pdf/d04913be-3f6f-4d2b-b283-ff432ef4aaa5/why-language-models-hallucinate.pdf)
- Music LALM factual accuracy is not captured by popular benchmarks (see Q4) — [arXiv 2511.05550](https://arxiv.org/abs/2511.05550)
- TROMPA-MER: users with low self-consistency personalized poorly. Insight confidence should depend on the user's own label consistency — [Gómez-Cañón et al. 2022](https://d-nb.info/1274808243/34)

### Inferences
- Concrete rules for the template engine:
  - **Claim = (feature, direction, effect size, CI, n_pos, n_neg, supporting passage IDs).** No sentence without this record.
  - **Test against the population baseline,** not only liked vs. disliked. "You like vocal passages" is only an insight if it differs from what most people like.
  - **Permutation test or bootstrap CI** per feature on leave-one-song-out data. Correct for multiple features (e.g., Benjamini-Hochberg) because many features are scanned.
  - **Song-level resampling,** since passages from one song are correlated.
  - **Abstain** when n is too small, the CI crosses zero, or the effect comes from 1-2 songs. Show "Not enough evidence yet" plus the active-learning queries that would resolve it.
  - **Hedging tied to evidence strength** ("seem to" vs. "consistently"), chosen by CI width, not fixed wording.
  - **Composite claims** ("vocal passages that become more intense as the music builds") need an interaction test, not two separate main effects joined by "and".
  - **Counterfactual check:** remove the top-supporting song and re-test. Drop the claim if it disappears.
  - **Clickable evidence:** each sentence links to the passages behind it, so the user can verify or correct it. A correction becomes a new label.
- If an LLM (local Qwen2-Audio or a small text LLM) rewrites the sentence, pass it only the structured claim record. Then verify that the output mentions no feature outside the record (simple string/entity check), or fall back to the template.

### Gaps
- No music-specific study found on faithfulness of natural-language taste summaries ("Spotify Wrapped"-style) vs. underlying model evidence.
- No source found evaluating CLAP zero-shot tag accuracy for within-track passage attributes (e.g., "build-up").
