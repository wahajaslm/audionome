# Audio ML / Speech ML / Music ML job requirements in Germany (2025-2026)

Sample: **28 German postings** (10 startups, 9 established companies, 9 research institutes/universities). Dates are 2025-2026 or marked "date unclear". Research date: 2026-11-07.

Text quality per row:
- **Full** = full posting text read (ATS API, job page or mirror). 15 rows.
- **Snippet** = only a search snippet or partial mirror was readable (Glassdoor 403, Allianz 410, etc.). 13 rows. These rows undercount requirements, because only some lines were visible.

Classification rule: "startup" = founded 2015 or later and VC-funded (includes late-stage DeepL and Parloa). "Established" = older company or corporate unit (Audatic counted as Sonova, its owner). "Research" = Fraunhofer, AudioLabs, universities.

## Q1. Evidence table: what German postings say

### Takeaway
German postings are dominated by speech (ASR, TTS, speech enhancement, voice agents) and audio coding. Music-ML exists but is rare: Fraunhofer IDMT (MIR, two student roles), Ableton (music production ML), and Mirelo (generative music/sound). Postings name tasks, languages (Python/PyTorch), degrees and deployment targets. They never name a metric such as WER, SI-SDR, PESQ or FAD.

### Cited Findings

#### Startups (10)

| # | Company | Title | City | Date | Text | Key requirements (tagged) |
|---|---|---|---|---|---|---|
| 1 | voize | Senior ML Engineer - Speech (m/f/d) | Berlin (remote option) | 2026-10-09 | Full | ASR; "design, training, evaluation, and deployment"; "fast inference on mobile devices and in hosted environments"; "across languages"; "Shipped ML models to production with Python and PyTorch"; "Several years hands-on experience ... developing and optimising ASR-systems (not just academic research)"; "maintenance, monitoring and optimization" |
| 2 | voize | ML Engineer (m/w/d) - German Speaking (fulltime) | Berlin | date unclear (mirror says 6+ months old; closed) | Full | ASR + NLP; Transformer models; "large self-supervised trainings as well as fast inference for mobile devices"; Python, PyTorch, Git, Docker; **"Fluent German" required**, must reside in Germany |
| 3 | Sonia (Sonia Solutions) | Senior Machine Learning Engineer (ASR) | Berlin or remote DE/LU | 2025-11-19 | Full | ASR; fine-tune "Whisper, wav2vec"; "VAD, alignment and diarisation"; "Collect, curate, and annotate custom ASR datasets with quality control"; clinical audio preprocessing; "PyTorch, TensorFlow or Jax"; "Docker, MLflow, W&B, DVC, or Kubernetes"; Master's; 5-8+ yrs; German fluency nice-to-have |
| 4 | ai-coustics | Talent Pool: Audio Data Engineering & Machine Learning | Berlin | 2026-03-24 | Full | Speech enhancement, source separation, seq2seq audio; "deep understanding of DSP, room acoustics, reverberation, and common noise artifacts"; dataset lifecycle "from sourcing and recording to building complex synthetic simulation pipelines"; "benchmarking tools"; "You prefer meaningful, trustworthy metrics over 'vanity' numbers" (no metric named); cloud training; Python, PyTorch; 3+ yrs |
| 5 | ai-coustics | Systems Software Engineer (Rust, ML Inference) | Berlin | date unclear | Snippet | Real-time Audio AI SDK for speech enhancement and voice AI; multi-platform runtimes; Rust |
| 6 | Mirelo AI | Research Scientist - Model Team | Berlin | 2025-12-03 | Full | Audio generation (music, sound, speech) from video; diffusion/autoregressive; "rigorous ablation studies"; "data curation, experimentation, evaluation, and deployment"; PyTorch, transformers; FSDP/distributed training; publications or OSS; audio codec design nice-to-have |
| 7 | Mirelo AI | Research Scientist - Audio Codec | Berlin | 2025-12-03 | Full | Neural audio codecs for sound, music, speech; continuous vs discrete latents; "Develop benchmarking pipelines for codec evaluation" (no metric named); background in "neural codecs, source separation, speech models, or generative audio"; "audio signal processing fundamentals"; publications (NeurIPS, ICML, ICLR, Interspeech, ICASSP, WASPAA) |
| 8 | Parloa | Principal Software Engineer - Real-Time Voice | Berlin | 2026-10-14 | Full | Voice agents (not an ML role); integrate ASR, TTS, "turn-taking, barge-in"; low latency; SIP/RTP/WebRTC; telephony codecs "Opus, G.711/G.722"; jitter/packet loss; Go/C/C++/Rust; 10+ yrs |
| 9 | Parloa | Senior Machine Learning Engineer - Language Capabilities | Berlin | date unclear | Snippet | "evaluate and fine-tune" models to extend to new languages; STT, TTS, NLP "across multiple languages"; 7+ yrs |
| 10 | DeepL | Senior Staff Research Scientist, Voice | Munich / Cologne (also London) | 2026-08-13 | Full | ASR, MT, TTS, speech-to-speech translation; "LLM-based speech-to-speech"; "ultra-low-latency streaming"; "robustness to real-world acoustic conditions"; "ablations ... evaluation, reproducibility, monitoring"; multilingual; Python, PyTorch/JAX, "audio processing libraries" (unnamed) |

URLs:
1. https://jobs.ashbyhq.com/voize/31a2c1ca-0655-458c-a281-759c515ee9e8 (also [freehire mirror](https://freehire.me/jobs/senior-ml-engineer-speech-m-f-d-voize-fou52g6c))
2. https://hv.getro.com/companies/voize-2/jobs/46013558-ml-engineer-m-w-d-german-speaking-fulltime
3. https://freehire.me/jobs/senior-machine-learning-engineer-asr-all-sonia-ijecenb6
4. https://join.com/companies/ai-coustics/16028348-talent-pool-audio-data-engineering-and-machine-learning
5. https://www.stepstone.de/stellenangebote--Systems-Software-Engineer-Rust-ML-Inference-Berlin-ai-coustics-UG-haftungsbeschraenkt--14165869-inline.html
6. https://jobs.ashbyhq.com/mirelo/fb449786-cdb8-4000-8586-3df00c826095
7. https://jobs.ashbyhq.com/mirelo/55090c78-9dee-4fa3-bf29-c06ad65c0f02
8. https://jobs.ashbyhq.com/parloa/56ea8611-dc45-4780-a89d-421b7b91f87a
9. https://www.glassdoor.de/job-listing/senior-machine-learning-engineer-language-capabilities-fmd-parloa-JV_IC2622109_KO0,58_KE59,65.htm?jl=1009839286935
10. https://jobs.joinimagine.com/companies/deepl/jobs/89757267-senior-staff-research-scientist-voice

#### Established companies (9)

| # | Company | Title | City | Date | Text | Key requirements (tagged) |
|---|---|---|---|---|---|---|
| 11 | Sonova (Audatic) | Senior Deep Learning Engineer (m/f/d) | Berlin | 2026-10-31 | Full | Speech-from-noise (speech enhancement) for hearing loss; "optimal quality and efficiency on our embedded device platforms"; "Experimenting with ... loss functions, datasets, and evaluation metrics" (none named); GPU-cluster hyper-parameter optimisation; Python; BSc/MSc+5 yrs or PhD+2; "publishing or solving real-world problems"; "Experience with digital signal processing or audio processing"; full professional English |
| 12 | Sonova (Audatic) | Deep Learning Engineer (m/f/d) | Berlin | date unclear | Snippet | DL for audio processing; BSc/MSc + 2 yrs; Python; English; DSP/audio processing a plus |
| 13 | Ableton | Senior Machine Learning Research Engineer | Berlin | 2026-01-27 | Full | ML for music creation workflows; "data curation and dataset maintenance"; "ML Ops (experiment tracking, deployment, cloud compute)"; "fast, reliable, and usable by musicians"; PyTorch; "audio or music-related deep learning"; "Understanding of how people create music" |
| 14 | Allianz (Partners) | Conversational AI Engineer (Senior) | Munich | date unclear (2026 Glassdoor listing) | Snippet | Voice agents; "configuring and tuning ... ASR, TTS, and voice activity detection to meet accuracy and latency targets"; "conversational AI evaluation metrics" (none named); 5+ yrs |
| 15 | HARMAN | AI Test Engineer (m/f/d) | Garching | date unclear (2026 Glassdoor listing) | Snippet | Testing LLM/agent systems; "structured evaluations for LLM and agent-based behavior"; speech interfaces, TTS, ASR; 5+ yrs QA |
| 16 | BMW Group | Intern Multimodal Agentic AI for In-car Voice Assistant | Munich | date unclear | Snippet | LLM/GenAI features for in-car voice assistant; multimodal speech/vision/text; Python prototypes |
| 17 | Cerence AI | Senior Research Engineer AI Speech Enhancement | Ulm | date unclear | Snippet | DNN speech enhancement for automotive; "tools and workflows for training and evaluating DNN models"; MSc/PhD EE/CS; 3 yrs; "strong expertise in digital signal processing" |
| 18 | NICE (Cognigy) | Senior AI Software Engineer (NICE Labs) | Berlin or Düsseldorf | date unclear | Snippet | Voice and real-time AI: "streaming, speech-to-text/text-to-speech, and voice-to-voice models" |
| 19 | Sonova (Sennheiser brand) | Embedded Audio DSP Engineer (m/f/d) | Hannover | date unclear (2026 listings) | Snippet | DSP, not ML. Bluetooth SoCs/DSP cores; "C/C++, MATLAB and Python"; "measurement, tuning, and debugging of audio systems" |

URLs:
11. https://freehire.me/jobs/senior-deep-learning-engineer-m-f-d-audatic-jobs-sonova-com-mlp5laqa
12. https://www.glassdoor.de/job-listing/deep-learning-engineer-mfd-sonova-JV_IC2622109_KO0,26_KE27,33.htm?jl=1010099164293
13. https://startupsucht.com/startup-job/startup-job-ableton-berlin-senior-machine-learning-research-engineer
14. https://careers.allianz.com/global/en/job/101077/Conversational-AI-Engineer-Senior (now 410; snippet via [Glassdoor](https://www.glassdoor.de/job-listing/conversational-ai-engineer-senior-allianz-JV_IC4990924_KO0,33_KE34,41.htm?jl=1010179415319))
15. https://jobsearch.harman.com/en_US/careers/JobDetail/AI-Test-Engineer-m-f-d/32321
16. https://www.glassdoor.de/job-listing/intern-multimodal-agentic-ai-for-in-car-voice-assistant-fmx-bmw-group-JV_KO0,59_KE60,69.htm?jl=1010162300596
17. https://www.glassdoor.de/job-listing/senior-research-engineer-ai-speech-enhancement-cerence-JV_IC2690154_KO0,46_KE47,54.htm?jl=1010178496257
18. https://www.dreamworkhq.com/job/42ea6fe9-a279-467c-b86e-95fcd4d91a36
19. https://www.jobleads.com/de/job/embedded-audio-dsp-engineer-m-f-d--hannover--e649984f38313d9914d0c468acfe03df5

#### Research institutes and universities (9)

| # | Institution | Title | City | Date | Text | Key requirements (tagged) |
|---|---|---|---|---|---|---|
| 20 | Fraunhofer IIS | Research Assistant in Embedded AI - Speech and Audio Applications | Erlangen | 2026-10-13 | Full | "efficient real-time execution on mobile and embedded devices"; memory/compute constraints; "Strong programming skills in C/C++"; Python; PyTorch/TensorFlow; "DNN runtimes (e.g., ONNX, TensorFlow Lite)"; Linux/cmake; audio DSP; MSc/PhD; "Fluent English" |
| 21 | Fraunhofer IIS | Working Student - Machine Learning for Audio Compression | Erlangen | 2026-07-09 | Full | Audio coding; "training and evaluation pipelines"; creating training datasets; **"supporting listening test evaluation"**; signal processing basics; Python, Git, Linux; enrolled student |
| 22 | Fraunhofer IIS | Research Associate - Deep Learning for Speech and Audio Coding | Erlangen | 2026-04-13 | Snippet | Speech/audio coding and synthesis (TTS); "GANs, diffusion models, transformers" |
| 23 | Fraunhofer IIS | Group Leader in Embedded AI - Audio and Language Applications | Erlangen | date unclear | Snippet | "optimizing and deploying deep-learning algorithms for speech, audio, and natural language processing" on embedded |
| 24 | Fraunhofer IDMT | Studentische Hilfskraft im Bereich »Semantic Music Technologies« | Ilmenau | 2026-10-09 | Full | **Music-ML**: MIR, "automatic music annotation", similarity, transcription, instrument recognition, music recommendations, "generative music AI"; manual annotation of audio; Python; DSP/ML/DL; C++, JS, AWS preferred; music theory; ad written only in German |
| 25 | Fraunhofer IDMT | Mandatory internship in the field of "Semantic Music Technologies" | Ilmenau | 2026-10-12 | Full | **Music-ML**: MIR, music annotation, "generative music AI"; manual annotation; Python; DSP/ML/DL; C++, JS, AWS preferred |
| 26 | Univ. Oldenburg (Signal Processing, Doclo) | Doctoral Researcher: model-based and learning-based acoustical signal processing | Oldenburg | 2026-05-24 (deadline 2026-06-24) | Full | Noise reduction, dereverberation, source localization, beamforming; state-space models; MSc; "excellent grades"; experience in 2 of speech/audio processing, statistical SP, ML; no language rule stated |
| 27 | Univ. Oldenburg (Speech Technology, Enzner) | Research Associate / PhD: Speech Processing with ML Optimization of Physically Inspired Algorithms | Oldenburg | 2026-02-03 | Snippet | Acoustic echo cancellation, multichannel processing, adaptive SP + ML; prototype evaluation; peer-reviewed publication; official ad only in German |
| 28 | AudioLabs Erlangen (Fraunhofer IIS / FAU) | Research Associate - Audio and Media Technologies | Erlangen | date unclear | Snippet | "Digital multimedia signal processing", "audio or video coding", "human perception (psychophysics)", acoustics |

URLs:
20. https://freehire.me/jobs/research-assistant-in-embedded-ai-all-genders-speech-and-audio-applications-fraunhofer-institut-fur-integrierte-schaltungen-iis-5gjn7lhe
21. https://forum.fsi.cs.fau.de/t/working-student-machine-learning-for-audio-compression-all-genders/29403
22. https://forum.fsi.cs.fau.de/t/research-associate-deep-learning-for-speech-and-audio-coding-all-genders/29306
23. https://www.stepstone.de/stellenangebote--Group-Leader-in-Embedded-AI-Audio-and-Language-Applications-all-genders-Erlangen-Fraunhofer-Institut-fuer-Integrierte-Schaltungen-IIS--14099670-inline.html
24. https://jobs.fraunhofer.de/job/Ilmenau-Wissenschaftliche-Hilfskraft-im-Bereich-%C2%BBSemantic-Music-Technologies%C2%AB-98693/767246301/
25. https://jobs.fraunhofer.de/job/Ilmenau-Mandatory-internship-in-the-field-of-Semantic-Music-Technologies-98693/1227822101/
26. https://www.auditory.org/postings/2026/202.html
27. https://www.auditory.org/postings/2026/39.html
28. https://www.audiolabs-erlangen.de/career (links to https://iisfraunhofer.softgarden.io/job/33047343/Research-Associate-Audio-and-Media-Technologies)

#### Checked and excluded
- ai-coustics "Machine Learning Researcher (AI Speech Enhancement)": posted 2023-10-17, out of range — [join.com](https://join.com/companies/ai-coustics/9629340-machine-learning-researcher-ai-speech-enhancement)
- DFKI Berlin speech/text anonymization researcher: posted 2023-11-17 — [ISCA](https://www.isca-speech.org/Post-a-New-Job-Offer/13278811)
- Oldenburg PhD in ML and speech enhancement: deadline 2022 — [medicinoxy](https://medicinoxy.com/profileAnnouncement,a14682.html)
- Mimi Hearing Senior Data Engineer: posted 2021 — [datasciencejobs.de](https://datasciencejobs.de/post/senior-data-engineer-f-m-d-80-100-mimi-hearing-technologies-gmbh/)
- MeloTech Sr. Audio ML Engineer (Berlin, generative music): LinkedIn ID suggests ~2024, date unverified — [LinkedIn](https://de.linkedin.com/jobs/view/sr-audio-machine-learning-engineer-at-melotech-3797518771)
- Native Instruments "Data Engineer for Audio ML Research": Boston, not Germany — [TheLadders](https://www.theladders.com/job/data-engineer-for-audio-ml-research-native-instruments-boston-ma_83138207). NI's join.com board showed no open roles — [join.com](https://join.com/companies/native-instruments)
- Amazon Music "Data Scientist, Music DISCO" (Berlin, 2026): marketing analytics, not audio ML — [Amazon](https://www.amazon.jobs/en/jobs/10494195/data-scientist-music-disco)
- Audible "Senior Applied Scientist" (Berlin, 2026-10-26): NLP/recsys, no audio requirement — [Amazon](https://www.amazon.jobs/en/jobs/10588542/senior-applied-scientist)
- Helsing "AI Research Engineer - ML & Signal Processing": RF signals, not audio — [Helsing](https://helsing.ai/jobs/5028719101?gh_jid=5028719101)
- Cognigy MLOps Engineer (Düsseldorf): LLM serving, no audio; removed 2025-10-08 — [Built In](https://builtin.com/job/mlops-engineer/4824689)
- Mirelo "Training Infrastructure Engineer": generic GPU infra — [Ashby](https://jobs.ashbyhq.com/mirelo/992e82a6-ae11-4e26-ae88-0f5c442664ef)
- Cerence Workday board (Nov 2026): only Germany roles are "GenAI Research Student Worker" (Ulm, not audio) and a UX student role — [Cerence](https://cerence.wd5.myworkdayjobs.com/Cerence)

### Inferences
- The German market is speech-first. Voice agents (Parloa, DeepL, NICE/Cognigy, Allianz, BMW, HARMAN) and hearing/speech enhancement (Audatic, ai-coustics, Cerence, Oldenburg) are the two biggest clusters.
- Audio coding is a distinctly German cluster, driven by Fraunhofer IIS/AudioLabs (MP3/AAC lineage) plus Mirelo's neural codec role.

### Gaps
- Full text unavailable for 13 rows (Glassdoor 403, Allianz 410, StepStone 404, softgarden/Fraunhofer recruiting blocked). Their counts are lower bounds.
- No live 2025-2026 postings found for: Native Instruments Berlin, SoundCloud, Steinberg, Sennheiser ML (only DSP), beyerdynamic, d&b, Neumann, Bosch audio AI in Germany, Siemens acoustic anomaly detection, Mercedes-Benz voice ML, Apple/Google/Microsoft audio ML in Germany, Amazon Aachen speech (all Alexa speech roles found were outside Germany), Synthflow ML, Mimi (a "Senior Audio Signal Processing Engineer" is referenced on [LinkedIn](https://de.linkedin.com/jobs/mimi-hearing-technologies-stellen-berlin) but not readable), DFKI 2025-2026 audio roles.
- LinkedIn and StepStone job pages were mostly not fetchable, so mid-size German employers may be underrepresented.

## Q2. Count table: requirement → postings out of N = 28

### Takeaway
The most common items are Python (13/28), generic "DSP/signal processing knowledge" (13/28), generic "evaluation" language (13/28), years of experience (10/28), ASR (9/28) and cloud/MLOps (9/28). **Zero of 28** postings name a metric (WER, SI-SDR, PESQ/STOI/POLQA, FAD), a named feature (mel, MFCC, CQT, pitch), a split/leakage rule, licensing/consent, GDPR/privacy, quantization, or JUCE/plugins.

### Cited Findings
All counts come from the 28 rows above (sources listed per row in Q1). S = startups (10), Est = established companies + research (18), split into companies (9) and research (9).

**1. Tasks**

| Requirement | All (N=28) | Startups (10) | Est+Research (18) | Companies (9) | Research (9) |
|---|---|---|---|---|---|
| ASR | 9 (32%) | 6 | 3 | 3 | 0 |
| TTS | 7 (25%) | 3 | 4 | 3 | 1 |
| Speaker ID / diarization | 1 (4%) | 1 | 0 | 0 | 0 |
| Source separation | 2 (7%) | 2 | 0 | 0 | 0 |
| Speech enhancement | 7 (25%) | 2 | 5 | 3 | 2 |
| MIR | 2 (7%) | 0 | 2 | 0 | 2 |
| Music tagging / annotation | 2 (7%) | 0 | 2 | 0 | 2 |
| Music recommendation | 1 (4%) | 0 | 1 | 0 | 1 |
| Audio/music generation | 4 (14%) | 2 | 2 | 0 | 2 |
| Sound event detection | 0 | 0 | 0 | 0 | 0 |
| Acoustic anomaly detection | 0 | 0 | 0 | 0 | 0 |
| Voice agents / speech-to-speech | 6 (21%) | 2 | 4 | 4 | 0 |
| Audio coding | 5 (18%) | 2 | 3 | 0 | 3 |
| Other (VAD/alignment, NLP, beamforming/localization, AEC, music-production ML, embedded deployment) | 9 (32%) | 3 | 6 | 3 | 3 |

**2. Features & models**

| Requirement | All | Startups | Est+Research | Companies | Research |
|---|---|---|---|---|---|
| Named features (mel/MFCC/CQT/pitch) | 0 | 0 | 0 | 0 | 0 |
| Generic DSP / signal processing knowledge | 13 (46%) | 2 | 11 | 4 | 7 |
| Named foundation models (Whisper, wav2vec, etc.) | 1 (4%) — Sonia only | 1 | 0 | 0 | 0 |
| Neural audio codecs as models | 2 (7%) — Mirelo | 2 | 0 | 0 | 0 |
| Transformers | 4 (14%) | 3 | 1 | 0 | 1 |
| Generative (diffusion/GAN/autoregressive) | 3 (11%) | 2 | 1 | 0 | 1 |
| Self-supervised training | 1 (4%) | 1 | 0 | 0 | 0 |
| LLM + audio | 3 (11%) | 1 | 2 | 2 | 0 |

**3. Evaluation**

| Requirement | All | Startups | Est+Research | Companies | Research |
|---|---|---|---|---|---|
| Named metric (WER, SI-SDR, PESQ/STOI/POLQA, FAD) | **0** | 0 | 0 | 0 | 0 |
| MOS / listening tests | 1 (4%) — Fraunhofer IIS student | 0 | 1 | 0 | 1 |
| A/B tests | 0 | 0 | 0 | 0 | 0 |
| Generic "evaluation" / eval design / benchmarking | 13 (46%) | 8 | 5 | 4 | 1 |
| Ablations / rigor | 2 (7%) — Mirelo, DeepL | 2 | 0 | 0 | 0 |

**4. Data practices**

| Requirement | All | Startups | Est+Research | Companies | Research |
|---|---|---|---|---|---|
| Curation / dataset building | 5 (18%) | 3 | 2 | 1 | 1 |
| Labeling / annotation | 3 (11%) | 1 | 2 | 0 | 2 |
| Augmentation / synthetic simulation | 1 (4%) — ai-coustics | 1 | 0 | 0 | 0 |
| Data quality control | 1 (4%) — Sonia | 1 | 0 | 0 | 0 |
| Leakage / splits | **0** | 0 | 0 | 0 | 0 |
| Licensing / consent | **0** | 0 | 0 | 0 | 0 |
| GDPR / privacy | **0** | 0 | 0 | 0 | 0 |
| Multilingual data/models | 3 (11%) — voize, Parloa, DeepL | 3 | 0 | 0 | 0 |
| German-specific data | 0 | 0 | 0 | 0 | 0 |

**5. Deployment**

| Requirement | All | Startups | Est+Research | Companies | Research |
|---|---|---|---|---|---|
| Real-time / streaming | 6 (21%) | 3 | 3 | 2 | 1 |
| On-device / embedded / mobile | 6 (21%) | 2 | 4 | 2 | 2 |
| C/C++ (required or preferred) | 5 (18%) | 1 | 4 | 1 | 3 |
| Rust | 2 (7%) | 2 | 0 | 0 | 0 |
| JUCE / plugins | 0 | 0 | 0 | 0 | 0 |
| ONNX / TFLite | 1 (4%) — Fraunhofer IIS | 0 | 1 | 0 | 1 |
| Latency named | 5 (18%) | 2 | 3 | 2 | 1 |
| Quantization named | 0 | 0 | 0 | 0 | 0 |
| Cloud / MLOps / production serving | 9 (32%) | 6 | 3 | 1 | 2 |

**6. General stack**

| Requirement | All | Startups | Est+Research | Companies | Research |
|---|---|---|---|---|---|
| Python | 13 (46%) | 5 | 8 | 4 | 4 |
| PyTorch | 8 (29%) | 6 | 2 | 1 | 1 |
| TensorFlow | 2 (7%) | 1 | 1 | 0 | 1 |
| MATLAB | 1 (4%) — Sennheiser | 0 | 1 | 1 | 0 |
| librosa / torchaudio named | 0 | 0 | 0 | 0 | 0 |
| Degree stated | 7 (25%) | 1 | 6 | 3 | 3 |
| Years of experience stated | 10 (36%) | 5 | 5 | 5 | 0 |
| Publications | 4 (14%) | 2 | 2 | 1 | 1 |
| German required | 1 (4%) — voize | 1 | 0 | 0 | 0 |
| German nice-to-have | 1 (4%) — Sonia | 1 | 0 | 0 | 0 |
| Ad written only in German (implicit German) | 2 (7%) — IDMT student, Oldenburg Enzner | 0 | 2 | 0 | 2 |
| English explicitly required | 3 (11%) | 0 | 3 | 2 | 1 |

Full-text-only check (15 rows): named metric 0/15; generic evaluation 9/15; Python 10/15. The zero-metric result does not depend on snippet rows.

### Inferences
- "Evaluation" appears often but always as a verb or a value ("trustworthy metrics", "evaluation metrics", "accuracy and latency targets"). No posting says which metric.
- The only concrete evaluation method named in all 28 is "listening test evaluation" (Fraunhofer IIS working student).

### Gaps
- Snippet rows (13) may hide stack items (Python, PyTorch) and degree lines. Stack and degree counts are lower bounds.

## Q3. Startups vs established firms

### Takeaway
Startups ask for production ML: PyTorch (6/10), cloud/MLOps (6/10), ASR (6/10) and evaluation language (8/10). Established firms and research ask for DSP fundamentals (11/18), degrees (6/18) and C/C++/embedded. Research roles are the only source of music-ML, listening tests and audio coding outside Mirelo.

### Cited Findings
- Startups: PyTorch 6/10, cloud/MLOps 6/10, generic evaluation 8/10, generic DSP 2/10, degree 1/10 (counts from Q2 table; rows 1-10 in Q1).
- Established + research: generic DSP 11/18, degree 6/18, C/C++ 4/18, PyTorch 2/18 (rows 11-28).
- Established companies (non-research) skew to voice agents: 4/9 are voice-agent or voice-assistant roles (Allianz, HARMAN, BMW, NICE) — rows 14-18.
- Years-of-experience lines appear in 5/9 company postings and 0/9 research postings (rows 11-28).
- Startup voize states the clearest "industry over academia" line: "(not just academic research)" — [voize Ashby](https://jobs.ashbyhq.com/voize/31a2c1ca-0655-458c-a281-759c515ee9e8).
- ai-coustics is the only posting that names synthetic data simulation and room acoustics/reverb — [join.com](https://join.com/companies/ai-coustics/16028348-talent-pool-audio-data-engineering-and-machine-learning).

### Inferences
- A candidate pitching to German startups should lead with shipped PyTorch models and an evaluation story. For Fraunhofer/universities and hardware firms, lead with DSP and C/C++.
- Established voice-agent roles (Allianz, HARMAN) are integration/testing roles. They ask about ASR/TTS as components, not as models to train.

### Gaps
- Sample is small (10/9/9). Differences of 1-2 postings are not meaningful.

## Q4. Comparison with the global finding

### Takeaway
Germany matches the global pattern. Postings name tasks, credentials and deployment, and almost never name metrics, features or split rules. In Germany the pattern is even stricter: 0/28 name a metric, 0/28 name a feature, 0/28 name a split or leakage rule.

### Cited Findings
- Named metrics: 0/28. Named features: 0/28. Splits/leakage: 0/28 (Q2 tables).
- Tasks named in 28/28 postings (every row has at least one task tag).
- Credentials named: degree 7/28, years 10/28, publications 4/28.
- Deployment named: real-time 6/28, on-device 6/28, cloud/MLOps 9/28, C/C++ 5/28.
- The single named foundation model list is Sonia's "Whisper, wav2vec" — [freehire](https://freehire.me/jobs/senior-machine-learning-engineer-asr-all-sonia-ijecenb6).
- GDPR/privacy is never named, even in clinical speech roles (Sonia, voize) where patient audio is involved (rows 1-3).

### Inferences
- The German gap on data governance is notable. GDPR is a German/EU legal fact of life, but postings do not list it as a skill.
- The global "postings don't name metrics" finding holds in a second, independent market. This strengthens the case that metric literacy (WER, SI-SDR, listening tests) is a differentiator that job ads do not screen for.

### Gaps
- The global sample's exact percentages are not in this file. A side-by-side percentage table needs the global tally.

## Q5. German language and music-ML roles

### Takeaway
German is rarely required. Only 1/28 postings requires fluent German (voize, for customer contact). 1 lists it as nice-to-have (Sonia). 2 research ads are written only in German. Music-ML roles exist but are few: 2 Fraunhofer IDMT student/intern roles, Ableton, and Mirelo (2 roles). No music-ML full-time role at an established company other than Ableton was found.

### Cited Findings
- voize: "Fluent German" required, particularly for customer interaction; must reside in Germany — [getro](https://hv.getro.com/companies/voize-2/jobs/46013558-ml-engineer-m-w-d-german-speaking-fulltime). voize's other speech role (Oct 2026) has no German requirement — [Ashby](https://jobs.ashbyhq.com/voize/31a2c1ca-0655-458c-a281-759c515ee9e8).
- Sonia: "English and German fluency" listed as nice-to-have — [freehire](https://freehire.me/jobs/senior-machine-learning-engineer-asr-all-sonia-ijecenb6).
- Fraunhofer IDMT student ad is only in German; requirements do not state a language — [Fraunhofer](https://jobs.fraunhofer.de/job/Ilmenau-Wissenschaftliche-Hilfskraft-im-Bereich-%C2%BBSemantic-Music-Technologies%C2%AB-98693/767246301/).
- Oldenburg (Enzner) official ad is in German — [auditory.org](https://www.auditory.org/postings/2026/39.html).
- English explicitly required: Audatic (both), Fraunhofer IIS embedded AI — rows 11, 12, 20.
- Music-ML roles:
  - Fraunhofer IDMT student assistant: MIR, annotation, similarity, transcription, instrument recognition, music recommendations, generative music AI — [Fraunhofer](https://jobs.fraunhofer.de/job/Ilmenau-Wissenschaftliche-Hilfskraft-im-Bereich-%C2%BBSemantic-Music-Technologies%C2%AB-98693/767246301/)
  - Fraunhofer IDMT mandatory internship: same area — [Fraunhofer](https://jobs.fraunhofer.de/job/Ilmenau-Mandatory-internship-in-the-field-of-Semantic-Music-Technologies-98693/1227822101/)
  - Ableton Senior ML Research Engineer: music creation ML — [startupsucht](https://startupsucht.com/startup-job/startup-job-ableton-berlin-senior-machine-learning-research-engineer)
  - Mirelo Research Scientist (Model Team, Audio Codec): music/sound/speech generation — [Ashby](https://jobs.ashbyhq.com/mirelo/55090c78-9dee-4fa3-bf29-c06ad65c0f02)
- Music recommendation appears only once (IDMT student role). No German music-streaming ML role was found. SoundCloud and Native Instruments had no readable German audio-ML posting.

### Inferences
- English is the working language for audio ML in Germany. German matters mainly for customer-facing roles and some public-sector research ads.
- Full-time music-ML jobs in Germany are concentrated in two places: Ableton (production tools) and generative-audio startups (Mirelo). MIR research work sits at Fraunhofer IDMT, mostly at student level in this sample.

### Gaps
- No 2025-2026 AudioLabs or FAU MIR PhD posting (Meinard Müller's group) was found, though the group runs MIR projects through 2027 — [AudioLabs](https://www.audiolabs-erlangen.de/fau/professor/mueller/projects).
- Fraunhofer IDMT full-time "Semantic Music Technologies" researcher roles appeared only in older LinkedIn listings (IDs suggest ~2024), so they were not counted.
