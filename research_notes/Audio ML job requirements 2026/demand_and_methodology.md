# Audio ML demand evidence (2025-2026) and standard methodology for audio ML projects

Source-quality note: there is no rigorous, audio-specific labor-market dataset (no LinkedIn Economic Graph, Stack Overflow, or Kaggle cut for "audio ML" was found). Most quantitative demand numbers come from vendor blogs and recruiter-style aggregators. They are flagged below. Methodology evidence (Part B) rests on peer-reviewed papers and official benchmark/challenge pages, so it is much stronger.

## Q1. Which audio tasks and skills are most in demand in 2025-2026, with any quantitative evidence?

### Takeaway
Voice/speech AI (real-time voice agents combining STT + LLM + TTS) is the clearest growth area. The numbers that quantify it come from low-rigor vendor blogs, so the direction is credible but exact percentages are not.

### Cited Findings
- a16z's "AI Voice Agents: 2025 Update" says the voice-agent market "exploded" in H2 2024; 22% of the latest YC class was building voice products; OpenAI cut GPT-4o realtime API prices by 60-87.5% in Dec 2024; the field is moving "from the infrastructure to application layer" — [a16z](https://a16z.com/ai-voice-agents-2025-update/)
- YC voice-agent founders are ~69% B2B, ~18% healthcare, ~13% consumer (secondary summary of a16z data) — [Specter summary](https://insights.tryspecter.com/ai-voice-agent-2025-a16z-landscape/)
- Claim: voice and speech-AI engineering is "the fastest-growing technical job family" across a tracked vendor set, hiring up 64% YoY; median posting-to-fill time 6.8 months vs 3.1 months for general senior SWE. LOW-RIGOR source (recruiting-tool review site, methodology not verifiable) — [RecruitingTechReviews](https://recruitingtechreviews.com/research/ai-recruiting-talent-market-2026)
- Claim: AI/ML hiring grew 88% YoY through 2025; 76% of employers cannot fill AI roles; multimodal (text+audio+vision) experience earns 25%+ over text-only; production voice experience earns 30-50% over generalist ML. Source is a voice-agent vendor blog (CallSphere) citing Ravio/Acceler8/Pin surveys; the multimodal and voice premiums are CallSphere's own "analysis" — [CallSphere](https://callsphere.ai/blog/vw9c-ai-voice-engineer-hiring-market-2026-salaries-comp)
- Claim: multimodal AI engineer roles up 62% as audio/video/vision-language models move to production. Aggregator blog, unverified — [AI Talent Report](https://aitalentreport.blog/ai-hiring-trends-q2-2026/)
- Salary snapshot: ZipRecruiter lists "AI Voice" average ~$48/hr in the US (bulk $39-$60/hr); "AI Audio" jobs $50k-$151k; Glassdoor showed 1,217 remote "audio ai" postings (June 2026). Note these titles mix ML engineers with voice-data and annotation work — [ZipRecruiter AI Voice](https://www.ziprecruiter.com/Jobs/Ai-Voice); [ZipRecruiter Audio ML](https://www.ziprecruiter.com/Jobs/Audio-Machine-Learning); [Glassdoor](https://www.glassdoor.com/Job/remote-audio-ai-jobs-SRCH_IL.0,6_IS11047_KO7,15.htm)
- Skills listed for voice AI engineers: Python, LLM APIs, conversation prompt design, STT/TTS APIs, audio processing (accents, noise), and real-time systems (WebSockets, streaming) — [Zen van Riel](https://zenvanriel.com/job/how-to-become-voice-ai-engineer); employers also need telephony, testing, and deployment judgement — [Martyn Redstone, Substack](https://owntheconversation.substack.com/p/voice-ai-needs-more-than-a-good-voice)
- Audio-industry (non-ML) demand: spatial audio (Dolby Atmos), AI tool integration, game audio middleware (FMOD, Wwise) named as most-recruited audio skills for 2026 — [Musitechnic blog](https://blog.musitechnic.com/blog/audio-industry-trends-2026-future-sound-ai)
- Generative music commercial context: UMG settled with Udio (Oct 2025) on a licensing basis; Warner settled with Udio and then Suno (Nov 2025) — [AI Vortex tracker](https://www.aivortex.io/legal/ai-case-law/suno-udio-music-ai/)
- Research-side shift toward audio-language models: DCASE 2025 added an Audio Question Answering task allowing open-source LLMs — [DCASE 2025 AQA](https://dcase.community/challenge2025/task-audio-question-answering); NVIDIA's Music Flamingo scales music understanding in audio-LMs — [arXiv 2511.10289](https://arxiv.org/pdf/2511.10289)

### Inferences
- The 2024 → 2026 shift is toward speech-to-LLM-to-speech systems and audio-language models. Real-time latency, streaming, and evaluation of conversational quality are the differentiating skills.
- Generative music is moving from a legal grey zone to licensed models. That raises demand for data provenance and licensing skills, not just modeling.
- Music ML (tagging, recommendation, MIR) is a much smaller job market than speech/voice. I found no quantitative evidence of its size.

### Gaps
- No audio-specific cut from LinkedIn Economic Graph, Indeed Hiring Lab, Stack Overflow, or Kaggle surveys was found.
- No ISMIR/ICASSP/Interspeech industry-track or job-board summaries with numbers were found.
- No quantitative evidence on whether classical DSP demand is declining or persisting. On-device audio demand is also unquantified.
- The 64%/88%/62% figures could not be traced to a primary dataset. Treat them as indicative only.

## Q2. Which tools, libraries, and model families are de facto standard?

### Takeaway
PyTorch plus Hugging Face is the default stack. Benchmark ecosystems standardize on frozen pretrained encoders (wav2vec2/HuBERT/WavLM for speech, MERT for music). A notable 2025-2026 change: torchaudio went into maintenance mode, and audio I/O moved to TorchCodec.

### Cited Findings
- torchaudio entered a maintenance phase: decode/encode APIs deprecated in 2.8 (Aug 2025), removed in 2.9; users told to migrate to TorchCodec. Some ops kept (lfilter, RNNTLoss, forced_align) — [pytorch/audio issue #3902](https://github.com/pytorch/audio/issues/3902)
- Downstream projects hit this directly (e.g., silero-vad asking "What to replace torchaudio with?") — [silero-vad #703](https://github.com/snakers4/silero-vad/issues/703); [silero-vad #667](https://github.com/snakers4/silero-vad/issues/667)
- MERT (music SSL encoder) ships on Hugging Face; MERT-v1 runs at 24 kHz and outputs 13 hidden layers. The model card says each layer performs differently per task, "you should choose empirically" — [HF MERT-v1-95M](https://huggingface.co/m-a-p/MERT-v1-95M); [MERT GitHub](https://github.com/yizhilll/MERT)
- MARBLE evaluates open-source music encoders (MERT and baselines) under one protocol — [MARBLE arXiv](https://arxiv.org/abs/2306.10548)
- SUPERB is the standard frozen-upstream evaluation for speech SSL models, extended to multilingual in ML-SUPERB — [SUPERB large-scale eval](https://arxiv.org/pdf/2404.09385); [ML-SUPERB](https://arxiv.org/pdf/2305.10615)
- DCASE 2025 allowed-pretrained lists include VGGish, PyTorch Image Models, torchvision models, Meta AI models on Hugging Face, and Fairseq models — [DCASE 2025 rules](https://dcase.community/challenge2025/rules)
- Codec embeddings (EnCodec/DAC-style) are being studied as evaluation embeddings for generative audio — [arXiv 2509.18823](https://arxiv.org/pdf/2509.18823)
- FAD studies commonly use music encoders such as MERT and CLAP variants as the embedding backbone — [Emergent Mind FAD summary](https://www.emergentmind.com/topics/frechet-audio-distance-fad); [Microsoft Research, Adapting FAD](https://www.microsoft.com/en-us/research/publication/adapting-frechet-audio-distance-for-generative-music-evaluation/)

### Inferences
- A current portfolio should not depend on torchaudio I/O. Use TorchCodec or soundfile/librosa for loading.
- Knowing how to extract and probe intermediate layers of a frozen encoder is a standard, expected skill.

### Gaps
- No usage-share survey for ESPnet vs NeMo vs SpeechBrain vs HF transformers was found.
- Whisper and CLAP sample rates (16 kHz and 48 kHz) were not verified in this session from primary model cards.

## Q3. What evaluation and data practices are considered mandatory for credible audio ML results?

### Takeaway
The core rules are: group-disjoint splits (artist / track / speaker), deduplication, the encoder's native sample rate, frozen-embedding probes on standard benchmarks, task-correct metrics, fully reported listening tests, and documented data provenance and licensing.

### Cited Findings
**Splits and leakage**
- Artist filter: keep all songs by one artist entirely in train or entirely in test. Same-artist songs share production cues that inflate scores — [Flexer, ISMIR 2007](https://ismir2007.ismir.net/proceedings/ISMIR2007_p341_flexer.pdf)
- ISMIR 2021 music-classification tutorial: MagnaTagATune "DO NOT RANDOM SPLIT 25,863 clips! They're from the same track!"; split by track. GTZAN has "heavy artist repetition" often ignored. Some MSD splits have artist leakage; use the CALS artist-level stratified split — [Won, Spijkervet, Choi tutorial](https://music-classification.github.io/tutorial/part2_basics/dataset.html)
- MTG-Jamendo's official splits are artist-disjoint, with no track in more than one set — [MTG-Jamendo](https://mtg.github.io/mtg-jamendo-dataset/)
- Training splits can be sanitized by removing duplicate IDs, exact audio-hash duplicates, and near-duplicates found via mel-spectrogram descriptors — (secondary search summary; primary page not confirmed) [Re-Bottleneck arXiv 2507.07867](https://arxiv.org/html/2507.07867v2)

**Benchmarks and probing protocol**
- HEAR: 19 tasks (speech, music, environmental), frozen embeddings + shallow MLP; 14 of 19 tasks were secret to prevent overfitting — [HEAR arXiv 2203.03022](https://arxiv.org/pdf/2203.03022); [HEAR GitHub](https://github.com/hearbenchmark)
- MARBLE: 18 tasks on 12 public datasets (MTT, MTG-Jamendo, GTZAN, GiantSteps, EmoMusic, VocalSet, etc.) under a unified protocol — [MARBLE arXiv](https://arxiv.org/html/2306.10548); [NeurIPS 2023 paper](https://proceedings.neurips.cc/paper_files/paper/2023/file/7cbeec46f979618beafb4f46d8f39f36-Paper-Datasets_and_Benchmarks.pdf)
- SUPERB: upstream frozen; a learnable weighted sum over all hidden layers feeds a light task head. This beats using only the last layer — [SUPERB arXiv 2404.09385](https://arxiv.org/pdf/2404.09385)
- Newer encoder benchmark X-ARES extends the HEAR-style frame — [X-ARES arXiv 2505.16369](https://arxiv.org/pdf/2505.16369)

**Sample rate**
- Pretrained encoders expect a fixed rate (MERT-v1: 24 kHz). The model card's example resamples when rates differ — [HF MERT-v1-95M](https://huggingface.co/m-a-p/MERT-v1-95M)

**Challenge rules (DCASE)**
- External data and models must be public and freely available before a cutoff date, declared to organizers, and the list is locked once the evaluation set is released — [DCASE 2025 rules](https://dcase.community/challenge2025/rules)

**Metrics and listening tests**
- FAD has known problems: it depends on the embedding model, assumes Gaussian embeddings, has sample-size bias, cannot score single clips, and correlates poorly with human judgment for music — [Emergent Mind FAD](https://www.emergentmind.com/topics/frechet-audio-distance-fad); [Microsoft Research](https://www.microsoft.com/en-us/research/publication/adapting-frechet-audio-distance-for-generative-music-evaluation/); [Human preference benchmark, arXiv 2506.19085](https://arxiv.org/pdf/2506.19085)
- Proposed fixes: per-song FAD, multiple encoders, Kernel Audio Distance (MMD-based) — [Emergent Mind FAD](https://www.emergentmind.com/topics/frechet-audio-distance-fad)
- FAD correlation with human perception of environmental audio is embedding-dependent — [ResearchGate](https://www.researchgate.net/publication/386037783_Correlation_of_Frechet_Audio_Distance_With_Human_Perception_of_Environmental_Audio_Is_Embedding_Dependent)
- MOS tests on three TTS systems under different settings produced at least three different rankings. Most TTS papers do not report test details — [Chiang et al., Interspeech 2023](https://www.isca-archive.org/interspeech_2023/chiang23_interspeech.pdf)
- ITU-T P.808 defines crowdsourced listening protocol; papers often omit scale definitions, rater calibration, playback conditions — [Towards Responsible Evaluation for TTS, arXiv 2510.06927](https://arxiv.org/pdf/2510.06927); [Kirkland et al., SSW 2023](https://www.isca-archive.org/ssw_2023/kirkland23_ssw.pdf); [Rethinking MUSHRA](https://arxiv.org/pdf/2411.12719)

**Data licensing and documentation**
- EU AI Act: GPAI providers must publish a training-data summary using the Commission template (published July 24, 2025; obligation from Aug 2, 2025). Sources grouped as crawled/scraped, user, synthetic, other; must describe how rights reservations (opt-outs) are respected — [European Commission](https://digital-strategy.ec.europa.eu/en/news/commission-presents-template-general-purpose-ai-model-providers-summarise-data-used-train-their-model); [Mayer Brown](https://www.mayerbrown.com/en/insights/publications/2025/08/eu-ai-act-news-rules-on-general-purpose-ai-start-applying-guidelines-and-template-for-summary-of-training-data-finalized); [WilmerHale](https://www.wilmerhale.com/en/insights/blogs/wilmerhale-privacy-and-cybersecurity-law/european-commission-releases-mandatory-template-for-public-disclosure-of-ai-training-data)
- Suno copyright risk analysis across EU/US/China — [ScienceDirect 2026](https://www.sciencedirect.com/science/article/pii/S2212473X26000726)

### Inferences
- For a music project: artist-disjoint splits, track-level grouping of clips, and dedup (hash + near-duplicate) are the minimum. Without them, reviewers will discount reported numbers.
- For embedding work: report a frozen-encoder probe at the native sample rate, with a layer sweep or learnable layer weighting.
- For generative or quality claims: FAD alone is not enough. Pair it with a fully reported listening test.
- Dataset provenance and consent are now a legal disclosure topic in the EU, not just good practice.

### Gaps
- Datasheets for Datasets (Gebru et al.) and data cards were not fetched in this session. Cite separately if needed.
- Primary sources for WER, SI-SDR, PESQ, and mAP/ROC-AUC conventions for tagging were not fetched. The tutorial page fetched did not cover metrics.
- Speaker-disjoint split conventions for speech (e.g., VoxCeleb, LibriSpeech) were not fetched here.
- Cover-song / version detection as a dedup step: no primary source found.

## Q4. What do practitioners say is most often done wrong?

### Takeaway
The repeat offenders are leaky splits (same artist, track, or speaker on both sides), flawed benchmark datasets used uncritically, single distributional metrics, and under-reported listening tests.

### Cited Findings
- GTZAN appears in 100+ published works, yet has repetitions, mislabelings, distortions, and artist over-representation. Sturm showed these faults do not affect all systems equally, so GTZAN scores are not reliably comparable — [Sturm, arXiv 1306.1461](https://arxiv.org/abs/1306.1461)
- Classifiers can learn artist or production cues instead of genre (confounds) — [Sturm GTZAN](https://arxiv.org/pdf/1306.1461); [Characterising Confounding Effects, TISMIR](https://transactions.ismir.net/articles/10.5334/tismir.24)
- Validity threats in MIR experiments are broad and recurring — [Validity in MIR Experiments, arXiv 2301.01578](https://arxiv.org/pdf/2301.01578); [On Evaluation Validity in Music Autotagging](https://www.researchgate.net/publication/266376978_On_Evaluation_Validity_in_Music_Autotagging)
- Random clip-level split of MagnaTagATune leaks tracks across sets — [ISMIR tutorial](https://music-classification.github.io/tutorial/part2_basics/dataset.html)
- Data leakage also appears in cross-modal (audio-text) retrieval training — [arXiv 2302.12258](https://arxiv.org/html/2302.12258)
- Using only the last layer of an SSL encoder underestimates it — [SUPERB](https://arxiv.org/pdf/2404.09385); [MERT card](https://huggingface.co/m-a-p/MERT-v1-95M)
- "We conducted a MOS test" with no details is common and makes rankings unreliable — [Chiang et al. 2023](https://arxiv.org/pdf/2306.02044)
- FAD used alone, with one embedding and small sample sizes, misleads — [Microsoft Research](https://www.microsoft.com/en-us/research/publication/adapting-frechet-audio-distance-for-generative-music-evaluation/)
- DCASE locks external data after eval release to stop test-set-informed choices — [DCASE rules](https://dcase.community/challenge2025/rules)

### Inferences
- A credible small project should state its leakage controls explicitly in the README: grouping key, dedup method, and sample-rate handling.
- Hiring reviewers in music ML will likely check for GTZAN-only results and random splits first.

### Gaps
- No survey of practitioners (e.g., industry blog or panel) ranking the most common mistakes was found. The list above comes from methodology papers.
