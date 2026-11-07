# Audio job posts hide the methodology sprisk needs

**Bottom line:** sprisk should first add audio methodology rules: group-aware splits, duplicate checks, frozen pretrained embeddings at the right sample rate, and probe-versus-baseline evaluation with confidence intervals. Job posts do not name these rules. But the field's methodology treats them as mandatory, and they fit the user's music work directly. We read 114 postings from 2025-2026 across four segments. Employers mostly ask for credentials (graduate degree 50%, Python 48%, PyTorch 39%, publications 32%) and for speech and deployment skills (ASR 27%, real-time 30%, on-device 27%, latency 26%). Named features and metrics almost never appear. WER shows up once in 114 postings. SI-SDR, PESQ, FAD and librosa never appear. Split rules show up once. This silence does not mean the skills are optional. Employers assume them. Peer-reviewed methodology shows that results without them are not credible. So sprisk should build tooling for the methodology first and for what job posts name second. Music ML is a small slice of the job market: no music posting was found in South Asia or the Middle East. The user's music work is still a good test case for the same rules.

## 114 postings, four segments, uneven evidence

| Segment | N | How it was read | How it was tagged |
|---|---|---|---|
| Big tech and streaming (Apple, Amazon, Spotify, Google, Microsoft, Meta, ByteDance, Deezer, SoundCloud) | 35 | All full text | Manual reading |
| Voice-AI and generative-audio startups (Deepgram, ElevenLabs, Cartesia, Sesame, Suno, Udio, others) | 34 | All full text, from ATS APIs | Keyword regex, with repeated boilerplate removed |
| Hardware, pro-audio, hearing, automotive (Bose, Dolby, Sonos, Qualcomm, Cirrus, Sonova, others) | 24 | 15 full text, 9 snippets | Manual reading |
| Regional (India, Pakistan, Middle East, Europe beyond big tech) | 21 | 8 full text, 13 snippets | Manual reading |
| **Total** | **114** | **92 full text, 22 snippets** | Mixed |

### How far to trust the counts

- **Fairly reliable:** the big-tech and startup segments. All 69 postings are full text.
- **Lower bounds:** the 22 snippet rows. They show fewer requirements than the real postings list. A zero there means "not visible", not "not required".
- **Tagging differs by segment.** The startup segment used regex. That catches broad phrases like "evaluation" generously. It probably undercounts Python, because company-wide sentences were stripped first.
- **Category definitions differ slightly.** For example, "foundation models" in big tech versus "SSL encoders" in startups. Combined counts are approximate, roughly within ±3.
- **The sample is not random.** Apple (9), Amazon (9) and Deepgram (7) are over-represented. Amazon's boilerplate "Java, C++, Python" line inflates the language counts.
- **Coverage gaps:** Netflix, Shazam, TikTok music, YouTube Music, Native Instruments, Ableton, JioSaavn and Anghami had no readable 2025-2026 ML posting.
- **The market-size figures are weak.** Claims like "voice AI hiring up 64%" come from vendor blogs with no primary data ([RecruitingTechReviews](https://recruitingtechreviews.com/research/ai-recruiting-talent-market-2026); [CallSphere](https://callsphere.ai/blog/vw9c-ai-voice-engineer-hiring-market-2026-salaries-comp)). The direction is credible. One example: 22% of a recent YC class was building voice products ([a16z](https://a16z.com/ai-voice-agents-2025-update/)). The exact percentages are not.

## Employers name credentials, speech tasks and deployment, not methods

### Combined ranked frequency table (N = 114)

- A dash (–) means that segment's tagging did not track the item.
- Every count traces to a cited posting in the research notes. Examples: [Spotify GenAudio](https://jobs.lever.co/spotify/0eebb462-b5a2-4e3a-b830-d8ef7505b014), [Rime](https://jobs.ashbyhq.com/rime/b76243da-3ce0-463e-9f29-2b6d1b78666e), [Bose](https://www.builtinboston.com/job/principal-audio-dsp-ml-engineer-audio-technology/11322768), [Gnani.ai](https://freehire.me/jobs/gnani-ai-senior-staff-engineer-tts-system-gnani-innovations-fxbgjdqt).

| Rank | Requirement | Bucket | Big tech /35 | Startups /34 | Hardware /24 | Regional /21 | **Total /114** | % |
|---|---|---|---|---|---|---|---|---|
| 1 | Graduate degree (MS/PhD) mentioned | Stack | 27 | 9 | 12 | 9 | **57** | 50% |
| 2 | Python | Stack | 24 | 10 | 16 | 5 | **55** | 48% |
| 3 | PyTorch | Stack | 16 | 13 | 10 | 5 | **44** | 39% |
| 4 | Publications / named venues | Stack | 16 | 14 | 5 | 1 | **36** | 32% |
| 5 | Evaluation design / benchmarks (generic) | Eval | 6 | 22 | 6 | 0 | **34** | 30% |
| 5 | Real-time / streaming | Deploy | 10 | 12 | 9 | 3 | **34** | 30% |
| 7 | Dataset curation / collection | Data | 7 | 16 | 7 | 3 | **33** | 29% |
| 8 | Classical / spectral DSP | Features | 8 | 3 | 14 | 7 | **32** | 28% |
| 9 | ASR (incl. keyword spotting) | Task | 14 | 6 | 4 | 7 | **31** | 27% |
| 9 | On-device / edge / embedded | Deploy | 7 | 8 | 14 | 2 | **31** | 27% |
| 11 | Latency / RTF / inference cost | Deploy | 8 | 14 | 4 | 4 | **30** | 26% |
| 12 | TTS / speech synthesis | Task | 13 | 9 | 1 | 5 | **28** | 25% |
| 12 | Audio / music / speech generation | Task | 9 | 13 | 3 | 3 | **28** | 25% |
| 14 | TensorFlow / JAX | Stack | 13 | 2 | 7 | 5 | **27** | 24% |
| 15 | C / C++ | Stack | 10 | 1 | 11 | 3 | **25** | 22% |
| 16 | Foundation / SSL audio models (named or generic) | Models | 10 | 5 | 5 | 4 | **~24** | 21% |
| 17 | Cloud / GPU serving at scale | Deploy | 12 | 8 | 0 | 3 | **23** | 20% |
| 18 | Post-training / RLHF / DPO | Models | 10 | 10 | 0 | 0 | **20** | 18% |
| 18 | Large-scale data pipelines | Data | 8 | 12 | – | 0 | **20** | 18% |
| 18 | Transformers / conformers | Models | 5 | 5 | 4 | 6 | **20** | 18% |
| 21 | Speech LLMs / LLM + audio | Models | 10 | 5 | 0 | 4 | **19** | 17% |
| 22 | Quantization / distillation / pruning | Deploy | 5 | 7 | 3 | 3 | **18** | 16% |
| 23 | Speech enhancement / denoising / echo cancellation | Task | 6 | 1 | 9 | 1 | **17** | 15% |
| 24 | Data quality / filtering | Data | 5 | 9 | 1 | 1 | **16** | 14% |
| 25 | Statistical rigor / ablations / experiment design | Eval | 3 | 9 | 1 | 1 | **14** | 12% |
| 26 | Labeling / annotation | Data | 4 | 5 | 1 | 3 | **13** | 11% |
| 27 | Diffusion / flow matching | Models | 4 | 4 | 1 | 3 | **12** | 11% |
| 28 | MOS / listening / human preference tests | Eval | 2 | 5–8 | 3 | 1 | **11–14** | 10–12% |
| 29 | Neural audio codecs (EnCodec, DAC, Mimi) | Models | 3 | 6 | 0 | 2 | **11** | 10% |
| 29 | "No degree required" stated | Stack | – | 11 | – | – | **11** | 10% |
| 31 | ONNX / TensorRT / TFLite / Triton | Deploy | 0 | 5 | 2 | 3 | **10** | 9% |
| 32 | Music / audio recommendation | Task | 7 | 1 | 0 | 0 | **8** | 7% |
| 32 | A/B tests / online experiments | Eval | 6 | 2 | 0 | 0 | **8** | 7% |
| 34 | Beamforming / spatial / multichannel | Task | – | – | 7 | – | **≥7** | ≥6% |
| 35 | Low-resource / dialect / code-switching data | Data | – | – | – | 6 | **≥6** | ≥5% |
| 35 | Speaker ID / diarization | Task | 4 | 0 | 0 | 2 | **6** | 5% |
| 35 | Privacy | Data | 3 | 2 | 1 | 0 | **6** | 5% |
| 35 | Synthetic data | Data | 1 | 4 | 0 | 1 | **6** | 5% |
| 39 | Source separation | Task | 1 | 0 | 2 | 2 | **5** | 4% |
| 40 | MIR named as a field | Task | 2 | 0 | 0 | 2 | **4** | 4% |
| 40 | Music / audio tagging / classification | Task | 4 | 0 | 0 | 0 | **4** | 4% |
| 40 | Augmentation | Data | 1 | 2 | 1 | 0 | **4** | 4% |
| 43 | Sound event / scene detection | Task | 0 | 0 | 3 | 0 | **3** | 3% |
| 43 | Licensing / consent / rights | Data | 3 | 0 | 0 | 0 | **3** | 3% |
| 45 | mel, MFCC, CQT or f0 named | Features | 0 | 1 | 0 | 1 | **2** | 2% |
| 46 | WER / CER | Eval | 0 | 0 | 0 | 1 | **1** | 1% |
| 46 | Leakage / split rules | Data | 0 | 1 | 0 | 0 | **1** | 1% |
| 46 | Acoustic anomaly detection | Task | 0 | 0 | 1 | 0 | **1** | 1% |
| – | SI-SDR, PESQ/STOI, FAD | Eval | 0 | 0 | 0 | 0 | **0** | 0% |
| – | librosa / torchaudio | Stack | 0 | 0 | 0 | 0 | **0** | 0% |
| – | Audio-text retrieval | Task | 0 | 0 | 0 | 0 | **0** | 0% |
| – | CLAP or MERT by name | Models | 0 | not confirmed | 0 | 0 | **0 confirmed** | 0% |

### What stands out

- **Credentials lead.** Half the postings mention a graduate degree. A third ask for publications. Startups are the exception: 11 of 34 say no degree is needed ([ElevenLabs](https://jobs.ashbyhq.com/ElevenLabs/2d7f9a7c-a9e6-4877-bb38-34e4d989054c); [Hume AI](https://jobs.ashbyhq.com/hume-ai/36e92e2b-26c5-4bdf-b9e6-628ae8747a8c)).
- **Speech dominates.** ASR, TTS and generation are the top tasks. Speech LLMs and post-training (RLHF, DPO) have replaced classic ASR pipelines as the headline skill at Apple, Amazon, Google and Spotify ([Apple Siri Speech](https://jobs.apple.com/en-us/details/200693064-0836/machine-learning-engineer-siri-speech); [Amazon AGI](https://www.amazon.jobs/en/jobs/10591057/principal-applied-scientist-real-time-conversational-ai-agi)).
- **Deployment is the second axis.** Real-time, on-device and latency each appear in about a quarter to a third of postings.
- **Evaluation is asked for, but vaguely.** "Design evals" appears in 30% of postings. A named metric appears in about 1%.
- **Data work is about scale and quality.** Curation (29%) and filtering (14%) are common. Leakage, licensing and privacy are rare.

## Each segment screens for something different

| Segment | What it screens for | Example |
|---|---|---|
| Big tech speech roles (23 of 35) | PhD, publications, ASR/TTS, speech LLMs, on-device | [Apple Conversational Speech](https://jobs.apple.com/en-us/details/200653966-0836/machine-learning-architect-conversational-speech) |
| Big tech music roles (12 of 35) | Recommendation and search ML, Spark/SQL, A/B tests. Little audio. | [SoundCloud](https://job-boards.greenhouse.io/soundcloud71/jobs/8829912002) |
| Startups | Eval design, data curation, latency, codecs, post-training | [Cartesia Evals](https://jobs.ashbyhq.com/cartesia/53fb0b93-d49d-47c7-a679-35ee76b007c5) |
| Hardware | DSP fundamentals, C/C++, embedded, enhancement, beamforming | [Cirrus Logic](https://freehire.me/jobs/embedded-audio-firmware-engineer-cirrus-logic-uabbfrql) |
| India | Indic ASR/TTS, code-switching, streaming, ONNX/TensorRT | [Sarvam AI](https://jobs.khoslaventures.com/companies/sarvam-ai-2/jobs/51571077-machine-learning-engineer-speech-ai-asr-tts-2-3-years) |
| Pakistan, Middle East | Mostly speech data and annotation (Urdu, Punjabi, Emirati Arabic) | [Annotation Academy](https://annotation.academy/jobs/cmrnn6tnk00dw1vw3px49sqrh) |
| Europe labs | MIR, music generation, audio coding | [RITMO MIR postdoc](https://www.auditory.org/postings/2026/152.html); [Sony AI](https://ellis.eu/research/jobs/2026-04-30-researcher-on-ml-for-musicaudio) |

### Music is a small, specific slice

- Music tasks (recommendation, tagging, MIR) total about 16 mentions in 114 postings.
- No posting names beat, key, chord or pitch tasks.
- Streaming firms describe outcomes instead: "tagging music content", "content understanding", "AutoMix" ([Amazon MusicIQ](https://www.amazon.jobs/en/jobs/10557456/machine-learning-engineer-ii-amazon-music-musiciq); [Apple Generative Audio](https://jobs.apple.com/en-us/details/200693132-2114/machine-learning-researcher-apple-services-engineering-generative-audio)).
- All three licensing/consent mentions come from music-generation roles ([Spotify AI Music Lab](https://jobs.lever.co/spotify/0eebb462-b5a2-4e3a-b830-d8ef7505b014); [Spotify data scientist](https://jobs.lever.co/spotify/babebec3-0061-4c39-a4ad-c51a54d23567)).
- The closest match to the user's preference-modeling work is Suno's discovery role. It asks for "models of user preference, similarity, and engagement" from "sparse, noisy" data ([Suno](https://jobs.ashbyhq.com/suno/e94b6a03-6315-45c2-a439-51630af15f05)).
- No music ML posting was found in South Asia or the Middle East. Anghami does music recommendation ML but showed no open roles ([Anghami Talks](https://talks.anghami.com/simple-re-ranker-for-personalized-music-recommendation-at-anghami/)).

## Job text omits what methodology makes mandatory

### Why the job text is silent

- Postings list outcomes and credentials. They assume method knowledge.
- Hardware postings say "DSP fundamentals" instead of naming mel or MFCC.
- ASR startups talk about "accuracy of production models" without saying WER ([AssemblyAI](https://job-boards.greenhouse.io/assemblyai/jobs/4729671005)).
- A rare posting that does name methods asks for the exact rules sprisk lacks. Rime asks candidates to catch "when an eval set has leakage" ([Rime](https://jobs.ashbyhq.com/rime/b76243da-3ce0-463e-9f29-2b6d1b78666e)). Deepgram asks for data characterized by "languages, conditions, domains, speakers, quality" ([Deepgram](https://jobs.ashbyhq.com/Deepgram/ba60a541-fdf7-44bf-a6bb-0e821f15af54)).
- **What this means for the decision:** a 1% count for "leakage" does not show low importance. It shows the topic is invisible in job text. Use methodology sources to decide what sprisk must check. Use job counts to decide which tasks and stacks to cover.

### What the methodology treats as mandatory

| Practice | What the sources say | Source |
|---|---|---|
| Group-disjoint splits | Keep each artist entirely in train or test. Same-artist songs share production cues that inflate scores. | [Flexer, ISMIR 2007](https://ismir2007.ismir.net/proceedings/ISMIR2007_p341_flexer.pdf) |
| Track-level grouping of clips | "DO NOT RANDOM SPLIT" MagnaTagATune's clips. They come from the same tracks. | [ISMIR 2021 tutorial](https://music-classification.github.io/tutorial/part2_basics/dataset.html) |
| Official artist-disjoint splits | MTG-Jamendo ships artist-disjoint splits. | [MTG-Jamendo](https://mtg.github.io/mtg-jamendo-dataset/) |
| Distrust flawed benchmarks | GTZAN has repeats, mislabels and artist over-representation. Its faults affect systems unequally. | [Sturm](https://arxiv.org/abs/1306.1461) |
| Deduplication | Remove exact audio-hash duplicates and near-duplicates. | [arXiv 2507.07867](https://arxiv.org/html/2507.07867v2) (secondary summary) |
| Native sample rate | Encoders expect a fixed rate. MERT-v1 needs 24 kHz. | [MERT model card](https://huggingface.co/m-a-p/MERT-v1-95M) |
| Layer choice | Layers differ per task. A weighted sum of layers beats the last layer alone. | [SUPERB](https://arxiv.org/pdf/2404.09385); [MERT card](https://huggingface.co/m-a-p/MERT-v1-95M) |
| Frozen-embedding probes | Benchmarks freeze the encoder and train a shallow head. | [HEAR](https://arxiv.org/pdf/2203.03022); [MARBLE](https://arxiv.org/abs/2306.10548) |
| Fully reported listening tests | The same three TTS systems got at least three different MOS rankings under different settings. | [Chiang et al., Interspeech 2023](https://www.isca-archive.org/interspeech_2023/chiang23_interspeech.pdf) |
| FAD only with caveats | FAD depends on the embedding, has sample-size bias, and tracks human judgment poorly for music. | [Microsoft Research](https://www.microsoft.com/en-us/research/publication/adapting-frechet-audio-distance-for-generative-music-evaluation/); [arXiv 2506.19085](https://arxiv.org/pdf/2506.19085) |
| Lock external data before test | DCASE freezes the list of external models and data once the eval set is out. | [DCASE 2025 rules](https://dcase.community/challenge2025/rules) |
| Training-data disclosure | The EU AI Act requires general-purpose model providers to publish a training-data summary from August 2025. | [European Commission](https://digital-strategy.ec.europa.eu/en/news/commission-presents-template-general-purpose-ai-model-providers-summarise-data-used-train-their-model) |

### One stack change matters for sprisk's decode step

- torchaudio's decode and encode APIs were deprecated in 2.8 and removed in 2.9. Users are told to move to TorchCodec ([pytorch/audio #3902](https://github.com/pytorch/audio/issues/3902)).
- sprisk's audio I/O should not depend on torchaudio. soundfile, librosa or TorchCodec are safe.

## Recommendation: what audio tech sprisk needs

sprisk already has decode/audit, librosa features, openSMILE, VAD, transcription and diarization. The gaps are methodology rules and pretrained embeddings.

### Must (build first)

| # | Capability | Reason | Fit with the user's music work |
|---|---|---|---|
| 1 | **Group-aware split rule.** Choose the split from a grouping key (artist, track, speaker, listener). Refuse random clip-level splits when a group key exists. | Methodology calls it mandatory ([Flexer](https://ismir2007.ismir.net/proceedings/ISMIR2007_p341_flexer.pdf); [ISMIR tutorial](https://music-classification.github.io/tutorial/part2_basics/dataset.html)). Job text names it once in 114, because it is assumed. | Core for preference modeling. Split by artist and by listener so scores are not inflated. |
| 2 | **Duplicate and near-duplicate leakage check.** Hash audio, then flag near-duplicates by embedding or mel distance across split boundaries. | Curation appears in 29% of postings and quality filtering in 14%. Dedup is a standard sanitizing step ([arXiv 2507.07867](https://arxiv.org/html/2507.07867v2)). | South Asian catalogs have many re-uploads and re-releases of the same recording. |
| 3 | **Frozen pretrained embedding step with a sample-rate rule.** Start with MERT and CLAP. Add one speech encoder (WavLM or Whisper encoder). Resample to each model's native rate and record it as evidence. | Foundation/SSL models appear in about 21% of postings. Benchmarks are built on frozen encoders ([HEAR](https://arxiv.org/pdf/2203.03022); [MARBLE](https://arxiv.org/abs/2306.10548)). MERT needs 24 kHz ([MERT card](https://huggingface.co/m-a-p/MERT-v1-95M)). | The user already works with CLAP and MERT. |
| 4 | **Layer-sweep and probe-versus-baseline rule.** Compare a shallow probe on each encoder layer (or a learned layer weighting) against the existing librosa/openSMILE baseline. Report bootstrap confidence intervals. | The last layer alone underestimates an encoder ([SUPERB](https://arxiv.org/pdf/2404.09385)). Eval design is the most common eval requirement (30%). Statistical rigor and ablations appear in 12%. | Shows whether MERT/CLAP beat hand-crafted pitch and timbre features on the user's own labels. |
| 5 | **Task-to-metric rule plus sliced error analysis.** Pick the metric by task type. Then slice errors by group: artist, language, recording condition, era. | Postings ask for "representative benchmarking" across "languages, conditions, domains, speakers" ([Deepgram](https://jobs.ashbyhq.com/Deepgram/ba60a541-fdf7-44bf-a6bb-0e821f15af54)). Gnani names MOS, WER, RTF and speaker similarity ([Gnani.ai](https://freehire.me/jobs/gnani-ai-senior-staff-engineer-tts-system-gnani-innovations-fxbgjdqt)). | Exposes whether a model fails on specific regions, languages or older recordings. |

### Should (build next)

| # | Capability | Reason | Fit with the user's music work |
|---|---|---|---|
| 6 | **Provenance and consent record in the audit step.** Store source type, license and consent status per file. Group sources the way the EU template does. | The EU AI Act template makes disclosure a legal topic ([European Commission](https://digital-strategy.ec.europa.eu/en/news/commission-presents-template-general-purpose-ai-model-providers-summarise-data-used-train-their-model)). All 3 licensing mentions are music roles. | Matches the user's rule: research-only replay data, consented data for product. |
| 7 | **Audio quality filter rules.** Read decode/audit and VAD evidence. Flag clipping, silence, low SNR, wrong sample rate and live recordings. | Data quality appears in 14% of postings. ElevenLabs asks for "quality filters" and "deduplication, quality scoring" ([ElevenLabs](https://jobs.ashbyhq.com/ElevenLabs/9fbd9227-57e0-4221-9255-1a1d967be8ed)). | The user's scope is studio recordings only. A live-upload flag enforces it. |
| 8 | **Pitch and intonation features.** f0 contour, pitch stability and deviation from a reference scale. | Named in 0 postings. Prosody appears only in regional TTS roles ([Sarvam AI](https://jobs.khoslaventures.com/companies/sarvam-ai-2/jobs/51571077-machine-learning-engineer-speech-ai-asr-tts-2-3-years)). The case rests on user fit, not demand. | Central to Eastern music, where ornamentation and intonation carry meaning. |
| 9 | **Human-rating protocol rule.** Check that rating tests report scale, rater count, calibration and playback setup. Report confidence intervals. | Listening tests appear in 10-12% of postings. Under-reported MOS gives unstable rankings ([Chiang et al.](https://www.isca-archive.org/interspeech_2023/chiang23_interspeech.pdf); [arXiv 2510.06927](https://arxiv.org/pdf/2510.06927)). | Adapt it to implicit listening signals. Check label noise and agreement instead of asking A-vs-B questions. |
| 10 | **Latency / real-time factor evidence per step.** Record processing time per audio second. | Latency (26%) and real-time (30%) are the most common deployment requirements. | Useful if the player scores tracks live. |

### Later

| # | Capability | Reason |
|---|---|---|
| 11 | Source separation step (vocals versus accompaniment) | 5 of 114 postings. It would help isolate vocal intonation in dense mixes. |
| 12 | A/B test and online-experiment analysis rules | 8 of 114, all at streaming firms. Relevant once the player has real users. |
| 13 | Codec embeddings (EnCodec, DAC) | 11 of 114, mostly generative roles. Studied as evaluation embeddings ([arXiv 2509.18823](https://arxiv.org/pdf/2509.18823)). |
| 14 | Generative-audio metrics (FAD, KAD with several encoders) | 0 of 114 postings. FAD is unreliable alone. The user does not generate audio. |
| 15 | Export and compression (ONNX, TFLite, quantization) | 10 and 18 of 114. This is deployment, outside a local workbench's core job. |
| 16 | Speech LLMs, post-training, RLHF | 20 of 114, but it means training foundation models. That is out of scope for sprisk. |
| 17 | Beamforming, echo cancellation, multichannel | Hardware-only demand. It does not fit music analysis. |

## Conclusion

- **The job market and the methodology answer different questions.** Postings show where audio ML jobs are: speech, real-time systems and devices. Methodology shows what makes any audio result credible. sprisk is a methodology engine, so the methodology should set the Must tier.
- **The scarce skill is trustworthy evaluation.** Startups ask for eval design more than any other single item. Almost no posting names a metric or a split rule. A workbench that encodes those rules fills exactly this gap.
- **The music work is the right first test case.** Artist leakage, duplicate recordings and encoder sample rates are well-documented music failures. Rules built and tested there carry over to speech with a different grouping key (speaker instead of artist).
- **Open questions:** music-ML hiring in South Asia and at pro-audio firms is unmeasured. Its absence here is a sourcing gap, not proof of zero demand.
