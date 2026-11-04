# Music Embedding Models, Fusion, and 2D Visualization (2024-2026)

Research date: 2026-11-03. License and file data for Hugging Face models was pulled live from the HF API (`https://huggingface.co/api/models/<id>`), which reports the model-card license tag and the weight file list.

## Q1. How do the candidate models compare on MARBLE-style benchmarks, and which have text-audio joint spaces?

### Takeaway
MuQ (310M) is the strongest open self-supervised music encoder on MARBLE (avg 77.0 vs MERT 74.4, MusicFM 75.4). MATPAC++ (86M) beats MERT on genre and instrument tasks with about a quarter of the parameters. For text search ("build-ups"), the joint-space options are MuQ-MuLan, CLaMP 3, LAION-CLAP, MS-CLAP and M2D-CLAP.

### Cited Findings
- MuQ paper, MARBLE results (MERT / MusicFM / MuQ_iter): GTZAN genre 78.6 / 83.8 / 85.6; key 65.6 / 63.9 / 65.0; emotion (Emomusic R2) 61.2 / 60.3 / 62.8; singer ID 74.7 / 76.3 / 76.1; vocal technique 87.1 / 92.0 / 96.2; MTT tagging ROC 91.3 / 91.3 / 91.4; NSynth instrument 72.6 / 76.2 / 79.7; average 74.4 / 75.4 / 77.0 — [MuQ arXiv 2501.01108](https://arxiv.org/html/2501.01108)
- MuQ trained on only 0.9K hours (MuQ_m4a) still beats MERT and MusicFM, which used 160K hours — [MuQ arXiv 2501.01108](https://arxiv.org/pdf/2501.01108)
- MuQ is 310M parameters; MuQ-MuLan is 630M; compared models are about 330M — [MuQ arXiv 2501.01108](https://arxiv.org/html/2501.01108)
- MuQ-MuLan zero-shot tagging ROC-AUC 79.3 (PR-AUC 29.3) vs Google MuLan 78.2, with 130K vs 370K hours — [MuQ arXiv 2501.01108](https://arxiv.org/html/2501.01108)
- MuQ-MuLan embeds music and text (English and Chinese) in a joint space: `mulan(wavs=...)`, `mulan(texts=...)`, `calc_similarity()` — [MuQ GitHub](https://github.com/tencent-ailab/MuQ)
- MuQ and MuQ-MuLan strictly require 24 kHz input. fp32 recommended to avoid NaNs. The open MuQ checkpoint was trained on MSD, so results may differ from the paper — [MuQ GitHub](https://github.com/tencent-ailab/MuQ)
- MATPAC++ (music pre-training) vs MERT: NSynth 79.0% vs 72.6%; OpenMIC 86.1 vs 78.6 mAP; GTZAN 88.0% vs 79.3%; MTT 41.2 vs 40.2 mAP. 86M vs 330M params — [MATPAC++ arXiv 2508.12709](https://arxiv.org/html/2508.12709)
- MATPAC models output 3840-D embeddings; variants include `matpac_music` and `matpac_general_audio` — [MATPAC GitHub](https://github.com/aurianworld/matpac)
- OMAR-RQ (MTG, ACM MM 2025): variants base, multicodebook (16 kHz mel), multifeature-25hz-fsq (24 kHz). The fsq variant reports pitch 0.940, chord 0.749, beat F1 0.855 (strong on tonal/temporal tasks) — [OMAR-RQ GitHub](https://github.com/MTG/omar-rq)
- MARBLE v2 (June 2025) supports CLaMP3, MERT and MuQ encoders — [MARBLE GitHub](https://github.com/a43992899/MARBLE-Benchmark)
- CLaMP 3 audio branch is built on MERT-v1-95M features (extracted first, then encoded). It gives a 768-D global vector (`--get_global`) for retrieval, or a temporal (1, T, 768) sequence. Text encoder is XLM-RoBERTa-base (multilingual) — [CLaMP 3 GitHub](https://github.com/sanderwood/clamp3); [HF sander-wood/clamp3 file names](https://huggingface.co/sander-wood/clamp3)
- CLaMP 3 is compared against CLAP, TTMR++ and MuQ-MuLan for text-music retrieval — [CLaMP 3 arXiv 2502.10362](https://arxiv.org/pdf/2502.10362)
- M2D-CLAP 2025 weights are recommended by the authors for CLAP, audio tagging and SED — [nttcslab/m2d](https://github.com/nttcslab/m2d)
- 2026 studies keep using MuQ and MERT as the reference music encoders; a jazz-standard recognition study reports MuQ generally ahead of MERT — [arXiv 2607.00777](https://arxiv.org/pdf/2607.00777)

### Inferences
- For "find similar passages" (timbre, groove, genre), MuQ is the best measured encoder. MATPAC++ is the best size/quality tradeoff.
- For key/harmony similarity, MERT and MuQ_iter are about tied (65.6 vs 65.0). OMAR-RQ fsq looks strongest for chord/pitch, but I found no direct MARBLE number vs MuQ.
- Text search for a structural concept like "build-up" is weak in all CLAP-style models. They are trained on track-level captions, not on section dynamics. Expect better results by combining text search with DSP features (RMS slope, onset density) for that query type.

### Gaps
- MARBLE leaderboard site (marble-bm.shef.ac.uk) refused connection, so no unified v2 table across all models.
- No head-to-head numbers found for Music2Latent, Jukebox features, MS-CLAP 2023 or M2D-CLAP on the same MARBLE splits.
- Could not extract CLaMP 3 retrieval numbers (PDF tables compressed).

## Q2. Exact weight licenses. Which is the best commercially usable option?

### Takeaway
MERT, MuQ, MuQ-MuLan and Music2Latent weights are CC BY-NC 4.0. OMAR-RQ is CC BY-NC-SA 4.0. M2D is evaluation-only. The best commercially usable options are MATPAC (Apache-2.0, music checkpoint), MusicFM (MIT, FMA/MSD checkpoints), LAION-CLAP (Apache-2.0 HF / CC0 originals) and CLaMP 3 (MIT, but see the MERT caveat).

### Cited Findings
| Model | Weights license | Code license | Weight file / size | Source |
|---|---|---|---|---|
| MERT-v1-95M | CC BY-NC 4.0 | (custom HF code) | pytorch_model.bin 378 MB | [HF API](https://huggingface.co/api/models/m-a-p/MERT-v1-95M) |
| MERT-v1-330M | CC BY-NC 4.0 | — | pytorch_model.bin 1.26 GB | [HF API](https://huggingface.co/api/models/m-a-p/MERT-v1-330M) |
| MuQ-large-msd-iter | CC BY-NC 4.0 | MIT | model.safetensors 1.33 GB | [HF API](https://huggingface.co/api/models/OpenMuQ/MuQ-large-msd-iter); [GitHub](https://github.com/tencent-ailab/MuQ) |
| MuQ-MuLan-large | CC BY-NC 4.0 | MIT | pytorch_model.bin 2.65 GB | [HF API](https://huggingface.co/api/models/OpenMuQ/MuQ-MuLan-large) |
| MusicFM | MIT (HF card) | MIT badge in README; GitHub API shows NOASSERTION | pretrained_fma.pt / pretrained_msd.pt 1.32 GB each | [HF API](https://huggingface.co/api/models/minzwon/MusicFM); [README](https://github.com/minzwon/musicfm) |
| MATPAC (music) | Apache-2.0 | Apache-2.0 | model.safetensors 342 MB | [HF API](https://huggingface.co/api/models/auriankelen/matpac_music); [GitHub](https://github.com/aurianworld/matpac) |
| OMAR-RQ | CC BY-NC-SA 4.0 | AGPL-3.0 | model.ckpt 2.33 GB (fsq) | [HF API](https://huggingface.co/api/models/mtg-upf/omar-rq-multifeature-25hz-fsq); [GitHub](https://github.com/MTG/omar-rq) |
| CLaMP 3 | MIT | MIT | .pth ~2.5 GB | [HF API](https://huggingface.co/api/models/sander-wood/clamp3); [GitHub](https://github.com/sanderwood/clamp3) |
| LAION-CLAP HF (`clap-htsat-unfused`, `larger_clap_*`) | Apache-2.0 | Apache-2.0 (transformers) | pytorch_model.bin 615-776 MB | [HF API](https://huggingface.co/api/models/laion/larger_clap_music) |
| LAION-CLAP originals (incl. `music_audioset_epoch_15_esc_90.14.pt`) | CC0-1.0 | CC0-1.0 | .pt 2.35 GB | [HF API](https://huggingface.co/api/models/lukewys/laion_clap); [GitHub API](https://api.github.com/repos/LAION-AI/CLAP) |
| MS-CLAP 2023 | MS-PL (HF tag) | MIT (GitHub) | CLAP_weights_2023.pth 690 MB | [HF API](https://huggingface.co/api/models/microsoft/msclap); [GitHub](https://github.com/microsoft/CLAP) |
| M2D / M2D-CLAP | NTT "Software License Agreement for Evaluation": internal, non-commercial testing/evaluation only; no redistribution | same | .pth via GitHub releases | [LICENSE.pdf](https://github.com/nttcslab/m2d/blob/master/LICENSE.pdf) |
| Music2Latent | CC BY-NC 4.0 | CC BY-NC 4.0 | music2latent.pt 233 MB | [HF API](https://huggingface.co/api/models/SonyCSLParis/music2latent); [GitHub LICENSE](https://github.com/SonyCSLParis/music2latent) |

- MuQ README states the CC BY-NC 4.0 weight license restricts commercial use — [MuQ GitHub](https://github.com/tencent-ailab/MuQ)
- MusicFM authors released the FMA model (8k hours of Creative Commons audio) "to avoid potential licensing complications" — [MusicFM README](https://github.com/minzwon/musicfm)
- CLaMP 3 audio preprocessing requires MERT-v1-95M features — [CLaMP 3 GitHub](https://github.com/sanderwood/clamp3)

### Inferences
- CLaMP 3 weights are MIT, but running it needs MERT-v1-95M (CC BY-NC 4.0) at inference. So CLaMP 3 audio search is not cleanly commercial. Get legal review before shipping it.
- MusicFM's HF repo also hosts an MSD-trained checkpoint. MSD-derived training audio may carry data-provenance risk even with an MIT tag. The FMA checkpoint is the safer pick.
- Best commercial stack today: MATPAC music (similarity) + LAION-CLAP (text search). Both permissive.
- For a personal, non-commercial app, MuQ + MuQ-MuLan is the top-quality choice.

### Gaps
- MS-PL vs MIT mismatch for MS-CLAP (HF tag vs GitHub) not resolved. Both are permissive.
- MusicFM GitHub has no machine-readable LICENSE file (API: NOASSERTION); only the README badge and HF tag say MIT.

## Q3. Which load safely (safetensors) and without trust_remote_code? Mac CPU/MPS feasibility?

### Takeaway
Only MuQ (non-MuLan) and MATPAC ship safetensors. Most others are pickle files (.pt/.bin/.ckpt/.pth). MERT and MATPAC on HF need custom modeling code. LAION-CLAP via transformers is the only option that is both native (no remote code) and loads from a standard class, but its weights are still pickle `.bin`.

### Cited Findings
- MERT repos include `modeling_MERT.py` and `configuration_MERT.py` alongside `pytorch_model.bin` (custom code, i.e. `trust_remote_code=True`) — [HF API MERT-v1-95M](https://huggingface.co/api/models/m-a-p/MERT-v1-95M)
- MATPAC music HF repo has `model.safetensors` plus `modeling_matpac.py` and `configuration_matpac.py` — [HF API](https://huggingface.co/api/models/auriankelen/matpac_music)
- MuQ-large-msd-iter has both `model.safetensors` and `pytorch_model.bin`; MuQ-MuLan has only `pytorch_model.bin`. Both load via the `muq` pip package (`from_pretrained`) — [HF API](https://huggingface.co/api/models/OpenMuQ/MuQ-large-msd-iter); [MuQ GitHub](https://github.com/tencent-ailab/MuQ)
- `laion/larger_clap_music`, `larger_clap_music_and_speech`, `larger_clap_general`, `clap-htsat-unfused`: only `pytorch_model.bin` — [HF API](https://huggingface.co/api/models/laion/larger_clap_music_and_speech)
- OMAR-RQ loads via `pip install omar-rq` and `get_model()` from a `.ckpt` — [OMAR-RQ GitHub](https://github.com/MTG/omar-rq)
- CLaMP 3 install docs specify `pytorch-cuda=11.8`; no Mac guidance — [CLaMP 3 GitHub](https://github.com/sanderwood/clamp3)
- M2D loads `.pth` via `PortableM2D(...)` — [nttcslab/m2d](https://github.com/nttcslab/m2d)

### Inferences
- Pickle `.bin` files can be converted once to safetensors locally, then loaded with `use_safetensors=True`. With `torch>=2.6`, `torch.load(weights_only=True)` is the default and blocks arbitrary code for plain state dicts.
- Remote code can be avoided by vendoring the modeling file (MERT, MATPAC) into the app and pinning a commit hash.
- Memory on 16 GB Mac (fp32 inference, weights only): MATPAC ~0.34 GB, MERT-95M ~0.38 GB, CLAP ~0.6-0.8 GB, MuQ ~1.3 GB, MuQ-MuLan ~2.7 GB, MERT-330M ~1.3 GB, CLaMP 3 ~2.5 GB + MERT. All fit; MuQ-MuLan + MuQ together (~4 GB) still fits.
- Disk (~7 GB free): MuQ + MuQ-MuLan ≈ 4 GB is the max reasonable combo. Avoid fairseq checkpoints (MERT-330M fairseq is 4 GB) and LAION original `.pt` (2.35 GB, includes optimizer state). The CC0 music checkpoint is 2.35 GB on disk.
- MPS: ViT/conformer encoders generally run on MPS; MuQ asks for fp32, which MPS supports. No source verified MPS support for each model specifically; test with CPU fallback (`PYTORCH_ENABLE_MPS_FALLBACK=1`).

### Gaps
- No primary-source benchmarks of per-model inference speed on Apple Silicon.

## Q4. Is there a known issue with `laion/larger_clap_music` in transformers?

### Takeaway
Yes. It is a known, reproducible collapse. Use `laion/larger_clap_music_and_speech` (same size and architecture) or `laion/larger_clap_general` instead.

### Cited Findings
- MTEB issue #5069 "laion/larger_clap_music returns near-constant text embeddings": mean pairwise text-text cosine 0.9993 (vs 0.18-0.29 for working checkpoints); pooler std 0.005 vs 0.33-0.44; retrieval hit@5 0.013-0.017 vs 0.21-0.29 — [mteb #5069](https://github.com/embeddings-benchmark/mteb/issues/5069)
- Reproduces on transformers 4.57.6 and 5.14.1, so it is a checkpoint problem, not a library bug. Cause unknown. Closed Aug 2, 2026 as out of scope for MTEB — [mteb #5069](https://github.com/embeddings-benchmark/mteb/issues/5069)
- MTEB recommends `laion/larger_clap_music_and_speech` (same size/arch), `laion/clap-htsat-unfused` or `laion/larger_clap_general` — [mteb #5069](https://github.com/embeddings-benchmark/mteb/issues/5069)

### Inferences
- The issue documents the text tower. The user saw audio embeddings collapse too (cosine ~0.97). That fits a bad HF conversion of this specific checkpoint.
- The original CC0 `music_audioset_epoch_15_esc_90.14.pt` via the `laion_clap` pip package avoids the HF conversion. It is the cleanest way to get the music-trained CLAP. Note: pickle file, 2.35 GB.

### Gaps
- No upstream LAION fix or re-conversion found.

## Q5. Better fusion than weighted concatenation?

### Takeaway
Three upgrades in order of effort: (1) per-dimension standardization plus a learned layer-weighted average from the foundation model; (2) late fusion (separate similarity scores, then weighted sum); (3) a small learned projection trained on the listener's likes/skips.

### Cited Findings
- MERT model card recommends combining all hidden layers with a learnable weighted aggregator, since different layers suit different tasks — [MERT-v1-95M card](https://huggingface.co/m-a-p/MERT-v1-95M)
- OMAR-RQ shows a single model can be tuned for tonal/temporal tasks vs semantic tasks by variant (fsq vs base) — [OMAR-RQ GitHub](https://github.com/MTG/omar-rq)
- MuQ reports different layers being best per task (layer choice is a hyperparameter in MARBLE probes) — [MuQ arXiv 2501.01108](https://arxiv.org/html/2501.01108)

### Inferences
- Current scheme (sqrt(0.7)·deep + sqrt(0.3)·DSP) is equivalent to late fusion with cosine weights 0.7/0.3. That is fine. The main weakness is the 25 DSP features: z-score them over the library before unit-normalizing, or a few high-variance features dominate.
- Multi-layer: for MuQ/MERT, mean-pool time per layer, then average a few mid layers (or learn weights). Middle layers carry more harmony/key info; late layers carry more genre/semantics.
- Taste learning: train a small linear projection or logistic head on frozen embeddings using likes/skips. Cheap on CPU, and it reshapes similarity toward what the listener cares about.
- Keep separate indexes per view (timbre-deep, harmony, rhythm-DSP) and let the UI change weights at query time. This gives explainable "similar because of rhythm" results.

### Gaps
- No 2024-2026 paper found that benchmarks deep+DSP fusion for passage similarity specifically. Recommendations above are engineering inferences.

## Q6. Better than PCA for 2D maps?

### Takeaway
Use PaCMAP (Apache-2.0) as the default. It keeps both local neighbours and global layout, and is less sensitive to settings. UMAP (BSD-3) is the common alternative with a `transform()` for new points. Keep PCA as a stable fallback and as a 50-D pre-step.

### Cited Findings
- UMAP preserves local structure well but struggles with global structure; TriMap preserves global structure but struggles locally — [Wang et al., JMLR 2021](http://jmlr.org/papers/volume22/20-1061/20-1061.pdf)
- PaCMAP preserves both local and global structure, using mid-near pairs to fix global layout first — [Wang et al., JMLR 2021](http://jmlr.org/papers/volume22/20-1061/20-1061.pdf)
- TriMap and PaCMAP are more robust to the number of PCA components used in pre-processing than t-SNE and UMAP — [Wang et al., JMLR 2021](http://jmlr.org/papers/volume22/20-1061/20-1061.pdf)
- Licenses (GitHub API): UMAP BSD-3-Clause; PaCMAP Apache-2.0; TriMap Apache-2.0; openTSNE BSD-3-Clause. All actively maintained in 2026 — [umap](https://github.com/lmcinnes/umap); [PaCMAP](https://github.com/YingfanWang/PaCMAP); [trimap](https://github.com/eamid/trimap); [openTSNE](https://github.com/pavlin-policar/openTSNE)

### Inferences
- Stability: fix `random_state`, and init from PCA (PaCMAP `init="pca"`, UMAP `init="spectral"` or PCA). This stops the map reshuffling each run.
- Incremental adds: UMAP and openTSNE support `transform()` on new points without refitting. Use this so new songs do not move the whole map.
- Scale: a library of a few thousand songs × 12 s windows (tens of thousands of points) runs in seconds to a minute on Mac CPU for PaCMAP/UMAP.
- Use cosine metric on unit-normalized embeddings.

### Gaps
- No music-specific benchmark of these methods found.
