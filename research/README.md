# Music DNA — Python Research & Scientific Integration Suite

The consumer player displays listener-relevant insights (saved feelings, explicitly tagged musical qualities, tentative attention signals, and evidence-backed summaries) while preserving the original circular Music DNA visualization.

All acoustic descriptor tables, neural embeddings, active-learning acquisition scores, dynamic emotion trajectories, and held-out ablation benchmarks live in the **Python research suite**.

---

## Architecture & Module Directory

| Domain Responsibility | Canonical Module | Primary Classes / Interfaces |
| :--- | :--- | :--- |
| **Complete Benchmark Suite** | `research.benchmark_suite` | `ControlledCorpusGenerator`, `ResearchBenchmarkSuite` |
| **Favorite Passage Methodology** | `research.favorite_passages` | `FavoritePassageTaxonomy`, `AcousticContrastAnalyzer`, `FavoritePassageEvaluator` |
| **Active Learning & Inquiry Engine** | `research.active_learning` | `ActiveLearningEngine`, `ActiveLearningCandidate` |
| **Dynamic Emotion Trajectory Model** | `research.dynamic_emotion` | `DynamicEmotionModel` |
| **Passive Listening & Preference Ablation**| `research.preference_evaluation` | `ListeningBehaviorAggregator`, `PreferenceAblationStudy`, `EvidenceInsightSynthesizer` |
| **Acoustic Feature Exploration CLI** | `research.acoustic_explorer` | `AcousticExplorer` |
| **Deep Audio Encoder & License Manager** | `services.intelligence.deep_encoder` | `DeepAudioEncoder`, `MultimodalFusionEngine`, `ModelLicenseManager` |
| **Acoustic Feature Extractor** | `services.intelligence.acoustic_features` | `AcousticFeatureExtractor`, `WindowAcousticDescriptors`, `AudioAnalysisSegment` |
| **Stem Decomposition & Musical Dims** | `services.intelligence.stem_separation` | `StemSeparator`, `MusicalStructureAnalyzer` |
| **Vector Projection & Dimensionality Reduction** | `services.intelligence.vector_projection` | `EmbeddingProjector` |
| **SQLite Persistence Repository** | `services.intelligence.repository` | `AnalysisRepository` |
| **Interactive Studio Service** | `services.intelligence.studio_service` | `ResearchStudioService` |
| **Spectral & Spectrogram Visualizer** | `services.intelligence.spectral_analysis` | `SpectralVisualizer` |

---

## 1. Run the Scientific Integration Benchmark Suite

```bash
.venv/bin/python -m research.benchmark_suite --out research-output/benchmark_report.json
```

This executes and verifies all six scientific pillars on real audio:
1. **Favorite Passage Corpus Methodology (`research/favorite_passages.py`):** 15-second favorite passage schema, canonical musical-reason taxonomy, free-text listener explanation classification, and passage-vs-track acoustic contrast (`energy_slope`, `vocal_presence`, `spectral_flux`).
2. **Pretrained Deep Audio Encoder (`services/intelligence/deep_encoder.py`):** Produces 512-D embeddings with the pretrained LAION-CLAP model (`laion/clap-htsat-unfused`, Apache-2.0) via Hugging Face `transformers`. Override the model with `MUSIC_DNA_CLAP_MODEL`. MS-CLAP (`MUSIC_DNA_CLAP_WEIGHTS`) and a remote CLAP service (`MUSIC_DNA_COLAB_URL`) are also supported.
3. **Versioned Multimodal Fusion (`services/intelligence/deep_encoder.py`):** Unit-normalized multimodal representations (`fused-v2`) retaining both `dspEmbedding` and `deepEmbedding` for direct cross-modal comparison.
4. **Active Learning Engine (`research/active_learning.py`):** Uncertainty, cross-modal disagreement (Query-by-Committee), and diversity passage selection, plus Shannon information-gain question chip selection.
5. **Dynamic Emotion Baseline (`research/dynamic_emotion.py`):** Reproduces AAAI 2025 Dual-Scale Temporal Attention (local transition kernel + global structural self-attention) with support-set listener adaptation, evaluated as a separate emotion trajectory baseline (Lin's CCC & RMSE) distinct from music preference ranking.
6. **Hybrid Preference Ablation & Evidence-Backed Insight (`research/preference_evaluation.py`):** Evaluates DSP-only (Model A), Deep-only (Model B), Fused (Model C), and Fused + Passive Behavior + FAV Alignment (Model D), and synthesizes verifiable multi-evidence explanations.

---

## 2. Acoustic Feature Exploration

```bash
.venv/bin/python -m research.acoustic_explorer public/demo.wav --out research-output
```

---

## 3. Interactive Research Exploration Notebook

Launch Jupyter to explore waveforms, spectrograms, stem decomposition, embeddings, 2D latent projections, and dynamic emotion trajectories interactively:

```bash
.venv/bin/jupyter lab research/notebooks/01_interactive_audio_exploration.ipynb
```

---

## 4. Model & Checkpoint Licensing Policy

Source-code licenses and pretrained checkpoint weight licenses are verified independently via `ModelLicenseManager` (`services/intelligence/deep_encoder.py`):
- **LAION-CLAP / MERT / Local Pretrained Spectro-Temporal Encoder:** MIT / Apache-2.0 (enabled by default).
- **MuQ (`OpenMuQ`):** Code is MIT, but published weights are **CC BY-NC 4.0** (blocked by default; requires `allow_noncommercial=True` or `MUSIC_DNA_ALLOW_NC_WEIGHTS=1` for non-commercial research evaluation).
- **Essentia Pretrained Models:** **CC BY-NC-SA 4.0** (blocked by default unless non-commercial research mode is explicitly enabled).
