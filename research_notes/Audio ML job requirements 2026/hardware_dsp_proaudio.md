# Audio ML job requirements at hardware, pro-audio, embedded, hearing-aid, automotive and industrial-acoustics companies (2025-2026)

## What do 2025-2026 audio ML / DSP+ML postings at these companies concretely require?

### Takeaway
N = 24 distinct postings examined. 15 have full text; 9 are only search-snippet level, so their counts are lower bounds. The near-universal requirements are Python (16/24), classical DSP fundamentals (14/24), on-device/embedded deployment (14/24) and C/C++ (11/24). Speech enhancement / noise suppression (9/24) and beamforming/spatial (7/24) are the dominant tasks. Named evaluation metrics (WER, SI-SDR, PESQ, STOI, POLQA, DNSMOS) appear in **zero** postings. Named input features (mel, MFCC, CQT, f0) also appear in **zero** postings.

### Method and caveats
- Sources: company career sites (Dolby, Harman, Bose, Sonova), and mirrors (Built In, freehire, dreamworkhq, Dice, cazvid). Many mirror pages returned 404/410 because the role had closed; those are recorded only where a search-snippet gave real requirement text.
- "Full" = I read the posting's responsibilities and requirements list. "Snippet" = requirements come from a search-engine summary of the posting page only. Snippet rows are undercounted.
- Duplicates merged: Sonos "Senior Machine Learning Scientist (ASR)" and "Senior Machine Learning Engineer" (Paris) have identical text, counted once (P7).
- Excluded from counts: Ableton "Senior Machine Learning Research Engineer" — known only from a news article (Jan 14, 2026) with no posting link and no requirements list — [letsdatascience](https://letsdatascience.com/news/ableton-hires-machine-learning-engineer-to-enhance-live-0e727647). Also excluded: non-target companies that showed up (Reolink, Audimee, Amazon/Fauna, Sesame).
- No postings found (in scope, with requirement text) for: Sennheiser, Knowles, Universal Audio, Native Instruments (other than iZotope), Steinberg/Yamaha, Roland, WS Audiology, Starkey (titles only), Cerence, Bose automotive.

### Evidence table

| # | Company | Title | Location | Date | Text | URL |
|---|---|---|---|---|---|---|
| P1 | Bose | Principal Audio DSP/ML Engineer – Audio Technology | Remote/Hybrid, MA, USA | 2026-09-21 | Full | [builtinboston](https://www.builtinboston.com/job/principal-audio-dsp-ml-engineer-audio-technology/11322768); [freehire](https://freehire.me/jobs/principal-audio-dsp-ml-engineer-audio-technology-careers-bose-com-pcbdyleg) |
| P2 | Bose | Audio Machine Learning Engineer Co-op | Framingham, MA, USA | 2026 (removed 2026-03-27; Jul–Dec 2026 program) | Full | [builtinboston](https://www.builtinboston.com/job/audio-machine-learning-engineer-co-op/8466457) |
| P3 | Bose | Embedded Audio ML Engineer Co-op | Framingham, MA, USA | seen 2026 | Full | [dreamworkhq](https://www.dreamworkhq.com/job/71f6f39f-753c-41cf-b7e3-ee093c06ba3c) |
| P4 | Cirrus Logic | Embedded Audio Firmware Engineer | Newbury, UK | 2026-10-20 | Full | [freehire](https://freehire.me/jobs/embedded-audio-firmware-engineer-cirrus-logic-uabbfrql) |
| P5 | Cirrus Logic | Embedded Software AI Intern | Austin, TX, USA | 2026 (removed 2026-06-23) | Full | [builtin](https://builtin.com/job/embedded-software-ai-intern/9863920) |
| P6 | Harman | Audio ML Engineer (Research) | Northridge, CA, USA | date unclear (seen 2026) | Full | [Harman careers](https://jobsearch.harman.com/en_US/careers/JobDetail/Audio-ML-Engineer-Research/30622) |
| P7 | Sonos | Senior ML Scientist (ASR) / Senior ML Engineer | Paris, France | 2026-06-04 | Full | [freehire](https://freehire.me/jobs/senior-machine-learning-engineer-sonos-ja4753yb); [dreamworkhq](https://www.dreamworkhq.com/job/dafaef74-4ba3-4576-bd62-b72e1ff31fe6) |
| P8 | Dolby | Research Scientist – Spatial Audio & AI | Atlanta, GA, USA | 2026-11-05 | Full | [Dolby careers](https://careers.dolby.com/job/Atlanta-Research-Scientist-Spatial-Audio-&-AI-GA-30301/1282538600/) |
| P9 | Dolby | PhD Research Intern – AI Music/Audio Generation | Beijing, China | 2026-11-05 | Full | [Dolby careers](https://careers.dolby.com/job/Beijing,-Chaoyang-District-PhD-Research-Intern-AI-MusicAudio-Generation/1417426200/) |
| P10 | Boston Dynamics (industrial acoustic monitoring) | Senior Staff Audio ML Engineer | Waltham, MA, USA | seen Nov 2026 | Full | [dreamworkhq](https://www.dreamworkhq.com/job/3c31d610-a9aa-4e8b-b416-3fa9a5e2ed58) |
| P11 | Qualcomm | Speech Audio Research Engineer | San Diego, CA, USA | 2026-08-28 | Full | [cazvid](https://cazvid.com/en/job/speech-audio-research-engineer-51860e0b) |
| P12 | Qualcomm | Audio Systems Engineer | Shanghai, China | 2026-10-13 | Full | [freehire](https://freehire.me/jobs/audio-systems-engineer-qualcomm-2r3usiy2) |
| P13 | Shure | Audio DSP Engineering Intern | Niles, IL, USA | seen 2026 | Full | [Dice](https://www.dice.com/job-detail/d455bfe5-e4bd-44dd-a560-8150be891e8f) |
| P14 | Sonova (Audatic) | Senior Deep Learning Engineer | Berlin, Germany | 2026-09-21 | Full | [freehire](https://freehire.me/jobs/senior-deep-learning-engineer-m-f-d-audatic-sonova-group-ccteo6h6) |
| P15 | Sonova (Audatic) | Data Scientist (Deep Learning) | Berlin, Germany | 2026-09-21 | Full | [freehire](https://freehire.me/jobs/data-scientist-deep-learning-m-f-d-sonova-group-swx525qs) |
| P16 | Sonova | Deep Learning Engineer | Stäfa, Switzerland | 2026-06 | Snippet | [jobs.ch](https://www.jobs.ch/en/vacancies/detail/140bf581-25aa-44e0-8f75-6d629258a5b0/) (now 404); [altjobs mirror](https://altjobs.startup-insider.com/job/deep-learning-engineer-3/) |
| P17 | GN Hearing | Machine Learning Engineer – Edge | Dover, NH, USA | date unclear | Snippet | [bebee](https://bebee.com/us/jobs/machine-learning-engineer-edge-gn-hearing-dover--techmap_us_CE5813FEA6D8419FAF440F40D0FA98D8) (now 404) |
| P18 | Qualcomm | Audio Engineer, Automotive Audio R&D | San Diego, CA, USA | date unclear | Snippet | [Glassdoor](https://www.glassdoor.com/job-listing/audio-engineer-qualcomm-JV_IC1147311_KO0,14_KE15,23.htm?jl=1009804025968) |
| P19 | Cirrus Logic | Embedded Machine Learning Engineer (AI/ML), CVL | Austin, TX, USA | date unclear | Snippet | [Indeed](https://www.indeed.com/viewjob?jk=8a1b5966e721e002); [jobleads](https://www.jobleads.com/us/job/embedded-machine-learning-engineer-ai-ml--austin--e7b9d125e1f232f0e62bc9b77da08a59f) |
| P20 | Dolby | PhD Research Intern – Multimodal AI, Audio (Fall 2026) | Atlanta, GA, USA | 2026 | Snippet | [Dice](https://www.dice.com/job-detail/1b3a0801-9bf4-4b22-9f10-4c6dc8f37cdc) (now 410) |
| P21 | Dolby | Senior Multimodal AI Researcher, Audio | Atlanta, GA, USA | date unclear | Snippet | [Dolby careers](https://careers.dolby.com/job/Atlanta-Senior-Multimodal-AI-Researcher,-Audio-GA-30301/1282436400/) |
| P22 | Demant (Eriksholm Research Centre) | Scientist – computational audiology / ML | Denmark | expired 2026-05 | Snippet | [computationalaudiology.com](https://computationalaudiology.com/jobs/scientist-computational-audiology-machine-learning/) |
| P23 | iZotope (Native Instruments group) | Data Engineer for Audio ML Research | date/location unclear | date unclear | Snippet | [Francisco Partners board](https://careers.franciscopartners.com/companies/izotope/jobs/57822451-data-engineer-for-audio-ml-research) (now 404) |
| P24 | Shure | Data Engineering Intern | Niles, IL, USA (hybrid) | date unclear | Snippet | [Dice](https://www.dice.com/job-detail/f218e9fa-ad7b-4b66-9065-9ffae841ff00) |

### Cited Findings (per posting, requirements as listed)
- P1 Bose Principal DSP/ML: noise suppression, echo cancellation, beamforming, spatial audio, enhancement; "primarily modern ML/deep learning approaches augmented by classical DSP"; required DSP fundamentals "(sampling, filtering, FFTs, spectral analysis)", Python and/or MATLAB, BS; preferred MS/PhD, PyTorch/ONNX/TensorFlow/TFLite, C/C++, source separation, mic-array processing, publications/patents; $216K–$297K — [Built In](https://www.builtinboston.com/job/principal-audio-dsp-ml-engineer-audio-technology/11322768)
- P2 Bose co-op: "low-latency, on-device audio tasks"; speech enhancement, keyword spotting; embedded prototypes; MS/PhD student; 3+ yrs Python and C/C++; PyTorch/TensorFlow; preferred publications, DSP, embedded — [Built In](https://www.builtinboston.com/job/audio-machine-learning-engineer-co-op/8466457)
- P3 Bose embedded co-op: deploy DL on resource-constrained hardware; quantization, pruning, knowledge distillation; evaluate NN hardware accelerators for low-power wearables and vendor toolchains; C/C++; Python for model conversion; PyTorch/TensorFlow; preferred MCU/DSP/NPU deployment, audio DL + DSP — [dreamworkhq](https://www.dreamworkhq.com/job/71f6f39f-753c-41cf-b7e3-ee093c06ba3c)
- P4 Cirrus Logic firmware: C/C++ and assembly on DSP cores; MATLAB-to-fixed-point conversion; cycle counting, DMA, latency minimization; filter design, adaptive filtering, FFT; fixed-point arithmetic; power constraints; preferred Tensilica HiFi, PyTorch/TensorFlow, "Implementing ML models on fixed-point embedded platforms"; BS (1st/2.1) — [freehire](https://freehire.me/jobs/embedded-audio-firmware-engineer-cirrus-logic-uabbfrql)
- P5 Cirrus Logic AI intern: real-time embedded software; C and Python; AI agents for embedded engineering; preferred DSP (audio/non-audio), mixed-signal SoC deployment; BS student — [Built In](https://builtin.com/job/embedded-software-ai-intern/9863920)
- P6 Harman: perception tasks ("quality prediction, artifact detection, scene/context classification", preference modeling); "data collection, labeling, and evaluation methodologies combining objective and perceptual metrics"; optimize for "accuracy, latency, memory, compute, and power"; baseline comparisons, controlled experiments, reproducible evaluation; MS/PhD; Python; preferred speech enhancement, spatial, source separation, C/C++, model compression, model provenance/bias documentation, privacy-preserving learning, publications — [Harman](https://jobsearch.harman.com/en_US/careers/JobDetail/Audio-ML-Engineer-Research/30622)
- P7 Sonos: ASR and wakeword detection; RNN-T and Transformers; "audio augmentation to reflect the far-field acoustic conditions"; data strategy for training/testing; training and evaluation pipelines; Python, PyTorch; intermediate Rust/C/C++; PhD or MS; preferred real-time streaming ASR, far-field, MLOps; €70K–€87.2K — [freehire](https://freehire.me/jobs/senior-machine-learning-engineer-sonos-ja4753yb); [dreamworkhq](https://www.dreamworkhq.com/job/dafaef74-4ba3-4576-bd62-b72e1ff31fe6)
- P8 Dolby spatial: AI for spatial audio content creation; "multimodal foundation models for XR"; combine DL with "perceptually relevant signal processing and metrics"; LLM/generative AI; Python, TensorFlow, PyTorch; PhD required; $150K–$173K — [Dolby](https://careers.dolby.com/job/Atlanta-Research-Scientist-Spatial-Audio-&-AI-GA-30301/1282538600/)
- P9 Dolby Beijing intern: text2music/text2audio generation; Transformer and Diffusion models, multimodal LMs; PyTorch, Python; PhD student; preferred ICASSP/INTERSPEECH/NeurIPS/ICLR/ICML papers — [Dolby](https://careers.dolby.com/job/Beijing,-Chaoyang-District-PhD-Research-Intern-AI-MusicAudio-Generation/1417426200/)
- P10 Boston Dynamics: acoustic change/anomaly detection for industrial machinery; audio feature extraction, fingerprinting, segmentation; time- and frequency-domain analysis; multi-channel arrays, beamforming, DOA; unsupervised and supervised classification; Python, C++, NumPy/SciPy/scikit-learn/PyTorch; bonus multimodal fusion with vision/thermal/foundation models; $180K–$220K — [dreamworkhq](https://www.dreamworkhq.com/job/3c31d610-a9aa-4e8b-b416-3fa9a5e2ed58)
- P11 Qualcomm speech research: DSP; DL (CNN, RNN, LSTM, Transformer); C/C++ and Python; MS required; preferred speech coding, enhancement, ASR, TTS, self-supervised learning, embedded ARM/DSP; embedded NN models; live-network testing; $148.3K–$222.5K — [cazvid](https://cazvid.com/en/job/speech-audio-research-engineer-51860e0b)
- P12 Qualcomm Shanghai: echo cancellation, noise suppression (ECNS), speech enhancement; integrate AI models into signal chains; "objective and subjective" speech quality evaluation; MATLAB/Python; C/C++; MS (PhD preferred); preferred real-time DSP+AI, embedded/low-power — [freehire](https://freehire.me/jobs/audio-systems-engineer-qualcomm-2r3usiy2)
- P13 Shure intern: DSP + ML features; Python/MATLAB simulation; port to floating-point DSPs/ARM in C/C++; real-time constraints; preferred psychoacoustics, mic arrays, 3D audio, oscilloscopes/audio analyzers — [Dice](https://www.dice.com/job-detail/d455bfe5-e4bd-44dd-a560-8150be891e8f)
- P14 Audatic Senior DL: DL audio models for embedded platforms; novel architectures; GPU hyperparameter optimization; Python; publications or real-world DL solutions; DSP/audio processing; BS/MS+5 yrs or PhD+2 — [freehire](https://freehire.me/jobs/senior-deep-learning-engineer-m-f-d-audatic-sonova-group-ccteo6h6)
- P15 Audatic Data Scientist: "real-time speech enhancement on embedded platforms"; experiments on architectures, loss functions, datasets and evaluation methods; Python; BS/MS; DSP bonus — [freehire](https://freehire.me/jobs/data-scientist-deep-learning-m-f-d-sonova-group-swx525qs)
- P16 Sonova Stäfa (snippet): speech-in-noise DL for hearing; real time on power-constrained hearing devices; integrate into the signal-processing chain; MS/PhD; 2+ yrs DL; Python, TensorFlow/Keras or PyTorch; DL–embedded boundary — search summary of [jobs.ch](https://www.jobs.ch/en/vacancies/detail/140bf581-25aa-44e0-8f75-6d629258a5b0/) and [altjobs](https://altjobs.startup-insider.com/job/deep-learning-engineer-3/)
- P17 GN Hearing (snippet): on-device speech enhancement, augmented hearing, real-time environmental awareness; compression, quantization, pruning; TensorFlow Lite, PyTorch; audio/speech SP fundamentals; 2+ yrs — search summary of [bebee](https://bebee.com/us/jobs/machine-learning-engineer-edge-gn-hearing-dover--techmap_us_CE5813FEA6D8419FAF440F40D0FA98D8)
- P18 Qualcomm automotive (snippet): speech enhancement, AEC, noise suppression for in-car handsfree with distributed mics; keyword spotting; audio scene detection; CNNs, RNNs, autoencoders — search summary of [Glassdoor](https://www.glassdoor.com/job-listing/audio-engineer-qualcomm-JV_IC1147311_KO0,14_KE15,23.htm?jl=1009804025968)
- P19 Cirrus Logic CVL (snippet): data generation, curation, model engineering, optimization for edge and mixed-signal; attention, seq2seq, generative architectures; real-time sensor/audio workloads — search summary of [Indeed](https://www.indeed.com/viewjob?jk=8a1b5966e721e002)
- P20 Dolby PhD intern (snippet): AI for audio-visual quality evaluation, content analysis, multimodal representations; DL architectures — search summary of [Dice](https://www.dice.com/job-detail/1b3a0801-9bf4-4b22-9f10-4c6dc8f37cdc)
- P21 Dolby senior (snippet): multimodal representations; generative modeling for audio, speech, music — search summary of [Dolby](https://careers.dolby.com/job/Atlanta-Senior-Multimodal-AI-Researcher,-Audio-GA-30301/1282436400/)
- P22 Demant Eriksholm (snippet): ML on real-world audiological data, translational research — search summary of [computationalaudiology.com](https://computationalaudiology.com/jobs/scientist-computational-audiology-machine-learning/)
- P23 iZotope (snippet): AWS data pipelines to ingest internal audio libraries and "generate novel training data" — search summary of [Francisco Partners](https://careers.franciscopartners.com/companies/izotope/jobs/57822451-data-engineer-for-audio-ml-research)
- P24 Shure (snippet): data infrastructure for audio ML experiments — search summary of [Dice](https://www.dice.com/job-detail/f218e9fa-ad7b-4b66-9065-9ffae841ff00)
- Context: four of five big hearing-aid makers launched AI-focused on-device platforms within two weeks in Aug 2026 — [Counterpoint](https://counterpointresearch.com/en/insights/the-race-towards-smarter-hearing-aids); Sonova's Phonak EON (Aug 24, 2026) is its third-generation real-time AI — [Sonova](https://www.sonova.com/sonova-strengthens-innovation-leadership-with-phonak-eon-portfolio-and-third-generation-proprietary-real-time-ai/)

### Count table
N = 24 postings. "Full" column = 15 full-text postings (P1–P15). "All" column = all 24 (adds 9 snippet rows; lower bound). Posting IDs listed so counts can be audited.

**1. Tasks**
| Requirement | Full (/15) | All (/24) | Postings |
|---|---|---|---|
| Speech enhancement / denoising / noise suppression | 6 | 9 | P1 P2 P6 P11 P12 P15 P16 P17 P18 |
| Beamforming / spatial / multichannel | 6 | 7 | P1 P6 P8 P10 P11 P13 P18 |
| ASR / keyword spotting | 3 | 4 | P2 P7 P11 P18 |
| Echo cancellation | 2 | 3 | P1 P12 P18 |
| Sound event / scene detection | 1 | 3 | P6 P17 P18 |
| Hearing enhancement | 0 | 3 | P16 P17 P22 (Audatic P14/P15 are a Sonova hearing unit but text says "audio/speech") |
| Source separation | 2 | 2 | P1 P6 (both "preferred") |
| TTS | 1 | 1 | P11 |
| Acoustic anomaly detection | 1 | 1 | P10 |
| Speaker ID | 0 | 0 | — |
| MIR | 0 | 0 | — (Ableton excluded, no text) |
| Music tagging | 0 | 0 | — |
| Audio effects/plugins with ML | 0 | 0 | — |
| Other: generative audio/music | 2 | 3 | P8 P9 P21 |
| Other: perceptual/quality prediction | 1 | 2 | P6 P20 |
| Other: speech codecs | 1 | 1 | P11 |

**2. Features & models**
| Requirement | Full (/15) | All (/24) | Postings |
|---|---|---|---|
| Classical DSP (filters, FFT/STFT, adaptive filters, spectral) | 13 | 14 | P1 P2 P3 P4 P5 P6 P8 P10 P11 P12 P13 P14 P15 P17 |
| Embeddings / foundation / self-supervised / multimodal | 4 | 5 | P8 P9 P10 P11 P21 (none names CLAP, wav2vec, Whisper, BEATs or codecs) |
| Transformers | 3 | 4 | P7 P9 P11 P19 |
| mel / log-mel | 0 | 0 | — |
| MFCC | 0 | 0 | — |
| CQT | 0 | 0 | — |
| pitch / f0 | 0 | 0 | — |
| Named small nets (CRN, RNNoise, DeepFilterNet) | 0 | 0 | — |

**3. Evaluation**
| Requirement | Full (/15) | All (/24) | Postings |
|---|---|---|---|
| MOS / listening / perceptual / subjective | 3 | 3 | P6 P8 P12 |
| Statistical rigor (baselines, controlled, reproducible) | 1 | 1 | P6 |
| Latency measurement / profiling | 1 | 1 | P4 (cycle counting, profiling) |
| WER | 0 | 0 | — |
| SI-SDR / SDR | 0 | 0 | — |
| PESQ / STOI / POLQA | 0 | 0 | — |
| DNSMOS | 0 | 0 | — |
| A/B tests | 0 | 0 | — |
| Generic "evaluate/eval pipelines", no metric named | 6 | 6 | P2 P3 P7 P12 P13 P15 |

**4. Data practices**
| Requirement | Full (/15) | All (/24) | Postings |
|---|---|---|---|
| Dataset curation / collection / generation | 3 | 7 | P6 P7 P15 P19 P22 P23 P24 |
| Labeling | 1 | 1 | P6 |
| Augmentation | 1 | 1 | P7 (far-field augmentation) |
| Data quality / provenance / bias | 1 | 1 | P6 |
| Privacy | 1 | 1 | P6 |
| Leakage / splits | 0 | 0 | — |
| Licensing / consent | 0 | 0 | — |

**5. Deployment**
| Requirement | Full (/15) | All (/24) | Postings |
|---|---|---|---|
| On-device / embedded / DSP chips | 11 | 14 | P2 P3 P4 P5 P6 P7 P11 P12 P13 P14 P15 P16 P17 P19 |
| C/C++ | 11 | 11 | P1 P2 P3 P4 P5 P6 P7 P10 P11 P12 P13 |
| Real-time | 6 | 9 | P2 P5 P7 P12 P13 P15 P16 P17 P19 |
| Power constraints | 4 | 5 | P3 P4 P6 P12 P16 |
| Latency budgets | 4 | 4 | P2 P4 P6 P7 |
| Quantization / compression / pruning | 2 | 3 | P3 P6 P17 |
| ONNX / TFLite / CoreML | 1 | 2 | P1 P17 |
| Fixed-point | 1 | 1 | P4 |
| JUCE / plugins | 0 | 0 | — |

**6. General stack**
| Requirement | Full (/15) | All (/24) | Postings |
|---|---|---|---|
| Python | 15 | 16 | P1–P15, P16 |
| MS/PhD (required or preferred) | 10 | 12 | P1 P2 P3 P6 P7 P8 P9 P11 P12 P14 P16 P20 |
| PyTorch | 8 | 10 | P1 P2 P3 P4 P7 P8 P9 P10 P16 P17 |
| TensorFlow (incl. TFLite/Keras) | 5 | 7 | P1 P2 P3 P4 P8 P16 P17 |
| Publications | 5 | 5 | P1 P2 P6 P9 P14 |
| MATLAB | 4 | 4 | P1 P4 P12 P13 |
| PhD strictly required | 2 | 3 | P8 P9 P20 |
| librosa / torchaudio | 0 | 0 | — (P10 names NumPy/SciPy/scikit-learn) |

### Inferences
- These employers screen on two things above all: DSP fundamentals and the ability to ship on a device. Python is assumed. C/C++ and embedded show up in most full-text postings.
- Evaluation is described vaguely. No posting names a standard metric. "Perceptual" or "subjective" quality shows up only in research-leaning roles (Harman, Dolby, Qualcomm). A candidate who can show PESQ/STOI/SI-SDR/DNSMOS plus a listening test would be above what the postings ask, not below.
- Features are never named. Mel/MFCC knowledge is taken for granted; postings ask for "DSP fundamentals" instead.
- Data work is thin in the hardware set. Only Harman (P6) asks for labeling, data quality, provenance and privacy. Only Sonos (P7) asks for augmentation. Licensing/consent and split leakage never appear.
- Music-side tasks (MIR, tagging, ML effects/plugins) are absent from what I could retrieve. The pro-audio/music companies (iZotope, Ableton, NI, UA, Roland, Steinberg) had no readable ML postings in 2025-2026. This is a sourcing gap, not proof of zero demand.
- Six of the 15 full-text postings are internships/co-ops (P2 P3 P5 P9 P13, plus snippet P20/P24). That inflates "student" degree wording.

### How DSP-heavy roles differ from pure ML roles
- **DSP-heavy** (P4 Cirrus firmware, P12 Qualcomm Shanghai, P13 Shure, P1 Bose principal, P10 Boston Dynamics): MATLAB appears (4 of 4 MATLAB mentions are here). Also C/C++/assembly, fixed-point, filter and adaptive-filter design, AEC/NS, cycle counting, lab test gear, psychoacoustics. A BS is often enough (P1, P4, P13). ML is often listed as "preferred".
- **Pure ML / research** (P7 Sonos, P8/P9/P21 Dolby, P14/P15 Audatic, P11 Qualcomm research): Python + PyTorch, MS/PhD, publications, transformers, foundation/generative models, data strategy and training pipelines. MATLAB never appears. C/C++ is secondary ("intermediate" at Sonos).
- **Edge-ML hybrid** (P3 Bose embedded, P6 Harman, P16 Sonova, P17 GN): sits between them. It asks for quantization/pruning/distillation, power and memory budgets, accelerator toolchains and TFLite/ONNX. Hearing-aid firms are almost all in this group.

### Gaps
- No readable 2025-2026 ML posting found for Sennheiser, Knowles, Universal Audio, Native Instruments, Steinberg/Yamaha, Roland, WS Audiology, Cerence, or Bose automotive. Starkey shows "Senior Machine Learning Engineer" titles on job aggregators, but I could not open the text.
- Many mirror pages had expired (404/410), so 9 of 24 rows rely on search summaries. Their counts are lower bounds.
- Harman's "source separation" preference comes from the search summary of the Harman page. The fetched text listed speech enhancement, perceptual modeling, spatial, scene understanding and personalization.
- Dates are missing for several rows (marked "date unclear"). All rows were seen in 2026 searches.
- LinkedIn and the AES career center were not reachable through these tools.
