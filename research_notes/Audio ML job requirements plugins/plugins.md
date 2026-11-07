# Industry demand for neural audio effects: job postings at plugin / music-tool companies (2025-2026)

Research date: 2026-11-07. Only postings from 2025-2026, unless marked "date unclear". Every row has a URL. No rows are invented.

Method note: most big-brand careers pages are rendered with JavaScript, or were empty on the research date. Neural DSP, Waves, sonible, AudioShake, Softube, IK Multimedia, Celemony, Steinberg, Positive Grid and UA all showed no machine-readable ML/DSP openings. The sources that did work were: the JUCE forum "JUCE Jobs" category (Discourse JSON, 139 topics since 2025-01-01), Arturia's Lucca job board, the ADC jobs board (audio.dev/jobs), aggregator copies of Ableton and Native Instruments/iZotope postings, and the LinkedIn public job search for comparison roles.

---

## Q1. Evidence table: what do 2025-2026 postings at effects / plugin / music-creation companies ask for?

### Takeaway
I found 25 relevant postings at music-creation companies; 23 had enough text to tag. Only 3 of the 23 are about neural or ML audio effects in the DAFx sense: Arturia's neural compressor intern, Arturia's VA-filter intern (ML used as a solver), and a contract ML denoise plugin. Most postings are C++/JUCE plugin or embedded DSP roles with no ML requirement. Where ML roles do exist at music-tool firms, they lean toward generative or assistive tools and data work, not effect modeling.

### Cited Findings

**Main table: music-creation / effects companies (N = 23 tagged + 2 untagged)**

Tag codes are given in brackets. E = effect task, M = method, V = evaluation, D = data, P = deployment, G = general.

| # | Company | Title | Location | Date | Class | Requirements (snippet) and tags | URL |
|---|---|---|---|---|---|---|---|
| 1 | Arturia | DSP Machine Learning Intern | Montbonnot-Saint-Martin (Grenoble), FR | seen 2026 (page dated 9/14/2026) | ML-heavy | Uses "deep learning methods for modeling audio effects… emulate the behavior of audio hardware". The team designed an architecture for "dynamic range compressors". The intern must "implement the SPTMod architecture in C++", study "pruning, knowledge distillation, and neural architecture search", and "evaluate and optimize both the audio fidelity and the real-time viability". Profile: DSP + ML, Python, PyTorch; C++ is a plus; PhD/MSc student. [E: virtual analog, dynamics. M: neural networks, real-time neural inference. V: CPU benchmark, fidelity. P: C++, plugin, CPU budget. G: Python, PyTorch, degree] | https://jobs.world.luccasoftware.com/arturia-france/dsp-machine-learning-intern-04568e3b-aa5a-4fdc-a448-c1381fb6eb7c |
| 2 | Arturia | DSP Intern (VCF modeling) | Montbonnot-Saint-Martin, FR | seen 2026 (page dated 9/15/2026) | Hybrid | Virtual Analog VCF models using "zero delay feedback". Compare iterative ODE solvers (Newton-Raphson, Steffensen, Rosenbrock-Wanner) with "Machine learning methods [that] could replace the use of iterative solvers… in the wave digital domain". Wants strong DSP, VA experience, electrical engineering, Python; C++ is a plus. [E: virtual analog, EQ/filter. M: classical DSP, white-box, circuit, neural networks. V: CPU benchmark (accuracy vs performance). P: C++. G: Python, degree] | https://jobs.world.luccasoftware.com/arturia-france/dsp-intern-f9ab4bc6-9f12-4da0-aaa4-c37c41d4e652 |
| 3 | Arturia | Firmware Engineer | Montbonnot-Saint-Martin, FR (€37-42k) | seen 2026 (8/24/2026) | DSP-only | Embedded C/C++ for instruments, from drivers up to "sequencers, synthesis, and audio processing". Degree required; music interest welcome. [E: synthesis. M: classical DSP. P: C++, embedded. G: degree, music] | https://jobs.world.luccasoftware.com/arturia-france/firmware-engineer-03105a8f-4984-4b8e-98d9-079aa41fd137 |
| 4 | Ableton | Senior Machine Learning Research Engineer | Berlin, DE (hybrid) | 2026-01-27 | ML-heavy | "Design, train, evaluate and optimize ML models for creative workflows". "Guide data collection, curation". PyTorch, production models, MLOps, audio/music deep learning ideally. Publications optional. Press coverage says the targets are "automatic sample recognition, intelligent MIDI suggestions, and context-aware audio editing". [E: generative/assistive tools, other. M: neural networks. D: dataset curation. G: PyTorch, publications optional] | https://startupsucht.com/startup-job/startup-job-ableton-berlin-senior-machine-learning-research-engineer ; context: https://letsdatascience.com/news/ableton-hires-machine-learning-engineer-to-enhance-live-0e727647 |
| 5 | Native Instruments / iZotope (Research) | Data Engineer for Audio ML Research | Madrid hub / Boston / Berlin | date unclear (2025-2026; listing now 404) | ML-heavy (data) | "Building and operating pipelines and datasets for high-quality audio and symbolic audio for experimentation and shipped products". Boston estimate $90-130k. The text comes from search snippets only. [E: other. D: dataset building] | https://careers.franciscopartners.com/companies/native-instruments/jobs/56570316-data-engineer-for-audio-ml-research ; https://www.theladders.com/job/data-engineer-for-audio-ml-research-native-instruments-boston-ma_83138207 |
| 6 | iZotope (NI Research team) | ML Engineer | Madrid hub | date unclear (closed) | ML-heavy | Joins "a cross-functional group of machine-learning and DSP specialists". The full text could not be retrieved. [M: neural networks] | https://careers.franciscopartners.com/companies/izotope/jobs/55388738-ml-engineer |
| 7 | Marshall Group | Audio Plugin Engineer | Milton Keynes, UK (hybrid) | 2026-06-23 | DSP-only | C++ and JUCE. "Design, build, and release the desktop apps and audio plugins alongside Marshall's digital amp products." [P: C++, JUCE] | https://forum.juce.com/t/audio-plugin-engineer-marshall-group/69030 |
| 8 | Blackstar Amplification | C++/JUCE Developer | Northampton, UK | 2026-03-25 | DSP-only | Modern C++, JUCE, AU/VST3/AAX/LV2, CMake, codesigning, PACE iLok, Python/Bash, at least 2 years, degree. Desirable: "DSP Principles… Real Time Audio", "Guitar player". [M: classical DSP (desirable). P: C++, JUCE, VST3/AU/AAX, cross-platform. G: Python, degree, years, music] | https://forum.juce.com/t/c-juce-developer-blackstar-amps/68569 |
| 9 | GForce Software | C++/JUCE/DSP Developer | UK remote / EU contractor | 2026-05-13 | DSP-only | "Software Developer (C++/JUCE/DSP)", "2-3 years", "passion for synthesisers". [E: synthesis. M: classical DSP. P: C++, JUCE. G: years, music] | https://forum.juce.com/t/gforce-software-full-time-permanent-uk-remote-or-eu-based-contractor-c-juce-developer-needed/68822 |
| 10 | Two notes / Orosys | Senior C++ Developer | South of France | 2025-07-02 | DSP-only | The company does virtual cabinets and amp modeling. The role is to industrialise "codes R&D de traitement du signal". C++17/20, Python, JUCE, plugins for Cubase/Logic/Pro Tools, Win/Mac/iOS/Android. At least 5 years of C++ in signal processing (forum intro says 10). Bac+5. Playing an instrument is valued. [E: virtual analog. M: classical DSP. P: C++, JUCE, VST3/AU/AAX, cross-platform. G: Python, degree, years, music] | https://forum.juce.com/t/two-notes-audio-engineering-senior-c-developer/66508 |
| 11 | Moog (inMusic) | Application Software Engineer - Synth Editors | Asheville, NC, US | 2025-06-27 | DSP-only | Synth editor software "in digital audio workstations". Aimed at a "JUCE expert". [E: synthesis. P: C++/JUCE, plugin] | https://forum.juce.com/t/moog-application-software-engineer-synth-editors/66466 |
| 12 | Founder-led plugin company (Mike Seaberg) | Senior Audio Developer / Technical Lead | Remote | 2026-09-30 | DSP-primary, ML-aware | C++/JUCE (VST3, AU, AAX), "Real DSP fundamentals", "Experience modeling analog or digital hardware… emulating existing gear". Also "Well versed in AI, and how machine learning is reshaping audio". [E: virtual analog. M: classical DSP, grey/white-box. V: ear. P: C++, JUCE, VST3/AU/AAX. G: music/ear] | https://forum.juce.com/t/senior-audio-developer-technical-lead-remote/69624 |
| 13 | LAVA MUSIC | Audio DSP Developer (Guitar FX / SHARC), contract | Fully remote | 2026-01-07 | DSP-only (company uses neural amps) | "We've developed our own neural-network-based amp modeling". They want engineers for "premium guitar effects". Requirements: shipped commercial effect, tuning to "target tone, CPU/RAM/latency constraints", real-time C/C++, "strong musical ear", SHARC DSP. [E: virtual analog, other FX. M: classical DSP. V: CPU/latency, ear. P: C++, embedded (SHARC), latency, CPU budget. G: music] | https://forum.juce.com/t/paid-audio-dsp-developer-guitar-fx-sharc-project-based-fully-remote/67909 |
| 14 | Unnamed (contract) | AI/ML Audio Plugin Developer (denoising and classification) | Remote | 2025-07-05 | ML-heavy | "DSP + ML-based solutions", "C++ (JUCE preferred)", "3+ years… real-time DSP and/or ML", "C++, Python, TensorFlow or PyTorch", "STFT, MFCCs… CNNs/RNNs", VST3/AU/AAX. Bonus: "deep learning-based speech enhancement… real-time source separation". Musical background is a plus. [E: restoration/denoise, source separation. M: classical DSP, neural networks, real-time neural inference. P: C++, JUCE, VST3/AU/AAX, cross-platform. G: Python, PyTorch, years, music] | https://forum.juce.com/t/looking-for-juce-dev-with-audio-ai-ml-expertise/66532 |
| 15 | Black Salt Audio | JUCE/ARA developer (drum quantization), contract | Remote | 2026-04-09 | DSP-only | Dynamic programming over onsets, "selective time-stretching (transient preserved, tail stretched)", AU/VST, ARA. [E: time stretching, other. M: classical DSP. P: C++, JUCE, VST3/AU] | https://forum.juce.com/t/context-aware-drum-quantization-looking-for-a-juce-ara-dev/68635 |
| 16 | Mix Pilot | Audio DSP / JUCE dev for AI-assisted live mixing prototype | Remote (paid sprint) | 2026-03-11 | DSP-only (AI-branded) | "Real-time DSP analysis (FFT, loudness, spectral balance)", "scoring engine". JUCE, Core Audio, Dante. "Not an auto-mixer". [E: automatic mixing (analysis). M: classical DSP. P: C++, JUCE] | https://forum.juce.com/t/looking-for-audio-dsp-juce-developer-for-ai-assisted-live-mixing-prototype-mac-dante/68435 |
| 17 | Unnamed (guitar prototype) | Embedded Audio/DSP Engineer, acoustic modeling guitar | Remote (paid) | 2026-08-18 | DSP-only | "Very-low-latency DSP", "acoustic instrument/body modeling", "per-string pitch shifting". Embedded C/C++, Daisy/ARM/SHARC. A musician will evaluate the sound. [E: pitch shifting, synthesis/instrument modeling. M: classical DSP, white-box. V: latency, listening by musician. P: C++, embedded, latency] | https://forum.juce.com/t/paid-project-embedded-audio-dsp-engineer-for-acoustic-modeling-guitar-prototype/69322 |
| 18 | Sonovia | Embedded audio DSP for guitar amp hardware | DE (contact sonovia.de) | 2026-02-24 (first post 2025-11-22) | DSP-only | "Embedded audio DSP (amp/EQ/mod/time, IR convolution…)", "hardware-in-the-loop latency/dropout checks". [E: virtual analog, EQ, reverb/IR. M: classical DSP. V: latency tests. P: embedded, latency] | https://forum.juce.com/t/embedded-audio-dsp-for-guitar-amp-hardware-sonovia/68300 |
| 19 | Unnamed | Vocal pitch/formant shifter plugin developer | Remote | 2025-10-30 | DSP-only | Pitch and formant shifting with "as little latency and artifacts as possible". Also chorus, "short-room reverb", distortion, "multiband compression". [E: pitch shifting, dynamics, reverb. M: classical DSP. P: latency] | https://forum.juce.com/t/looking-to-develop-a-vocal-focused-pitch-formant-shifter-plugin/67440 |
| 20 | Unnamed | Hardware/firmware DSP developer (physical-modelling electric piano) | n/a | 2026-06-15 | DSP-only | "Physical modelling synth… Rhodes Mk1, and Wurlitzer 200a". [E: synthesis. M: white-box/physical. P: embedded] | https://forum.juce.com/t/seeking-hardware-firmware-dsp-developer/68989 |
| 21 | Dreamtonics | Deep Learning / Audio Research Engineer | Remote | seen 2026 (ADC board, Nov 2026) | ML-heavy | "Implement and evaluate emerging technologies in audio and speech processing". Publication record, PyTorch, singing voice synthesis / MIR. [E: generative (singing synthesis). M: neural networks. G: PyTorch, publications] | https://audio.dev/jobs/ |
| 22 | Supertone | Research Scientist; ML Engineer | n/a | seen 2026 (ADC board) | ML-heavy | "AI technologies related to audio and music", singing synthesis, neural-network noise reduction. ML Eng: "optimize and deploy models". [E: generative, denoise. M: neural networks, real-time/deployed inference] | https://audio.dev/jobs/ ; https://jobs.supertone.ai/ |
| 23 | Yamaha Corporation | R&D Division Internship | Hamamatsu / Yokohama, JP | seen 2026 (next cycle opens Sep 2026) | ML-heavy | Past themes: "Machine-learning-based musical instrument simulation", MIR, "Audio signal processing". MSc/PhD. [E: synthesis/instrument modeling. M: neural networks, classical DSP. G: degree] | https://audio.dev/jobs/ ; https://www.yamaha.com/en/tech-design/research/internship/ |
| u1 | Eventide | Plug-In Developer (Entry/Mid) | Little Ferry, NJ, US | 2025-05-23 | not tagged | Full text not retrieved (the employment page now lists only a bench tech and an intern). | https://forum.juce.com/t/eventide-plug-in-developer-entry-mid-level/66186 |
| u2 | Slate + Ash | Senior Audio Software Engineer | Bristol, UK | 2025-06-06 and 2025-10-28 | not tagged | Virtual instruments. "Algorithmic and systems engineering design". Full text not retrieved. | https://forum.juce.com/t/senior-audio-software-engineer-opportunity/67425 |

**Comparison set: consumer and pro-audio ML roles live in Nov 2026 (not music-creation tools)**

| # | Company | Title | Location | Date | Requirements (snippet) | URL |
|---|---|---|---|---|---|---|
| C1 | Bose | Audio AI Research Scientist, Audio Source Separation | Framingham, MA ($165-228k) | Nov 2026 | Source separation, speech enhancement, PyTorch, C/C++, "real-time, low-power inference", ONNX/TFLite, ICASSP/Interspeech publications, MS/PhD | https://www.linkedin.com/jobs/view/audio-ai-research-scientist-%E2%80%94-audio-source-separation-at-bose-corporation-4488077449 |
| C2 | Bose | Principal Audio DSP/ML Engineer | Framingham, MA ($216-297k CA range) | Nov 2026 | ML for noise suppression, echo cancellation, spatial audio. DSP fundamentals, Python/MATLAB, PyTorch/ONNX, C/C++, publications or patents | https://www.linkedin.com/jobs/view/principal-audio-dsp-ml-engineer-audio-technology-at-bose-corporation-4468514331 |
| C3 | HARMAN | Audio ML Engineer (Research) | Los Angeles ($134-197k) | Oct/Nov 2026 | Perception models (quality prediction, artifact detection), objective plus perceptual metrics, quantization/pruning, 5 years ML with 2+ in audio, MS/PhD | https://www.linkedin.com/jobs/view/audio-ml-engineer-research-at-harman-international-4378124147 |

Other evidence:
- On 2026-11-07, a LinkedIn public search for "audio plugin machine learning" returned only Spotify, Dolby, HARMAN, Bose, Shure and speech-AI roles. No plugin or effects company appeared. — [LinkedIn jobs search (guest API)](https://www.linkedin.com/jobs/search?keywords=audio%20plugin%20machine%20learning)
- On the research date, Waves' careers page said "There are currently no open positions". — [Waves careers](https://www.waves.com/careers)
- sonible had no open positions; the page invites speculative applications. — [sonible jobs](https://sonible.com/jobs/)
- AudioShake's careers page showed no open roles. — [AudioShake careers](https://www.audioshake.ai/careers)
- Neural DSP's Teamtailor board and RSS feed returned no listings. Its only findable ML posting is an ML Ops Engineer (AWS tooling) from about Jan 2024, which is out of range. — [Neural DSP careers](https://careers.neuraldsp.com/jobs); [MeetFrank ML Ops posting](https://meetfrank.com/jobs/neural-dsp-2/machine-learning-operations-ml-ops-engineer)
- Universal Audio's live Greenhouse board had only a procurement role. Search snippets mention UA hiring areas "DSP Algorithm, Machine Learning, Cloud", but I found no dated 2025-2026 posting. — [UA Greenhouse API](https://boards-api.greenhouse.io/v1/boards/universalaudio/jobs); [Women's Audio Mission note](https://womensaudiomission.org/trainings/entry-level-employment-opportunities-universal-audio-scotts-valley-ca/)
- Arturia says its DSP and ML team grew "from just two members to 15 people", with a new ML group. — [Arturia team page via search](https://www.arturia.com/company/discover-the-team)
- Positive Grid markets BIAS X as combining "machine learning and circuit-level modeling". Its Taiwan "Audio Algorithm Engineer" posts on 104 asked for C/C++, MATLAB, DSP and embedded work, plus "digital simulation of amplifiers/effects". No dated 2025-2026 copy was retrievable. — [Gearspace BIAS X](https://gearspace.com/board/new-product-alert-2-older-threads/1455532-positive-grid-launches-project-bias-x-ai-powered-guitar-tone-platform.html); [104 search](https://www.104.com.tw/jobs/search/?ro=0&keyword=positivegrid&order=12&asc=0)

### Inferences
- The companies that ship neural effects (Neural DSP, IK TONEX, Positive Grid, LAVA, UA) hire for this work rarely and quietly. The skill exists inside small, stable research teams, not in a steady stream of openings.
- The best-matched posting for DAFx-style neural effect work is Arturia's internship. That suggests the entry path is a research internship or PhD, not a senior hire.

### Gaps
- I could not retrieve 2025-2026 postings from Neural DSP, UA, Positive Grid, IK Multimedia, Line 6/Yamaha Guitar Group, Fractal, Kemper, Softube, Antares, Celemony, Steinberg, Bitwig, Apple Logic, Avid, Output, Splice (ML), LANDR, RoEx, Accusonus, LALAL.AI, Spitfire, Soundtoys, FabFilter, Strymon, Boss/Roland, TC Electronic, Audiomodern, Mixed In Key or Tonebridge. Their pages were empty, JS-only, or removed.
- KVR's job board and theaudioprogrammer board returned no listings to the scraper. Expired LinkedIn postings from earlier in 2025 are not searchable.
- The full texts for NI/iZotope (rows 5-6), Eventide and Slate + Ash were not available.

---

## Q2. Count table: requirement → postings (N = 23 tagged music-creation postings)

### Takeaway
C++ (14/23), classical DSP (15/23) and musical background (7/23) dominate. JUCE appears in 9/23. Neural networks appear in 8/23, but only 3 of those apply them to effects. DDSP, ESR, spectral losses, MUSHRA, dry/wet capture and RTNeural appear in 0/23.

### Cited Findings
All counts come from the Q1 table rows 1-23. Each row's URL is the source.

| Bucket | Requirement | Count / 23 | Rows |
|---|---|---|---|
| Effect | Virtual analog / amp & pedal modeling | 6 | 1, 2, 10, 12, 13, 18 |
| Effect | Synthesis / instruments (incl. physical modelling) | 6 | 3, 9, 11, 17, 20, 23 |
| Effect | Generative / assistive music tools | 3 | 4, 21, 22 |
| Effect | Dynamics (compressor/limiter) | 2 | 1, 19 |
| Effect | EQ / filter design | 2 | 2, 18 |
| Effect | Reverb / spatial (IR convolution, room) | 2 | 18, 19 |
| Effect | Pitch correction / shifting | 2 | 17, 19 |
| Effect | Restoration / denoise | 2 | 14, 22 |
| Effect | Time stretching | 1 | 15 |
| Effect | Source separation / stems | 1 | 14 (bonus only) |
| Effect | Automatic mixing / mastering | 1 | 16 (analysis only, "not an auto-mixer") |
| Effect | Other (apps, data, sample/MIDI AI) | 5 | 4, 5, 6, 7, 8 |
| Method | Classical DSP | 15 | 2, 3, 8, 9, 10, 12, 13, 14, 15, 16, 17, 18, 19, 20, 23 |
| Method | Neural networks (any) | 8 | 1, 2, 4, 6, 14, 21, 22, 23 |
| Method | Named architecture (SPTMod; CNN/RNN) | 2 | 1, 14 |
| Method | Grey/white-box or physical modeling | 4 | 2, 12, 17, 20 |
| Method | SPICE / circuit analysis | 1 | 2 |
| Method | Real-time neural inference (C++/CPU, deploy) | 3 | 1, 14, 22 |
| Method | DDSP | 0 | n/a |
| Method | RTNeural / ONNX named | 0 | n/a (ONNX only in Bose C1/C2) |
| Eval | CPU / latency benchmarks | 5 | 1, 2, 13, 17, 18 |
| Eval | Listening by ear / musician evaluation (informal) | 3 | 12, 13, 17 |
| Eval | Error-to-signal ratio / spectral losses | 0 | n/a |
| Eval | Formal listening tests / MUSHRA | 0 | n/a (perceptual metrics only in HARMAN C3) |
| Eval | A/B with users | 0 | n/a |
| Data | Dataset collection / curation | 2 | 4, 5 |
| Data | Dry/wet capture, device measurement, licensing | 0 | n/a |
| Deploy | C++ | 14 | 1, 2, 3, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17 |
| Deploy | JUCE | 9 | 7, 8, 9, 10, 11, 12, 14, 15, 16 |
| Deploy | VST3 / AU / AAX / DAW plugin formats | 6 | 8, 10, 11, 12, 14, 15 |
| Deploy | Embedded hardware (SHARC, ARM, Daisy, firmware) | 5 | 3, 13, 17, 18, 20 |
| Deploy | Latency stated | 5 | 13, 17, 18, 19, 1 |
| Deploy | CPU budget stated | 3 | 1, 2, 13 |
| Deploy | Cross-platform | 3 | 8, 10, 14 |
| Deploy | SIMD / real-time thread safety | 0 | n/a |
| General | Musical background / instrument / ear | 7 | 3, 8, 9, 10, 12, 13, 14 |
| General | Degree stated | 6 | 1, 2, 3, 8, 10, 23 |
| General | Python | 5 | 1, 2, 8, 10, 14 |
| General | PyTorch | 4 | 1, 4, 14, 21 |
| General | Years of experience stated | 4 | 8 (2), 9 (2-3), 10 (5-10), 14 (3+) |
| General | Publications | 2 | 4 (optional), 21 |
| General | MATLAB | 0 | n/a (only Bose C2 and the older Positive Grid 104 posts) |

### Inferences
- In the plugin world, the usual hiring language is "C++/JUCE + DSP fundamentals + you play an instrument". ML is an add-on in a minority of roles.
- The DAFx evaluation vocabulary (ESR, multi-resolution STFT loss, MUSHRA) does not appear in job ads at all. Hiring managers state evaluation as "audio fidelity", "musical ear", or CPU/latency limits.

### Gaps
- The sample is small and skewed toward the JUCE forum, which over-represents small studios and contracts. Large-brand roles from early 2025 that have since expired could not be recovered.

---

## Q3. ML-heavy vs DSP-only split, and verdict

### Takeaway
Demand for neural audio-effect engineers at plugin and music-tool companies is real but thin. Roughly 1 in 8 postings is about neural effects specifically. Classical C++/JUCE DSP plugin engineering is far more in demand. Audio-ML hiring at scale is happening in consumer and pro-audio hardware (Bose, Dolby, HARMAN, Shure) and in generative or assistive music AI, not in effect modeling.

### Cited Findings
- Split across the 23 tagged postings (rows from the Q1 table):
  - **ML-heavy: 8/23 (35%).** Rows 1, 4, 5, 6, 14, 21, 22, 23.
  - **Hybrid / ML-aware: 2/23 (9%).** Row 2 (ML as a VA solver) and row 12 (AI awareness).
  - **DSP-only: 13/23 (57%).** Rows 3, 7, 8, 9, 10, 11, 13, 15, 16, 17, 18, 19, 20.
- Of the 8 ML-heavy roles, only rows 1 and 14 target audio effects (neural compressor modeling; ML denoise plugin). Add hybrid row 2 and that is **3/23 (13%) neural-effects postings**. The other ML-heavy roles are about generative or singing synthesis (21, 22), assistive DAW features (4), data infrastructure (5), instrument simulation (23), or are unspecified (6).
- A company can ship neural amp models yet hire classical DSP engineers. LAVA MUSIC says it has "neural-network-based amp modeling" but asks for C/C++ on SHARC and a "musical ear". — [JUCE forum](https://forum.juce.com/t/paid-audio-dsp-developer-guitar-fx-sharc-project-based-fully-remote/67909)
- "AI" products are often built with classical DSP. Mix Pilot's "AI-assisted live mixing" asks for FFT, loudness and a scoring engine, with no ML. — [JUCE forum](https://forum.juce.com/t/looking-for-audio-dsp-juce-developer-for-ai-assisted-live-mixing-prototype-mac-dante/68435)
- Audio-ML pay sits outside music tools: Bose $165-297k and HARMAN $134-197k, compared with Arturia's firmware engineer at €37-42k. — [Bose C1](https://www.linkedin.com/jobs/view/audio-ai-research-scientist-%E2%80%94-audio-source-separation-at-bose-corporation-4488077449); [Bose C2](https://www.linkedin.com/jobs/view/principal-audio-dsp-ml-engineer-audio-technology-at-bose-corporation-4468514331); [HARMAN C3](https://www.linkedin.com/jobs/view/audio-ml-engineer-research-at-harman-international-4378124147); [Arturia](https://jobs.world.luccasoftware.com/arturia-france/firmware-engineer-03105a8f-4984-4b8e-98d9-079aa41fd137)
- Native Instruments went through preliminary insolvency proceedings in 2025, which affects Soundwide research hiring. — [search summary citing The Berliner](https://www.the-berliner.com/music-clubs/is-this-the-end-for-native-instruments/)

### Inferences
- **Verdict.** Neural or ML audio effects are a niche skill in hiring terms, not a mass market. Classical DSP plugin engineering (C++, JUCE, plugin formats, real-time constraints) is in clearly higher demand.
- The neural-effects roles that do exist expect both sides: PyTorch for training, and C++ real-time CPU inference with compression for shipping (Arturia row 1). A candidate with only ML skills would fit consumer-audio or generative-AI roles better than plugin companies.
- The strongest signal for neural effects is product launches (Neural DSP Capture, TONEX, BIAS X, LAVA), not job ads. These teams appear small and are filled by internships, PhDs or referrals.

### Gaps
- There are no reliable counts of how many people work on neural effects at Neural DSP, UA, IK, Positive Grid or Line 6. Employee-count sites were not used, because their figures are not verifiable from primary sources.
- This is a snapshot from Nov 2026. Hiring seasonality and roles that were posted and filled in early 2025 are under-counted.
