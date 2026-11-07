# Audio ML job requirements at voice-AI and generative-audio companies (2025-2026)

Method: job descriptions were pulled directly from the companies' public applicant-tracking APIs (Ashby `api.ashbyhq.com/posting-api/job-board/<org>`, Greenhouse `boards-api.greenhouse.io/v1/boards/<org>/jobs`) on 2026-11-07, plus two pages fetched by hand (Kyutai, Krisp). ML/research/audio-relevant titles were kept. Requirements were tagged with keyword rules (regex) over the role-specific text. Sentences that repeat across 3 or more distinct postings at the same company (company "about us" blurbs, benefits) were removed before tagging so boilerplate does not count. Degree statements were tagged on the full text.

N = 34 distinct postings from 15 companies. All are 2025-2026 except one with an unclear date (Kyutai).

## What do 2025-2026 audio ML postings at voice-AI / generative-audio companies concretely require?

### Takeaway
These postings are dominated by generative speech (TTS, speech-to-speech, voice agents), not by classic audio analysis. The most frequent requirements are: designing evals/benchmarks (22/34), dataset curation (16/34), latency (14/34), publications (14/34), PyTorch (13/34), and LM-style modeling (12/34). Classic audio features (MFCC, CQT, pitch) and classic metrics (WER, PESQ, SDR, FAD) almost never appear by name.

### Cited Findings

#### Evidence table (one row per posting)

Tags are keyword matches against role text. The URL is the primary posting. Date = the ATS "published" date.

| # | Company | Title | Location | Date (published) | URL | Requirement tags |
|---|---|---|---|---|---|---|
| 1 | assemblyai | Senior Researcher | Remote | 2026-09-01 | [link](https://job-boards.greenhouse.io/assemblyai/jobs/4729671005) | **Features & models**: Autoregressive / LM-based modeling (incl. text LLMs); **Evaluation**: designing evals/benchmarks (general) |
| 2 | bland | Machine Learning Researcher, Audio | San Francisco | 2026-04-20 | [link](https://jobs.ashbyhq.com/bland/2e815d0d-8e7a-43cc-8853-c1b029aeb499) | **Tasks**: ASR, TTS, audio/music generation, speech-to-speech / voice agents (other); **Features & models**: SSL/foundation audio encoders (wav2vec2/HuBERT/WavLM/Whisper/BEATs/MERT/CLAP), neural audio codecs (EnCodec/DAC/Mimi), Autoregressive / LM-based modeling (incl. text LLMs); **Evaluation**: MOS/subjective/perceptual tests, designing evals/benchmarks (general), statistical rigor / ablations; **Data practices**: dataset curation, data quality/filtering, large-scale data pipelines; **Deployment**: real-time/streaming, latency/RTF, quantization/distillation, GPU inference serving (vLLM/SGLang/batching), CUDA/kernels; **General stack**: distributed training, PhD/MS degree, publications, open-source contributions |
| 3 | bland | Machine Learning Researcher, Multimodal LLMs | San Francisco | 2026-04-21 | [link](https://jobs.ashbyhq.com/bland/681dfcda-f016-4bda-826e-7e813fae0083) | **Tasks**: speech-to-speech / voice agents (other); **Features & models**: neural audio codecs (EnCodec/DAC/Mimi), LLM+audio / speech-to-speech, post-training/RLHF/preference opt.; **Deployment**: real-time/streaming, latency/RTF, GPU inference serving (vLLM/SGLang/batching); **General stack**: open-source contributions |
| 4 | cartesia | Applied Researcher, Audio | *HQ - San Francisco, CA | 2025-09-16 | [link](https://jobs.ashbyhq.com/cartesia/d26f0158-f7d1-440b-9c1a-f9b7a884437c) | **Tasks**: audio/music generation, speech-to-speech / voice agents (other); **Features & models**: Autoregressive / LM-based modeling (incl. text LLMs), LLM+audio / speech-to-speech, post-training/RLHF/preference opt.; **Evaluation**: designing evals/benchmarks (general); **Data practices**: dataset curation, labeling/annotation, synthetic data; **General stack**: distributed training |
| 5 | cartesia | Researcher, Evals | *HQ - San Francisco, CA | 2025-10-21 | [link](https://jobs.ashbyhq.com/cartesia/53fb0b93-d49d-47c7-a679-35ee76b007c5) | **Tasks**: audio/music generation; **Features & models**: post-training/RLHF/preference opt.; **Evaluation**: MOS/subjective/perceptual tests, designing evals/benchmarks (general), statistical rigor / ablations |
| 6 | cartesia | Researcher, Models (UK) | London | 2025-10-07 | [link](https://jobs.ashbyhq.com/cartesia/7ecc288b-6eb0-41d6-b17c-3187fac43f95) | **Tasks**: audio/music generation; **Features & models**: Autoregressive / LM-based modeling (incl. text LLMs), diffusion, transformers/conformers, state space models; **Evaluation**: designing evals/benchmarks (general); **Deployment**: real-time/streaming, on-device/edge, latency/RTF; **General stack**: PyTorch, publications |
| 7 | cartesia | Researcher, Post Training | *HQ - San Francisco, CA | 2025-10-21 | [link](https://jobs.ashbyhq.com/cartesia/33a8d2ef-ccc1-446a-8fd3-9c21cd211900) | **Features & models**: SSL/foundation audio encoders (wav2vec2/HuBERT/WavLM/Whisper/BEATs/MERT/CLAP), Autoregressive / LM-based modeling (incl. text LLMs), post-training/RLHF/preference opt.; **Evaluation**: human preference evals / human-in-loop, designing evals/benchmarks (general); **General stack**: open-source contributions |
| 8 | cartesia | Research Engineer, Data Infrastructure (Language Modeling) | *HQ - San Francisco, CA | 2026-09-24 | [link](https://jobs.ashbyhq.com/cartesia/6ca9b352-6a7b-42a3-a7c4-8f071712db90) | **Tasks**: audio/music generation; **Features & models**: Autoregressive / LM-based modeling (incl. text LLMs); **Evaluation**: statistical rigor / ablations; **Data practices**: dataset curation, augmentation, data quality/filtering, large-scale data pipelines |
| 9 | deepgram | Applied ML Engineer -  Edge Devices | USA - Remote | 2026-09-14 | [link](https://jobs.ashbyhq.com/Deepgram/94ae2781-a85f-493a-86c1-ff85a9289355) | **Features & models**: spectral DSP; **Evaluation**: designing evals/benchmarks (general); **Data practices**: dataset curation; **Deployment**: real-time/streaming, on-device/edge, ONNX/TensorRT/Triton, latency/RTF, quantization/distillation, GPU inference serving (vLLM/SGLang/batching), CUDA/kernels; **General stack**: Python, PyTorch |
| 10 | deepgram | Director of Research, Text-to-Speech | USA - Remote | 2026-08-21 | [link](https://jobs.ashbyhq.com/Deepgram/6e3344f4-48c7-4127-871c-3f1dada45323) | **Tasks**: TTS, audio/music generation, voice conversion/cloning; **Features & models**: neural audio codecs (EnCodec/DAC/Mimi), Autoregressive / LM-based modeling (incl. text LLMs), post-training/RLHF/preference opt.; **Evaluation**: MOS/subjective/perceptual tests, human preference evals / human-in-loop, designing evals/benchmarks (general); **General stack**: publications, open-source contributions |
| 11 | deepgram | Embedded AI Engineer, On-Device Models | USA - Remote | 2026-07-07 | [link](https://jobs.ashbyhq.com/Deepgram/0b7494b3-a91e-4540-9439-5b10a1e5b391) | **Features & models**: spectral DSP, neural audio codecs (EnCodec/DAC/Mimi); **Evaluation**: designing evals/benchmarks (general); **Data practices**: dataset curation; **Deployment**: real-time/streaming, on-device/edge, C/C++/Rust, ONNX/TensorRT/Triton, latency/RTF, quantization/distillation, CUDA/kernels |
| 12 | deepgram | Research Engineer, Post-Training | USA - Remote | 2026-10-19 | [link](https://jobs.ashbyhq.com/Deepgram/dcea53a5-5650-406d-a154-fad077c4b81b) | **Tasks**: ASR, TTS, speech-to-speech / voice agents (other); **Evaluation**: designing evals/benchmarks (general); **Data practices**: dataset curation, synthetic data; **General stack**: Python, PyTorch, distributed training, "no degree required" stated, publications, open-source contributions |
| 13 | deepgram | Research Staff, Voice AI Foundations | USA - Remote | 2026-08-23 | [link](https://jobs.ashbyhq.com/Deepgram/7cf277bc-a192-4007-a77a-fafbf8276a5e) | **Tasks**: ASR, TTS, audio/music generation, speech-to-speech / voice agents (other); **Features & models**: SSL/foundation audio encoders (wav2vec2/HuBERT/WavLM/Whisper/BEATs/MERT/CLAP), neural audio codecs (EnCodec/DAC/Mimi), Autoregressive / LM-based modeling (incl. text LLMs), diffusion, transformers/conformers, state space models, LLM+audio / speech-to-speech, post-training/RLHF/preference opt.; **Evaluation**: MOS/subjective/perceptual tests, designing evals/benchmarks (general), statistical rigor / ablations; **Data practices**: dataset curation, data quality/filtering, large-scale data pipelines, synthetic data; **Deployment**: real-time/streaming, on-device/edge, ONNX/TensorRT/Triton, latency/RTF, quantization/distillation, CUDA/kernels; **General stack**: distributed training, publications, open-source contributions |
| 14 | deepgram | Senior Data Scientist, Audio | USA - Remote | 2026-09-21 | [link](https://jobs.ashbyhq.com/Deepgram/ba60a541-fdf7-44bf-a6bb-0e821f15af54) | **Tasks**: ASR, TTS, speech-to-speech / voice agents (other); **Evaluation**: designing evals/benchmarks (general), statistical rigor / ablations; **Data practices**: dataset curation, labeling/annotation, privacy, large-scale data pipelines; **General stack**: Python |
| 15 | deepgram | Research Staff, LLMs | USA - Remote | 2026-08-23 | [link](https://jobs.ashbyhq.com/Deepgram/39c2b79b-0269-4711-9354-be5ccf747a98) | **Features & models**: Autoregressive / LM-based modeling (incl. text LLMs), transformers/conformers, post-training/RLHF/preference opt.; **Evaluation**: A/B tests/online metrics; **Data practices**: dataset curation, labeling/annotation, large-scale data pipelines; **General stack**: Python, PyTorch, distributed training, publications |
| 16 | descript | Applied Research Scientist, AI Research | San Francisco, CA or Remote, US | 2026-08-24 | [link](https://boards.greenhouse.io/descript/jobs/7967440003?gh_jid=7967440003) | **Tasks**: audio/music generation; **Features & models**: SSL/foundation audio encoders (wav2vec2/HuBERT/WavLM/Whisper/BEATs/MERT/CLAP), Autoregressive / LM-based modeling (incl. text LLMs), post-training/RLHF/preference opt.; **Evaluation**: designing evals/benchmarks (general); **Data practices**: synthetic data; **Deployment**: latency/RTF; **General stack**: PyTorch, PhD/MS degree, "no degree required" stated, publications, open-source contributions |
| 17 | elevenlabs | Research Engineer | Poland | 2026-10-11 | [link](https://jobs.ashbyhq.com/ElevenLabs/3d650946-5ac2-4729-9ae4-129c43fcd0b5) | **Features & models**: post-training/RLHF/preference opt.; **Evaluation**: designing evals/benchmarks (general), statistical rigor / ablations; **Data practices**: dataset curation; **General stack**: publications, "no degree required" stated |
| 18 | elevenlabs | Research Engineer - Inference | United Kingdom | 2026-08-28 | [link](https://jobs.ashbyhq.com/ElevenLabs/2d7f9a7c-a9e6-4877-bb38-34e4d989054c) | **Deployment**: real-time/streaming, ONNX/TensorRT/Triton, latency/RTF, quantization/distillation, GPU inference serving (vLLM/SGLang/batching), CUDA/kernels; **General stack**: "no degree required" stated |
| 19 | elevenlabs | Research Engineer - Data Infrastructure | United Kingdom | 2026-10-19 | [link](https://jobs.ashbyhq.com/ElevenLabs/9fbd9227-57e0-4221-9255-1a1d967be8ed) | **Data practices**: dataset curation, labeling/annotation, augmentation, data quality/filtering, large-scale data pipelines; **General stack**: "no degree required" stated |
| 20 | elevenlabs | Research Engineer - Web Crawlers | United Kingdom | 2026-08-28 | [link](https://jobs.ashbyhq.com/ElevenLabs/a89a7892-3d9d-40ab-a3f1-1c6ed1f7b84f) | **Data practices**: data quality/filtering, large-scale data pipelines; **General stack**: "no degree required" stated |
| 21 | hume-ai | Research Engineer | Hume AI HQ | 2026-09-14 | [link](https://jobs.ashbyhq.com/hume-ai/36e92e2b-26c5-4bdf-b9e6-628ae8747a8c) | **Tasks**: ASR, TTS, audio/music generation, speech-to-speech / voice agents (other); **Features & models**: transformers/conformers, LLM+audio / speech-to-speech, post-training/RLHF/preference opt.; **Evaluation**: human preference evals / human-in-loop, designing evals/benchmarks (general), statistical rigor / ablations; **Data practices**: large-scale data pipelines; **General stack**: Python, PyTorch, distributed training, publications, open-source contributions, "no degree required" stated, PhD/MS degree |
| 22 | neuphonic | Machine Learning Researcher | London | 2026-11-05 | [link](https://jobs.ashbyhq.com/neuphonic/ec217aa1-756f-4997-a6eb-57a2f48c529c) | **Tasks**: TTS, audio/music generation, speech-to-speech / voice agents (other); **Evaluation**: designing evals/benchmarks (general); **Data practices**: dataset curation; **Deployment**: real-time/streaming, on-device/edge, latency/RTF; **General stack**: PyTorch, JAX, PhD/MS degree, "no degree required" stated, open-source contributions |
| 23 | rime | Machine Learning Scientist | United States | 2026-05-15 | [link](https://jobs.ashbyhq.com/rime/b76243da-3ce0-463e-9f29-2b6d1b78666e) | **Tasks**: TTS, speech-to-speech / voice agents (other); **Features & models**: mel/log-mel, neural audio codecs (EnCodec/DAC/Mimi), Autoregressive / LM-based modeling (incl. text LLMs), LLM+audio / speech-to-speech; **Evaluation**: MOS/subjective/perceptual tests, designing evals/benchmarks (general), statistical rigor / ablations; **Data practices**: labeling/annotation, data quality/filtering, leakage/splits; **Deployment**: real-time/streaming, latency/RTF, quantization/distillation; **General stack**: PyTorch, distributed training, PhD/MS degree, "no degree required" stated, publications |
| 24 | sesame | Research Engineer | San Francisco | 2026-06-17 | [link](https://jobs.ashbyhq.com/sesame/5e846cd7-5719-440c-b8ef-2fba501847ae) | **Evaluation**: designing evals/benchmarks (general); **Data practices**: dataset curation, privacy; **Deployment**: latency/RTF; **General stack**: PyTorch |
| 25 | sesame | Research Scientist | San Francisco | 2026-07-14 | [link](https://jobs.ashbyhq.com/sesame/376d302f-f870-40aa-940f-aee951803d2b) | **Evaluation**: designing evals/benchmarks (general); **Data practices**: dataset curation; **Deployment**: GPU inference serving (vLLM/SGLang/batching); **General stack**: publications, PhD/MS degree |
| 26 | sesame | ML Model Serving Engineer | San Francisco | 2026-11-03 | [link](https://jobs.ashbyhq.com/sesame/35793528-2b5c-47b3-9422-eaced2b69f63) | **Data practices**: dataset curation, large-scale data pipelines; **Deployment**: latency/RTF, GPU inference serving (vLLM/SGLang/batching), CUDA/kernels; **General stack**: PyTorch |
| 27 | sesame | Audio Systems Engineer | San Francisco | 2026-10-27 | [link](https://jobs.ashbyhq.com/sesame/040d7828-d53b-4a0b-8782-812d27fb3483) | **Tasks**: speech enhancement/denoising; **Features & models**: spectral DSP; **Evaluation**: designing evals/benchmarks (general); **Data practices**: data quality/filtering; **Deployment**: real-time/streaming, on-device/edge; **General stack**: Python |
| 28 | speechmatics | Senior Machine Learning Engineer | Speechmatics London | 2026-10-02 | [link](https://jobs.ashbyhq.com/speechmatics/9216ddfd-cb98-4b91-b4b5-c0ab26abaf5c) | **Tasks**: ASR; **Features & models**: SSL/foundation audio encoders (wav2vec2/HuBERT/WavLM/Whisper/BEATs/MERT/CLAP), transformers/conformers; **Data practices**: dataset curation; **Deployment**: on-device/edge, GPU inference serving (vLLM/SGLang/batching); **General stack**: distributed training, publications, open-source contributions |
| 29 | speechmatics | ML Data & Platform Engineer | Speechmatics Cambridge | 2026-09-04 | [link](https://jobs.ashbyhq.com/speechmatics/87c90c0e-5767-4bbb-b815-3a55146c7887) | **Evaluation**: designing evals/benchmarks (general); **Data practices**: data quality/filtering, large-scale data pipelines; **Deployment**: GPU inference serving (vLLM/SGLang/batching); **General stack**: Python, distributed training, experiment tracking |
| 30 | suno | Senior/Staff Machine Learning Engineer - Content Discovery | San Francisco | 2026-10-02 | [link](https://jobs.ashbyhq.com/suno/e94b6a03-6315-45c2-a439-51630af15f05) | **Tasks**: music/audio recommendation; **Evaluation**: A/B tests/online metrics; **Data practices**: large-scale data pipelines; **Deployment**: real-time/streaming, latency/RTF; **General stack**: Python, PyTorch, PhD/MS degree, "no degree required" stated, publications |
| 31 | tavus | AI Researcher (Multimodal Audio/Video Generation) | San Francisco | 2026-05-15 | [link](https://jobs.ashbyhq.com/tavus/09972bf5-780d-4209-a758-d4ad32c012e0) | **Tasks**: audio/music generation, speech-to-speech / voice agents (other); **Features & models**: diffusion; **General stack**: PyTorch, distributed training, PhD/MS degree, "no degree required" stated, publications |
| 32 | tavus | Multimodal AI Model Optimization Research Engineer | Remote | 2026-09-28 | [link](https://jobs.ashbyhq.com/tavus/08ba99c2-3cc2-4d7f-8c4c-b16a1900a88d) | **Tasks**: TTS, audio/music generation, speech-to-speech / voice agents (other); **Features & models**: Autoregressive / LM-based modeling (incl. text LLMs), diffusion; **Evaluation**: designing evals/benchmarks (general); **Deployment**: real-time/streaming, on-device/edge, ONNX/TensorRT/Triton, latency/RTF, quantization/distillation, CUDA/kernels; **General stack**: Python, PyTorch, experiment tracking |
| 33 | udio | Senior Backend Engineer, Data Modeling and Ingestion Platform | New York | 2025-11-13 | [link](https://job-boards.greenhouse.io/udio/jobs/4988140008) | **Tasks**: audio/music generation; **Evaluation**: statistical rigor / ablations; **Data practices**: data quality/filtering, large-scale data pipelines; **General stack**: Python, JAX, distributed training |
| 34 | kyutai | Technical Staff | Paris, France (Europe possible) | date unclear (live Nov 2026) | [link](https://kyutai.homerun.co/technical-staff) | **General stack**: distributed training, PhD/MS degree |

#### Count table per bucket (N = 34 postings)


#### Tasks (N=34)

| Requirement | Postings | Share |
|---|---|---|
| ASR | 6/34 | 18% |
| TTS | 9/34 | 26% |
| speaker ID/diarization | 0/34 | 0% |
| source separation | 0/34 | 0% |
| speech enhancement/denoising | 1/34 | 3% |
| MIR | 0/34 | 0% |
| music tagging/classification | 0/34 | 0% |
| music/audio recommendation | 1/34 | 3% |
| audio/music generation | 13/34 | 38% |
| sound event detection | 0/34 | 0% |
| anomaly detection | 0/34 | 0% |
| audio-text retrieval | 0/34 | 0% |
| voice conversion/cloning | 1/34 | 3% |
| speech-to-speech / voice agents (other) | 11/34 | 32% |

#### Features & models (N=34)

| Requirement | Postings | Share |
|---|---|---|
| mel/log-mel | 1/34 | 3% |
| MFCC | 0/34 | 0% |
| CQT | 0/34 | 0% |
| pitch/f0 | 0/34 | 0% |
| spectral DSP | 3/34 | 9% |
| SSL/foundation audio encoders (wav2vec2/HuBERT/WavLM/Whisper/BEATs/MERT/CLAP) | 5/34 | 15% |
| neural audio codecs (EnCodec/DAC/Mimi) | 6/34 | 18% |
| Autoregressive / LM-based modeling (incl. text LLMs) | 12/34 | 35% |
| diffusion | 4/34 | 12% |
| flow matching | 0/34 | 0% |
| transformers/conformers | 5/34 | 15% |
| state space models | 2/34 | 6% |
| LLM+audio / speech-to-speech | 5/34 | 15% |
| post-training/RLHF/preference opt. | 10/34 | 29% |

#### Evaluation (N=34)

| Requirement | Postings | Share |
|---|---|---|
| WER/CER | 0/34 | 0% |
| SI-SDR/SDR | 0/34 | 0% |
| PESQ/STOI | 0/34 | 0% |
| MOS/subjective/perceptual tests | 5/34 | 15% |
| FAD | 0/34 | 0% |
| A/B tests/online metrics | 2/34 | 6% |
| human preference evals / human-in-loop | 3/34 | 9% |
| designing evals/benchmarks (general) | 22/34 | 65% |
| statistical rigor / ablations | 9/34 | 26% |

#### Data practices (N=34)

| Requirement | Postings | Share |
|---|---|---|
| dataset curation | 16/34 | 47% |
| labeling/annotation | 5/34 | 15% |
| augmentation | 2/34 | 6% |
| data quality/filtering | 9/34 | 26% |
| leakage/splits | 1/34 | 3% |
| licensing/consent/rights | 0/34 | 0% |
| privacy | 2/34 | 6% |
| large-scale data pipelines | 12/34 | 35% |
| synthetic data | 4/34 | 12% |

#### Deployment (N=34)

| Requirement | Postings | Share |
|---|---|---|
| real-time/streaming | 12/34 | 35% |
| on-device/edge | 8/34 | 24% |
| C/C++/Rust | 1/34 | 3% |
| ONNX/TensorRT/Triton | 5/34 | 15% |
| latency/RTF | 14/34 | 41% |
| quantization/distillation | 7/34 | 21% |
| GPU inference serving (vLLM/SGLang/batching) | 8/34 | 24% |
| CUDA/kernels | 7/34 | 21% |

#### General stack (N=34)

| Requirement | Postings | Share |
|---|---|---|
| Python | 10/34 | 29% |
| PyTorch | 13/34 | 38% |
| JAX | 2/34 | 6% |
| librosa/torchaudio | 0/34 | 0% |
| distributed training | 12/34 | 35% |
| experiment tracking | 2/34 | 6% |
| PhD/MS degree | 9/34 | 26% |
| "no degree required" stated | 11/34 | 32% |
| publications | 14/34 | 41% |
| open-source contributions | 10/34 | 29% |

#### Notable verbatim requirements (spot-checked)
- Rime ML Scientist asks for "Deep familiarity with the speech synthesis literature ... Tacotron, FastSpeech, VITS, VALL-E, the codec-LM lineage", hands-on training with "neural codecs (EnCodec, DAC, Mimi, etc.)", full/half-duplex modeling ("Moshi, LLaMA-Omni, streaming S2S"), and catching "when an eval set has leakage". This is the only posting that names mel features, codecs, and leakage together. — [Rime](https://jobs.ashbyhq.com/rime/b76243da-3ce0-463e-9f29-2b6d1b78666e)
- Bland ML Researcher, Audio covers both TTS and ASR. It asks for "neural audio codec-based TTS architectures", ASR "robust to accents, noise, telephony artifacts, and code switching", "self-supervised pretraining and large-scale weak supervision", "data filtering strategies", "ablation studies", and "objective metrics and perceptual evaluations". — [Bland](https://jobs.ashbyhq.com/bland/2e815d0d-8e7a-43cc-8853-c1b029aeb499)
- Deepgram Director of Research, TTS asks for "automated metrics alongside human perceptual assessment", plus prosody, controllability, multilingual speech, voice identity, post-training, and inference performance. — [Deepgram](https://jobs.ashbyhq.com/Deepgram/6e3344f4-48c7-4127-871c-3f1dada45323)
- Deepgram Senior Data Scientist, Audio covers characterizing data by "languages, conditions, domains, speakers, quality", "active-learning loops", human-in-the-loop workflows, and "representative benchmarking". — [Deepgram](https://jobs.ashbyhq.com/Deepgram/ba60a541-fdf7-44bf-a6bb-0e821f15af54)
- Deepgram Embedded AI Engineer asks for custom kernels "(C, C++, Rust, and platform assembly or intrinsics)" for NPUs/DSPs, plus quantization and operator fusion to meet "latency, memory, power, and thermal budgets". — [Deepgram](https://jobs.ashbyhq.com/Deepgram/0b7494b3-a91e-4540-9439-5b10a1e5b391)
- ElevenLabs Research Engineer - Inference asks for "quantization, distillation, KV-cache optimization, batching strategies, and custom kernels", plus "CUDA, Triton, TensorRT ... vLLM or SGLang". All ElevenLabs research postings say "We do not require any formal certifications or degrees". — [ElevenLabs](https://jobs.ashbyhq.com/ElevenLabs/2d7f9a7c-a9e6-4877-bb38-34e4d989054c)
- ElevenLabs Research Engineer - Data Infrastructure asks for training "classifiers, quality filters, and labeling models" and for "deduplication, quality scoring, labeling, and augmentation". — [ElevenLabs](https://jobs.ashbyhq.com/ElevenLabs/9fbd9227-57e0-4221-9255-1a1d967be8ed)
- Speechmatics Senior MLE (ASR) asks for "contemporary transformer architectures (e.g., GQA, KV-caching)", distributed training, and inference optimisation ("dynamic batching, flash attention, speculative decoding"). It also mentions large self-supervised models. — [Speechmatics](https://jobs.ashbyhq.com/speechmatics/9216ddfd-cb98-4b91-b4b5-c0ab26abaf5c)
- Hume AI Research Engineer: "A PhD is not required". Bonus points for "text-to-speech, automatic speech recognition, speech-to-speech, prosody, emotion recognition" and "post-training, preference learning, or human evaluation of generative models". — [Hume AI](https://jobs.ashbyhq.com/hume-ai/36e92e2b-26c5-4bdf-b9e6-628ae8747a8c)
- Cartesia Researcher, Evals asks for "evaluation frameworks for generative models (audio, text, or multimodal)" and "novel quantitative metrics for subjective or behavioral qualities". — [Cartesia](https://jobs.ashbyhq.com/cartesia/53fb0b93-d49d-47c7-a679-35ee76b007c5)
- Suno's only open ML posting dated 2025-2026 is a music recommendation role. It asks for "models of user preference, similarity, and engagement", "sparse, noisy" interaction data, "real-time latency", metrics for "relevance, novelty, diversity, long-term satisfaction", "causal analyses", and an MS/PhD or equivalent. — [Suno](https://jobs.ashbyhq.com/suno/e94b6a03-6315-45c2-a439-51630af15f05)
- Udio data-ingestion role (generative audio): entity resolution, deduplication, "match precision/recall", TFRecords, Beam/BigQuery, Ray, and JAX/multihost training as a plus. — [Udio](https://job-boards.greenhouse.io/udio/jobs/4988140008)
- Sesame Audio Systems Engineer is the only classic-DSP role: mic arrays, "FIR/IIR filter design, beamforming, echo cancellation", and SoundCheck/Audio Precision testing. — [Sesame](https://jobs.ashbyhq.com/sesame/040d7828-d53b-4a0b-8782-812d27fb3483)

#### Generative audio vs speech recognition roles
- Generative/TTS/S2S roles (Bland, Cartesia, Rime, Neuphonic, Deepgram TTS, Tavus, Hume) stress four things: neural codecs and tokens, autoregressive/LM-style or diffusion modeling, perceptual/human evals, and real-time low latency. — [Rime](https://jobs.ashbyhq.com/rime/b76243da-3ce0-463e-9f29-2b6d1b78666e); [Bland](https://jobs.ashbyhq.com/bland/2e815d0d-8e7a-43cc-8853-c1b029aeb499); [Neuphonic](https://jobs.ashbyhq.com/neuphonic/ec217aa1-756f-4997-a6eb-57a2f48c529c)
- Post-training / RLHF / preference optimization shows up in 10/34 postings, mostly in generative roles. Example: Cartesia Researcher, Post Training asks for "RLHF and related approaches" and "human-in-the-loop evaluation systems". — [Cartesia](https://jobs.ashbyhq.com/cartesia/33a8d2ef-ccc1-446a-8fd3-9c21cd211900)
- ASR roles (AssemblyAI, Speechmatics, Deepgram) stress three things: data quality analysis, production accuracy evaluation harnesses, and transformer/inference-stack engineering. They do not name WER explicitly. — [AssemblyAI](https://job-boards.greenhouse.io/assemblyai/jobs/4729671005); [Speechmatics](https://jobs.ashbyhq.com/speechmatics/9216ddfd-cb98-4b91-b4b5-c0ab26abaf5c)
- Several postings are written modality-agnostic. Examples: ElevenLabs "Training state-of-the-art models - across any modality"; Sesame Research Engineer requires "training or fine-tuning LLMs". — [ElevenLabs](https://jobs.ashbyhq.com/ElevenLabs/3d650946-5ac2-4729-9ae4-129c43fcd0b5); [Sesame](https://jobs.ashbyhq.com/sesame/5e846cd7-5719-440c-b8ef-2fba501847ae)

### Inferences
- Evaluation design is the most common single requirement (22/34). In this market, the scarce skill is building trustworthy evals for subjective audio quality, not knowing named metrics.
- Data curation and pipelines (16/34 curation, 12/34 pipelines, 9/34 quality filtering) are near-universal. The stress is on scale and quality filtering. Licensing/consent is never named in role text (0/34), even at music companies. It may sit with legal or partnerships instead (Udio's other open roles are artist partnerships).
- Hand-crafted audio features (mel 1/34; MFCC, CQT, pitch 0/34) and librosa/torchaudio (0/34) are effectively absent. Learned representations (codecs 6/34, SSL encoders 5/34) are the named currency.
- Degree signals are split. 9/34 mention PhD/MS. 11/34 explicitly say no degree is needed or equivalent experience counts. Publications or open-source work act as the stand-in credential (publications 14/34, open source 10/34).
- MIR, music tagging, source separation, diarization, sound event detection, and audio-text retrieval appear in 0/34. These companies are not hiring for music-analysis skills in 2025-2026. The only music-side ML role found is recommendation (Suno). For a music-DNA / recommendation profile, Suno's discovery posting is the closest match.

### Gaps
- Keyword tagging undercounts implicit requirements. Example: AssemblyAI's "accuracy of production models" implies WER but does not say it. Some long postings were spot-checked only in their requirement sections.
- Some 2025-2026 postings could not be retrieved: Udio research roles, Stability AI audio (its Greenhouse board had only an IT role on 2026-11-07; third-party aggregators list a "Research Scientist, Professional Creative Workflows" posted Jul 2026, not verified), PlayHT, Resemble AI, Krisp, Cerence, Nuance/Microsoft, Zoom, Dolby, YC Work at a Startup, Wellfound, and LinkedIn (login-gated). Krisp's "ML Engineer, Voice AI" (noise/background-voice cancellation, accent conversion; Python/TensorFlow/PyTorch) was marked expired with no date, so it is excluded from N. — [staff.am](https://staff.am/jobs/machine-learning/ml-engineer-voice-ai)
- Suno "Machine Learning Scientist" (generative models, "LLMs or diffusion models", distributed PyTorch, 5+ yrs) was still live in Nov 2026 but has a 2024-05 publish date, so it is excluded from N. — [Suno](https://jobs.ashbyhq.com/suno/1e23d125-d72c-49b6-891d-77d62c96cd13)
- Deepgram "Research Staff, Applied Voice AI" has text identical to "Research Engineer, Post-Training" and was counted once. Regional copies (Deepgram Foundations x4, Speechmatics x4, Cartesia Voices x2) were counted once each.
- The sample is heavy on US/UK voice-AI startups. Big-company audio teams (Microsoft, Zoom, Dolby, Cerence) are not represented, so classic DSP/enhancement skills are likely underrepresented here.
- Kyutai Technical Staff shows no posting date (live Nov 2026).
