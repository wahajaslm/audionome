# Audio / speech / music ML job requirements at big tech and streaming companies (2025-2026)

Method note (applies to all sections): N = 35 distinct postings. Every posting was read in full text from the employer's own feed or a full-text mirror. Sources were: the Spotify Lever API, the Amazon jobs search JSON, Google Careers search pages, Apple job detail pages, the SoundCloud Greenhouse API, LinkedIn public job pages (Microsoft, Meta, ByteDance, Amazon), Welcome to the Jungle (Deezer), and AnitaB (Meta). Dates are the employer's posted or updated dates, gathered on 2026-11-07. The count is of what the posting text says, not what the role probably needs. A posting is tagged only when the text names the item (in requirements, responsibilities, or the team description). Generic phrases like "experience with ML" were not tagged.

Coverage is uneven. Apple (9), Amazon (9) and Spotify (6) dominate because their feeds return full text. Google/DeepMind has 2, Microsoft 2, Meta 2, ByteDance 2, SoundCloud 2 and Deezer 1. There are 0 usable postings for Netflix, Shazam, TikTok (music) and YouTube Music ML. See Gaps.

## Q1. Evidence table: what each posting requires

### Takeaway
Most of these postings are speech-first, not music-first: 23 of 35 are speech or general audio roles. Speech postings ask for ASR/TTS, speech LLMs, foundation-model training, post-training/RL, publications and a PhD. Music postings at streaming companies are mostly recommendation/search ML. The few music-audio roles are generative (Spotify, Apple).

### Cited Findings

Each row gives company | title | location | date | key requirements (short quotes).

**Spotify**
1. Spotify | Research Scientist - Generative Audio (Artist-First AI Music Lab) | New York (London twin posting) | 2026-07-10 | "generative audio using diffusion or flow matching"; focus areas "Vocal Synthesis", "Post-Training … DPO, RLHF, or KTO, reward model design", "Editing … stem replacement, instrumentation change… tempo changes". Also "Ph.D.", "publications at … ICASSP, ISMIR, INTERSPEECH…", "Python, PyTorch, and NumPy". The team principles cover rights-holder partnerships, "choice in participation" and "fair compensation". — [Lever](https://jobs.lever.co/spotify/0eebb462-b5a2-4e3a-b830-d8ef7505b014)
2. Spotify | Senior Applied Research Scientist - Personalization (Speak team) | New York | 2026-09-21 | "speech recognition, speech synthesis, and speech-to-speech models"; "transformers, GANs, diffusion models, flow matching, VAEs, audio codecs"; "PhD degree on top of professional experience"; "Python, particularly PyTorch". The team description mentions "highly efficient data processing and model serving" and "capturing audio of outstanding quality from our voice talent pool". — [Lever](https://jobs.lever.co/spotify/6eb9ce0e-5372-4a4f-b2fa-d005f9426750)
3. Spotify | Senior Staff ML Engineer - Content Platform | New York (London twin) | 2026-04-29 | "classification, moderation, ranking, risk detection" across "text, audio, image, and video"; "in real time and at Spotify scale"; "PyTorch, TensorFlow, JAX"; "data quality, rigorous evaluation, fairness, explainability". — [Lever](https://jobs.lever.co/spotify/47d4eabf-8d5a-4dab-ac72-de7b5b56841c)
4. Spotify | Senior ML Engineering Manager - Content Platform | London/Stockholm | 2026-10-06 | "content understanding (audio, video and text)"; "experience across NLP, audio / music content understanding and recommender systems". — [Lever](https://jobs.lever.co/spotify/bc70c9af-212e-48d5-b00b-eab26e4c0658)
5. Spotify | Senior Data Scientist, Artist-First AI Music Lab | New York | 2026-10-08 | "evaluations of generative music systems … using … annotations, and experimentation platforms"; "embedding-based models … validating them against LLM judges or human ground truth"; "A/B tests, quasi-experiments, and power analysis"; "Python and SQL"; works with "Legal … Licensing teams". — [Lever](https://jobs.lever.co/spotify/babebec3-0061-4c39-a4ad-c51a54d23567)
6. Spotify | Senior ML Engineer, Personalization (Search) | New York | 2026-10-14 | "information retrieval, search ranking, recommendation systems"; "design and evaluate experiments"; "large-scale datasets"; "Python"; LLM/agentic interest. — [Lever](https://jobs.lever.co/spotify/05b8d6ee-0773-4255-b8b9-ae73d74a5ee5)

**Apple**

Apple detail pages did not expose location fields to the scraper. Locations are given only where the posting text states them.

7. Apple | Machine Learning Engineer, Siri Speech | Cupertino (per search listing) | 2026-11-03 | "speaker recognition and multimodal understanding"; "training/tuning large generative models or LLMs"; "JAX and/or PyTorch"; preferred: "Speech LLMs", "reinforcement learning", "M.S.". — [Apple](https://jobs.apple.com/en-us/details/200693064-0836/machine-learning-engineer-siri-speech)
8. Apple | ML Researcher - Apple Services Engineering - Generative Audio (Computational Music Technologies) | location not shown | 2026-11-03 | "diffusion or flow-matching"; "voice generation", "post-training and alignment", "realtime generation … distillation … few-step and streaming"; "evaluation methodology, benchmarking … attribution"; "PhD"; publications at "ICASSP, ISMIR, Interspeech…"; "Python and PyTorch or JAX"; "Love of music". The team shipped AutoMix and an on-device "Music Understanding Framework". — [Apple](https://jobs.apple.com/en-us/details/200693132-2114/machine-learning-researcher-apple-services-engineering-generative-audio)
9. Apple | Q - Audio Machine Learning Engineer | Herzliya, Israel | 2026-05-28 | "full data lifecycle … designing what data we collect, through curation and quality monitoring"; "optimization for Apple silicon"; "privacy"; preferred: "speaker embeddings, voice isolation, ASR, multichannel sensor fusion, generative speech", "DSP for audio signals", "supervised and self-supervised". — [Apple](https://jobs.apple.com/en-us/details/200665600-0865/q-audio-machine-learning-engineer)
10. Apple | ML Applied Researcher - Speech, Vision and Audio | location not shown | 2026-09-02 | "Pytorch"; preferred: "self-supervised learning, synthetic data generation, large language model training, or automatic speech recognition"; "Interspeech, ICASSP"; MS/PhD preferred. — [Apple](https://jobs.apple.com/en-us/details/200680745-1242/machine-learning-applied-researcher-speech-vision-and-audio)
11. Apple | ML Researcher - Apple Music - Recommender Systems | location not shown | 2026-05-30 | "multi-interest, neural ranking, RL, sequential, generative" recommenders; "low-latency services"; publications at "RecSys, SIGIR, KDD, ISMIR…"; "TensorFlow or PyTorch"; preferred: "counterfactual evaluation", "Spark SQL", "LLM methods applied to recommendation", "Love of music". — [Apple](https://jobs.apple.com/en-us/details/200665642-2114/machine-learning-researcher-apple-music-recommender-systems)
12. Apple | Sr. ML Engineer, Siri Speech | Cupertino (per search listing) | 2026-09-17 | "multimodal LLM … speech generation/understanding"; "data scaling"; "M.S. or PhD"; "JAX and/or PyTorch"; preferred: "Speech LLMs", "reinforcement learning". — [Apple](https://jobs.apple.com/en-us/details/200641206-0836/sr-machine-learning-engineer-siri-speech)
13. Apple | ML Architect - Conversational Speech | location not shown | 2026-10-16 | "multimodal LLMs … integrate speech, audio, and text"; "speech-to-speech … full-duplex"; preferred: "ASR, TTS, spoken dialog, speaker modeling"; "data collection, curation, annotation, and quality strategies"; "on-device ML deployment, including model compression, quantization, and latency-aware architecture design". — [Apple](https://jobs.apple.com/en-us/details/200653966-0836/machine-learning-architect-conversational-speech)
14. Apple | Q - ML Engineer - Speech | location not shown (same Q team as #9) | 2026-05-28 | "on-device speech recognition and NLP … optimization for Apple silicon"; "dataset curation, architecture design, distributed training, error analysis, and production deployment"; preferred: "ASR, TTS, speaker recognition", "self-supervised". — [Apple](https://jobs.apple.com/en-us/details/200665627-0865/q-machine-learning-engineer-speech)
15. Apple | Internship - Research Intern, Speech & Language Processing | Copenhagen | 2026-11-04 | "multilingual ASR … SpeechLMs"; "training data composition", "low-resource languages", "self-supervised"; PhD student; publications at "Interspeech, ICASSP"; "PyTorch or TensorFlow"; "respect for user privacy". — [Apple](https://jobs.apple.com/en-us/details/200692892-1419/internship-research-intern-speech-language-processing)

**Google / Google DeepMind**
16. Google | Staff Research Scientist, Foundational Audio | Mountain View | 2026-10-30 | "state-space or linear attention, token-free latent representations, speech-text modeling, diffusion, flow-matching, speculative decoding, or streaming alignment"; "streaming inference latency in JAX, PyTorch, or TensorFlow"; "evaluation benchmarks"; "PhD"; publications at "Interspeech, ICASSP"; toolkits "Kaldi, K2, or ESPNet". — [Google Careers](https://www.google.com/about/careers/applications/jobs/results/93400188797756102)
17. Google | Audio Machine Learning Engineer, Google Beam | San Francisco | 2026-09-29 | "speech enhancement, sound separation, classification, and remixing"; "audio quality assessment, audio signal processing"; "real-time, low-latency performance on both CPU and GPU"; "augment training data … TFRoomSim and automated labeling"; "C++ and Python"; "JAX, Keras". — [Google Careers](https://www.google.com/about/careers/applications/jobs/results/106471308924986054)

**Amazon (Alexa, AGI, Amazon Music, devices)**
18. Amazon | Applied Scientist, Alexa Edge AI | Bengaluru | 2026-10-09 | "CV, audio (including speech) … edge and cloud"; "data strategy, and annotation design"; "building speech recognition … systems"; "quantization, distillation"; "Java, C++, Python"; "ICASSP". — [Amazon](https://www.amazon.jobs/en/jobs/10575107/applied-scientist-alexa-edge-ai)
19. Amazon | Principal Applied Scientist, Real-Time Conversational AI, AGI | Sunnyvale | 2026-10-28 | "foundation models for real-time speech and audio generation"; "transformer architectures … speech/audio"; "PhD"; "Interspeech, ICASSP"; preferred: "codec models, autoregressive audio generation", "reward models … for speech/audio quality, naturalness", "RLHF/RLAIF", "inference latency, memory, and cost", "ASR, TTS, or speech enhancement". — [Amazon](https://www.amazon.jobs/en/jobs/10591057/principal-applied-scientist-real-time-conversational-ai-agi)
20. Amazon | Senior Applied Scientist, Real-Time Conversational AI, AGI | Sunnyvale | 2026-08-05 | Same technical list as #19, with "PhD, or Master's … 6+ years" and "Java, C++, Python". — [Amazon](https://www.amazon.jobs/en/jobs/10493122/senior-applied-scientist-real-time-conversational-ai-agi)
21. Amazon | Applied Scientist II, Alexa International Tech | Bengaluru | 2026-08-03 | "LLMs, ASR, TTS, and Speech to Speech"; "ASR/TTS architectures, end-to-end speech models, and LLM integration with speech systems"; "SFT, DPO, RLHF, RLAIF"; publications; "Java, C++, Python". — [Amazon](https://www.amazon.jobs/en/jobs/10490049/applied-scientist-ii-alexa-international-tech)
22. Amazon | Applied Scientist II, Text-to-Speech on Device | Gdansk | 2026-09-11 | "speech generation models optimized for constrained environments"; "PhD"; "model pruning"; preferred: "quantization, distillation, compression, inference optimization"; "Python, Java, C++". — [Amazon](https://www.amazon.jobs/en/jobs/10536961/applied-scientist-ii-text-to-speech-on-device-team)
23. Amazon | Principal Audio Scientist, Fauna (robotics) | New York | 2026-10-06 | "multi-microphone audio processing, such as beamforming, echo cancellation, and noise suppression"; "shipping audio front-end algorithms on a physical device"; preferred: "wake word or voice activity detection", "sound source localization", "real-time execution on embedded or edge hardware"; PhD/MS plus years; publications/patents. — [Amazon](https://www.amazon.jobs/en/jobs/10571281/principal-audio-scientist-fauna)
24. Amazon | ML Engineer II, Amazon Music - MusicIQ | Seattle | 2026-09-23 | "ML infrastructure for tagging music content"; "data pipelines"; "data quality"; "offline processing and real-time customer experiences"; "C#, C++, Java"; BS. — [Amazon](https://www.amazon.jobs/en/jobs/10557456/machine-learning-engineer-ii-amazon-music-musiciq)
25. Amazon | Principal Applied Scientist, Music Catalog and Search | Sunnyvale | 2026-10-23 (LinkedIn) | "content understanding systems in digital media"; "foundational models"; preferred: "search retrieval and ranking", "designing and evaluating online experiments", "large scale distributed data systems"; PhD/MS. — [LinkedIn](https://www.linkedin.com/jobs/view/4455903808)
26. Amazon | 2027 Applied Science Internship - NLP and Speech Technologies | Seattle | 2026-09-30 | "Speech Recognition", "LLMs", "RLHF"; "enrolled in a PhD"; publications; preferred: "designing experiments and statistical analysis", "PyTorch, HuggingFace, speech and audio processing frameworks", "AI-assisted development tools". — [Amazon](https://www.amazon.jobs/en/jobs/10564593/2027-applied-science-internship-natural-language-processing-and-speech-technologies-united-states-phd-student-science-recruiting)

**Microsoft**
27. Microsoft | Senior Applied Scientist - CoreAI (Speech and Translation) | Redmond | 2026-10-21 (LinkedIn) | Team: "signal processing, speech modeling, statistical modeling and deep learning"; "integrating speech with LLM for multimodal modeling"; "putting multiple models in production and evaluating their performance"; "accuracy guardrails"; degree BS/MS/PhD plus years; preferred: talks at "ASRU, ICASSP, Interspeech", publications. — [LinkedIn](https://www.linkedin.com/jobs/view/4482068088)
28. Microsoft | Senior Applied Scientist - CoreAI Voice Agent | Redmond | 2026-10-22 (LinkedIn) | "natural, expressive, and multilingual speech generation"; "signal processing"; "evaluating multiple models in live scenarios"; "Deploy models into production"; degree plus years. — [LinkedIn](https://www.linkedin.com/jobs/view/4482479478)

**Meta**
29. Meta | Software Engineer, Audio Applied Scientist | Redmond | 2026-10-27 (LinkedIn) | "fundamentals of DSP and ML"; "Small footprint ML, Differential DSP, Echo/Noise reduction, Spatial Processing, Hearing Aids"; "resource constrained platforms (e.g., mobile/wearables)"; "C or C++ … MATLAB, Python"; MS/PhD preferred; "publications and/or patents"; "AI skill development". — [LinkedIn](https://www.linkedin.com/jobs/view/4481878391)
30. Meta | Research Scientist - Hearing Assistance (Reality Labs Research) | Redmond | date unclear (mirror says "6+ months ago") | "perceptual studies evaluating signal processing and AI audio"; "real-time audio prototypes" in "Python, Bento, MATLAB, MaxMSP"; "data collection strategies, benchmarks, and metrics for audio ML"; PhD in audiology, hearing science or a related field. — [AnitaB mirror](https://jobs.anitab.org/companies/meta-3-c00df464-9d7f-4a12-a5c0-f043ccf7bf75/jobs/54571313-research-scientist-hearing-assistance)

**ByteDance**
31. ByteDance | Research Scientist Graduate (Seed Model - Speech) - 2027 Start (PhD) | San Jose | 2026-10-21 (LinkedIn) | "speech foundation models for understanding and generation"; "data construction, instruction tuning, and model alignment"; "speech recognition, synthesis"; "C/C++ or Python"; PhD. The team covers "speech and audio, music". — [LinkedIn](https://www.linkedin.com/jobs/view/4439544781)
32. ByteDance | Research Scientist Graduate (Seed Model - Speech - Interaction & Learning) - 2026 Start (PhD) | San Jose | 2026-10-20 (LinkedIn) | "PyTorch, TensorFlow"; preferred: "speech synthesis, audio generation, large language model … generative models"; first-author publications; "C / C++, Python". — [LinkedIn](https://www.linkedin.com/jobs/view/4472781337)

**Deezer**
33. Deezer | Senior Machine Learning Engineer (recommendation) | Paris | ~Dec 2025 ("11 months ago") | "recommendation engine"; "Code, deploy and monitor ML models in production"; "LLM"; "Python, Scala, or Java"; preferred "Hadoop/Spark/GCP". — [Welcome to the Jungle](https://www.welcometothejungle.com/en/companies/deezer/jobs/senior-machine-learning-engineer-m-f-d_paris)

**SoundCloud**
34. SoundCloud | Senior ML Engineer - Recommendations (Experience) | Berlin/London | updated 2026-09-22 | "real-time serving"; "cost, latency"; "A/B testing, and metrics frameworks"; "data quality and correctness"; "Python and Scala"; "SQL … BigQuery, Spark"; "AWS/GCP … Docker, Kubernetes"; "TensorFlow or PyTorch"; "LLM-based features … RAG". — [Greenhouse](https://job-boards.greenhouse.io/soundcloud71/jobs/8829912002)
35. SoundCloud | Senior Principal ML Engineer - Recommendations | New York | updated 2026-10-08 | "recommendation, ranking, personalization"; "LLMs, large recommender systems, multi-modal embeddings and transformer-based architectures"; "feature stores, pipeline orchestration, and model registry and versioning"; "world's largest audio dataset". — [Greenhouse](https://job-boards.greenhouse.io/soundcloud71/jobs/8486880002)

Seen but excluded:
- Google Research Data Scientist, YouTube Music and Premium (pricing/subscriptions, not audio ML). [Google Careers](https://www.google.com/about/careers/applications/jobs/results/137566436208845510)
- Google Senior Staff SWE, Audio Systems XR (pure DSP/acoustics). [Google Careers](https://www.google.com/about/careers/applications/jobs/results/82383885446324934)
- Spotify Research Scientist - Personalization (generic RL research). [Lever](https://jobs.lever.co/spotify/9e3bdb48-67eb-49d9-ae0b-a337ba69a05f)
- Amazon Alexa Connections and Applied Scientist III Alexa International (mostly NLP/LLM).
- A ByteDance "Speech & Audio Generation" mirror dated Oct 2024 (out of range). [JobzMall](https://www.jobzmall.com/bytedance/job/research-scientist-in-foundation-model-speech-audio-generation)

### Inferences
- Among speech postings, "speech LLM / speech-text foundation model + post-training (RLHF/DPO)" has replaced classic ASR pipeline skills as the headline requirement. This holds at Apple, Amazon, ByteDance, Google, Microsoft and Spotify alike.
- Feature-level skills (mel, MFCC, CQT, pitch) and named open models are not written into postings. They are assumed background, so job text does not show demand for them.

### Gaps
- No usable 2025-2026 posting text was found for Netflix (audio), Shazam, TikTok music/SAMI, YouTube Music ML or Meta FAIR audio. Netflix's feed returned only media/broadcast engineering. TikTok SAMI music listings found were from 2023. A DeepMind "Audio Generation" mirror returned 403 and a "Sound & Audio GenAI" mirror had no qualifications text.
- Several Apple locations could not be extracted from the detail pages.
- Microsoft's own careers API returned an error, so Microsoft is limited to two LinkedIn postings.

## Q2. Count table: requirement → number of postings (N = 35)

### Takeaway
The most common requirements are Python (24/35), a graduate degree (27/35; PhD required or PhD-track in 11/35), PyTorch (16/35) and publications (16/35). The most common tasks are ASR (14) and TTS (13). Feature-level and metric-level specifics almost never appear: 0 postings name WER, SI-SDR, PESQ/STOI, FAD, mel/MFCC/CQT, librosa/torchaudio or ONNX/TFLite/CoreML.

### Cited Findings
Counts come from the 35 postings cited in Q1. The tally was done by tagging each posting's text.

**1. Tasks**

| Requirement | Count /35 |
|---|---|
| ASR | 14 |
| TTS / speech or voice synthesis | 13 |
| Audio/music/speech generation (incl. speech-to-speech) | 9 |
| Music/audio recommendation (incl. music search ranking) | 7 |
| Speech enhancement / denoising / echo cancellation | 6 |
| Speaker ID / recognition / speaker modeling | 4 |
| Music or audio tagging / content classification | 4 |
| MIR (named as a field) | 2 (Spotify GenAudio #1, Apple GenAudio #8) |
| Source separation | 1 (Google Beam #17) |
| Sound event detection | 0 (only wake-word/VAD in #23) |
| Anomaly detection | 0 |
| Audio-text retrieval | 0 |
| Other | 15 (full-duplex dialog, speech LMs, translation, audio editing/stem replacement, hearing aids/spatial audio, beamforming/localization, content moderation) |

**2. Features & models**

| Requirement | Count /35 |
|---|---|
| Foundation models (audio/speech/multimodal) | 10 |
| LLM + audio / speech LLMs / speech-text models | 10 |
| Post-training / RL (DPO, RLHF, reward models), extra tag | 10 |
| Spectral DSP / signal processing fundamentals | 8 |
| LLMs generally (non-audio, e.g. for recsys) | 7 |
| Transformers / sequence architectures | 5 |
| Diffusion / flow matching | 4 |
| Self-supervised learning (generic) | 4 |
| Audio codecs / codec models | 3 |
| AudioLM-style autoregressive audio generation | 2 (#19, #20) |
| Embeddings (multimodal / embedding-based) | 2 |
| mel/log-mel, MFCC, CQT, pitch/f0 named | 0 |
| Named models (CLAP, MERT, wav2vec 2.0, HuBERT, WavLM, Whisper, BEATs, EnCodec/DAC) | 0 |
| Conformers named | 0 |

**3. Evaluation**

| Requirement | Count /35 |
|---|---|
| A/B tests / online experiments / live model comparison | 6 |
| Evaluation benchmarks / methodology (generic) | 6 |
| Statistical rigor (experimental design, causal inference, power analysis) | 3 |
| MOS / subjective / perceptual or human-ground-truth evaluation | 2 (#5, #30) |
| Offline ranking metrics / counterfactual evaluation | 1 (#11) |
| Audio quality assessment (named) | 1 (#17) |
| WER/CER, SI-SDR/SDR, PESQ/STOI, FAD | 0 each |

**4. Data practices**

| Requirement | Count /35 |
|---|---|
| Large-scale data pipelines | 8 |
| Dataset curation / data construction / data scaling | 7 |
| Data quality | 5 |
| Labeling / annotation | 4 |
| Data collection design | 4 |
| Licensing / consent / rights / attribution | 3 (all music-generation: #1, #5, #8) |
| Privacy | 3 (all Apple: #9, #11, #15) |
| Augmentation | 1 (#17, TFRoomSim) |
| Synthetic data generation | 1 (#10) |
| Leakage / splits | 0 |

**5. Deployment**

| Requirement | Count /35 |
|---|---|
| Cloud / production serving at scale | 12 |
| Real-time / streaming | 10 |
| Latency / inference cost (named) | 8 |
| On-device / edge / embedded | 7 |
| Quantization / compression / distillation / pruning | 5 |
| C/C++ as a deployment implementation language | 2 (#17, #29). C/C++ as a general language is 10, see bucket 6 |
| ONNX / TFLite / CoreML | 0 |

**6. General stack**

| Requirement | Count /35 |
|---|---|
| Python | 24 |
| Graduate degree mentioned (PhD or MS, required or preferred) | 27 |
| PhD required or PhD-track | 11 |
| PyTorch | 16 |
| Publications / named venues (ICASSP, Interspeech, ISMIR, NeurIPS…) | 16 |
| TensorFlow / JAX (incl. Keras) | 13 |
| C/C++ | 10 |
| AI-assisted coding tools (Cursor/Copilot, agentic workflows) | 5 |
| SQL | 3 |
| Spark / BigQuery / Hadoop | 3 |
| Java/Scala (JVM) | 2 (outside Amazon's generic "Java, C++, Python" line) |
| MATLAB | 2 |
| Speech toolkits (Kaldi/K2/ESPnet) | 1 |
| Experiment tracking / model registry | 1 |
| librosa / torchaudio | 0 |

### Inferences
- Job text rewards proof of depth (publications, PhD, foundation-model training) and deployment constraints (real-time, on-device, latency). It does not reward named features or metrics.
- Portfolio evidence should still show metric fluency (WER, SI-SDR, MOS), because interviews likely test it. But that is not visible in the postings.
- On-device or edge deployment shows up in 7 of 35 postings. It is concentrated at Apple (Siri/Q), Amazon (TTS on device, Edge AI, Fauna) and Meta wearables.

### Gaps
- Counting depends on my reading of each text. Borderline cases were: Google Beam's "classification", counted as tagging; Microsoft's "evaluating multiple models in live scenarios", counted as A/B; and Spotify Speak's "model serving", counted as cloud serving.
- The sample is weighted to Apple, Amazon and Spotify, so per-company habits (Amazon's boilerplate "Java, C++, Python") inflate some counts.

## Q3. Music-specific roles vs speech roles

### Takeaway
Music roles (12 of 35) split into two types. Most are recommendation/search ML that barely mention audio. A few are generative-audio research roles. Only the generative ones name rights, consent or attribution. Speech roles (23 of 35) are the ones that ask for PhD, publications, ASR/TTS, speech LLMs, C++ and on-device deployment.

### Cited Findings
- Music group (12): Spotify #1, #3, #4, #5, #6; Apple #8, #11; Amazon Music #24, #25; Deezer #33; SoundCloud #34, #35.
  - Top tags: recommendation 7/12, cloud serving 7/12, data pipelines 6/12, Python 7/12, LLMs 5/12, A/B tests 4/12.
  - PhD required in only 2/12 (#1, #8).
- Speech/audio group (23).
  - Top tags: Python 17/23, ASR 14/23, graduate degree 14/23 (plus PhD-required 9/23), publications 13/23, TTS 11/23, speech-LLM 10/23, C/C++ 9/23, post-training/RL 8/23, on-device 7/23.
- Rights and consent appear only in music-generation postings:
  - Spotify GenAudio: "artists and rightsholders will choose if and how to participate". — [Lever](https://jobs.lever.co/spotify/0eebb462-b5a2-4e3a-b830-d8ef7505b014)
  - Apple Generative Audio: "careful attention to artist and listener trust" and "questions of attribution". — [Apple](https://jobs.apple.com/en-us/details/200693132-2114/machine-learning-researcher-apple-services-engineering-generative-audio)
  - Spotify AI Music Lab data scientist works with "Legal … Licensing". — [Lever](https://jobs.lever.co/spotify/babebec3-0061-4c39-a4ad-c51a54d23567)
- Music research roles list ISMIR next to ICASSP and Interspeech (#1, #8, #11). Apple asks for "Love of music" in #8 and #11. — [Apple](https://jobs.apple.com/en-us/details/200665642-2114/machine-learning-researcher-apple-music-recommender-systems)
- Music generative roles name concrete music-editing tasks: "stem replacement, instrumentation change, mood changes … tempo changes, and structure changes". — [Lever](https://jobs.lever.co/spotify/0eebb462-b5a2-4e3a-b830-d8ef7505b014)
- Music content-understanding appears as infrastructure or management work, not as named MIR tasks:
  - Amazon MusicIQ: "ML infrastructure for tagging music content". — [Amazon](https://www.amazon.jobs/en/jobs/10557456/machine-learning-engineer-ii-amazon-music-musiciq)
  - Spotify: "audio / music content understanding and recommender systems". — [Lever](https://jobs.lever.co/spotify/bc70c9af-212e-48d5-b00b-eab26e4c0658)
- No posting names beat, key, chord or transcription tasks.
- Music recommendation roles ask for big-data engineering that speech roles do not: SQL, Spark/BigQuery, Scala, Airflow, Docker/K8s, A/B frameworks. — [SoundCloud](https://job-boards.greenhouse.io/soundcloud71/jobs/8829912002); [Deezer](https://www.welcometothejungle.com/en/companies/deezer/jobs/senior-machine-learning-engineer-m-f-d_paris); [Apple Music](https://jobs.apple.com/en-us/details/200665642-2114/machine-learning-researcher-apple-music-recommender-systems)

### Inferences
- At streaming companies, a music-audio ML profile is most hireable when framed as one of two things. (a) Music content understanding or embeddings that feed recommendation and search, with A/B and offline ranking evaluation. (b) Generative or post-training work with an explicit rights/consent story.
- Classic MIR task names (beat, key, chords) are not how these companies advertise. They describe outcomes like "tagging", "content understanding" and "AutoMix".

### Gaps
- Deezer Research and Spotify research MIR postings with 2025-2026 dates could not be read in full. The Deezer SmartRecruiters API returned zero postings, and the "Research Scientist - MIR" SmartRecruiters page returned HTTP 400. Deezer's research hiring is therefore under-represented.
- No Shazam (Apple) posting was identifiable as Shazam-specific.
