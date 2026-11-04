# Music Source Separation, Instrument Recognition and Vocal Detection (2024-2026 upgrade options)

Context: current app uses Demucs 4.1 (htdemucs / htdemucs_6s) + librosa HPSS fallback for stems, and a hand-written spectral heuristic for instruments. Target: Mac Apple Silicon, 16 GB RAM, ~7 GB free disk. Repertoire includes South Asian music (harmonium, tabla, dholak, sitar, flute).

## What beats HTDemucs today (SDR, size, Apple Silicon feasibility)?

### Takeaway
Band-split RoFormer-family models (BS-RoFormer, Mel-Band RoFormer) and SCNet beat HTDemucs on MUSDB18-HQ by roughly 0.7-1.1 dB average SDR, with the biggest gains on vocals and "other". They are 3-11x larger (200-870 MiB vs 52-80 MiB) and slower, but they run on a Mac via PyTorch MPS or native MLX ports. The simplest drop-in path is `python-audio-separator` or `ZFTurbo/Music-Source-Separation-Training` (both MIT code).

### Cited Findings
**Baselines (HTDemucs)**
- HTDemucs scores 9.00 dB SDR on MUSDB-HQ test. Sparse attention plus per-source fine-tuning (htdemucs_ft) reaches 9.20 dB. — [Demucs README](https://github.com/adefossez/demucs/blob/main/README.md)
- htdemucs_ft is about 4x slower than htdemucs. htdemucs_6s adds piano and guitar. On CPU, processing takes about 1.5x the track duration. — [Demucs README](https://github.com/adefossez/demucs/blob/main/README.md)
- Demucs is now maintained by Alexandre Défossez personally, after he left Meta for Kyutai. — [Demucs README](https://github.com/adefossez/demucs/blob/main/README.md)
- On ZFTurbo's "Multisong" benchmark, HTDemucs4 averages 9.16 (bass 11.76, drums 10.88, vocals 8.24, other 5.74). htdemucs_6s scores bass 11.22, drums 10.22, vocals 8.05. Piano and guitar are not scored. — [ZFTurbo pretrained_models.md](https://github.com/ZFTurbo/Music-Source-Separation-Training/blob/main/docs/pretrained_models.md)
- Measured checkpoint sizes: htdemucs 4-stem is 80 MiB (`955717e8-8726e21a.th`). htdemucs_6s is 52 MiB (`5c90dfd2-34c22ccb.th`). — HTTP content-length from [dl.fbaipublicfiles.com](https://dl.fbaipublicfiles.com/demucs/hybrid_transformer/955717e8-8726e21a.th)

**BS-RoFormer**
- With no extra data, BS-RoFormer gets 9.80 dB average SDR on MUSDB18HQ. A version trained on MUSDB18HQ plus 500 extra songs won first place in the SDX23 MSS track. — [BS-RoFormer, arXiv 2309.02612](https://arxiv.org/abs/2309.02612)
- ZFTurbo's MUSDB-only BS-RoFormer scores 9.65 on the MUSDB test (bass 8.48, drums 11.61, vocals 11.08, other 7.44). Weights are 502 MiB. — [ZFTurbo pretrained_models.md](https://github.com/ZFTurbo/Music-Source-Separation-Training/blob/main/docs/pretrained_models.md) (size measured by HTTP HEAD)
- The viperx BS-RoFormer vocal model (`model_bs_roformer_ep_317_sdr_12.9755.ckpt`) scores 10.87 vocal SDR on Multisong, vs 8.24 for HTDemucs4. Size is 609 MiB. — [ZFTurbo pretrained_models.md](https://github.com/ZFTurbo/Music-Source-Separation-Training/blob/main/docs/pretrained_models.md)

**Mel-Band RoFormer**
- Mel-RoFormer uses overlapping Mel-scale bands. It beats BS-RoFormer on vocals, drums and "other". — [Mel-Band RoFormer, arXiv 2310.01809](https://arxiv.org/abs/2310.01809) (I could not get the per-stem numbers from the abstract page.)
- The KimberleyJensen Mel-RoFormer vocal model scores 10.98 vocal SDR on Multisong. Checkpoint is 870 MiB. — [ZFTurbo pretrained_models.md](https://github.com/ZFTurbo/Music-Source-Separation-Training/blob/main/docs/pretrained_models.md); [HF KimberleyJSN/melbandroformer](https://huggingface.co/KimberleyJSN/melbandroformer)
- "BS PolarFormer" is listed at 11.00 vocal SDR, the top vocal entry in ZFTurbo's list. — [ZFTurbo pretrained_models.md](https://github.com/ZFTurbo/Music-Source-Separation-Training/blob/main/docs/pretrained_models.md)
- On MVSEP's synthetic leaderboard, MVSep's own BS-RoFormer (2025.07.20) leads with 14.58 vocal / 14.29 instrumental SDR. These are commercial MVSEP-hosted models, not downloadable. — [MVSEP Synth Leaderboard](https://mvsep.com/quality_checker/synth_leaderboard?ensemble=0)

**SCNet (ICASSP 2024)**
- SCNet reaches 9.0 dB SDR on MUSDB18-HQ with no extra data, at lower compute than earlier SOTA. — [SCNet, arXiv 2401.13276](https://arxiv.org/abs/2401.13276)
- SCNet XL IHF (MUSDB-only) scores 10.08 on the MUSDB test (bass 9.23, drums 11.81, vocals 11.42, other 7.88) and 9.92 on Multisong. That is the best 4-stem average in ZFTurbo's MUSDB-only table. Checkpoint is 204 MiB. — [ZFTurbo pretrained_models.md](https://github.com/ZFTurbo/Music-Source-Separation-Training/blob/main/docs/pretrained_models.md) (size measured)
- SCNet Large (starrytong) scores 9.70 on MUSDB test. — same source
- Follow-ups include Band-SCNet, a causal lightweight real-time variant (Interspeech 2025). — [ISCA Archive](https://www.isca-archive.org/interspeech_2025/yang25d_interspeech.html)

**6-stem options**
- BS-RoFormer-SW (by jarredou) gives 6 stems (vocals, drums, bass, guitar, piano, other). It is the recommended default in the openmirlab RoFormer inference packages. — [openmirlab/bs-roformer-infer](https://github.com/openmirlab/bs-roformer-infer)
- No published SDR for BS-RoFormer-SW was found in the MLX port's card. — [HF ssmall256/mlx-audio-separator](https://huggingface.co/ssmall256/mlx-audio-separator)

**Apple Silicon runtime**
- `mlx-audio-separator` is an MLX-native port (no PyTorch/ONNX) of BS-RoFormer-SW, Mel-RoFormer InstV7n, UVR-MDX-NET Inst HQ3, HTDemucs, HTDemucs_FT, HTDemucs_6s and ZFTurbo Mel-RoFormer Vocals v1. Models range 63.8-870.6 MiB, 2.51 GiB total. It reports bit-identical output to the originals but gives no speed figures. — [HF ssmall256/mlx-audio-separator](https://huggingface.co/ssmall256/mlx-audio-separator)
- The python-audio-separator owner reports RoFormer separation takes about 1:49 vs about 19 s for the VR arch model `2_HP-UVR.pth` on an M3 Max. Best instrumental is `model_bs_roformer_ep_317_sdr_12.9755.ckpt` (17.0 instrumental SDR on his metric). He recommends htdemucs_6s for 6 stems. — [python-audio-separator Discussion #133](https://github.com/nomadkaraoke/python-audio-separator/discussions/133)
- python-audio-separator is MIT-licensed. Its README asks for credit to UVR when using UVR-trained models. — [python-audio-separator README](https://github.com/nomadkaraoke/python-audio-separator)
- ZFTurbo/Music-Source-Separation-Training is MIT-licensed and actively maintained (pushed Nov 2026). It trains and runs BS/Mel-RoFormer, SCNet, MDX23C, HTDemucs, BS-Mamba2 and others. — [GitHub API / repo](https://github.com/ZFTurbo/Music-Source-Separation-Training)

### Inferences
- The best fit for 16 GB / 7 GB disk is a hybrid. Use a RoFormer vocal model (about 0.6-0.9 GB) for vocals/instrumental. Keep htdemucs (80 MiB) or SCNet XL IHF (204 MiB) for drums/bass/other. Expect roughly +2.5 dB on vocals and +1-2 dB on "other" vs htdemucs.
- RoFormer inference is about 5x slower than lightweight models. In an interactive app, cache stems per track and run separation in the background.
- SCNet XL IHF is the best size/quality trade-off for a 4-stem replacement. It beats HTDemucs on every stem except bass on the MUSDB test.
- 6-stem guitar/piano stems are of little use for South Asian music. Harmonium, sitar and flute will land in "other" (or be mislabeled as piano/guitar). AudioSep-style text queries are the only route to "harmonium" or "tabla" stems.
- The HPSS fallback can stay as a no-model path, but it is a weak baseline.

### Gaps
- No per-stem Mel-RoFormer paper numbers were extracted. The full PDF is needed.
- I found no verified MPS/MLX seconds-per-track benchmarks for each model, apart from the M3 Max anecdote above.
- I found no SDR evaluation of any model on South Asian or qawwali material. All benchmarks use Western pop/rock (MUSDB, Multisong).

## Which separation weights are licensed for commercial vs non-commercial use?

### Takeaway
Almost no high-quality separation weights have a clear commercial licence. The code is MIT nearly everywhere. Demucs's own author says the weights' licence is unclear, and the 6-stem model is "likely" CC-NC-BY. Most UVR/community RoFormer weights have unknown or undocumented licences. Treat everything except clearly MIT-tagged checkpoints as non-commercial or unverified.

### Cited Findings
- Demucs code is MIT. Its README says: "The license of the weights is not clear: MusDB contains some data that were only usable for research purpose... The 6 source variant of htdemucs was trained only on Meta internal dataset, which likely means CC-NC-BY license." — [Demucs README, License section](https://github.com/adefossez/demucs/blob/main/README.md)
- MUSDB18-only weights (all of ZFTurbo's "MUSDB18HQ-only" table, including SCNet XL IHF and BS-RoFormer 9.65) inherit MUSDB's research-only data terms. That is the same concern Demucs's author raises. — inference from [Demucs README](https://github.com/adefossez/demucs/blob/main/README.md)
- In the MLX port: HTDemucs models and ZFTurbo Mel-RoFormer Vocals v1 are tagged "MIT". BS-RoFormer-SW is "Unknown". Mel-RoFormer InstV7n and UVR-MDX-NET Inst HQ3 are "Undocumented". — [HF ssmall256/mlx-audio-separator](https://huggingface.co/ssmall256/mlx-audio-separator). Note: the MIT tag on HTDemucs conflicts with Défossez's own statement above.
- The openmirlab packages state that the BS-RoFormer-SW checkpoint mirror labels its licence "unknown". They also say the MIT code licence "should not be treated as a grant for commercial use of the checkpoint." — [openmirlab/bs-roformer-infer](https://github.com/openmirlab/bs-roformer-infer)
- The KimberleyJSN/melbandroformer weights on Hugging Face carry an `mit` licence tag. — [HF API KimberleyJSN/melbandroformer](https://huggingface.co/KimberleyJSN/melbandroformer)
- The viperx BS/Mel-RoFormer checkpoints are distributed via the UVR model repo (TRvlvr/model_repo releases). I found no explicit licence for the weights. — [ZFTurbo pretrained_models.md links](https://github.com/ZFTurbo/Music-Source-Separation-Training/blob/main/docs/pretrained_models.md) (unverified)
- Repo code licences (GitHub API): ZFTurbo MSST MIT, lucidrains/BS-RoFormer MIT, starrytong/SCNet MIT. ZFTurbo/MVSEP-MDX23 has no SPDX licence detected. — [GitHub](https://github.com/ZFTurbo/Music-Source-Separation-Training), [lucidrains/BS-RoFormer](https://github.com/lucidrains/BS-RoFormer), [starrytong/SCNet](https://github.com/starrytong/SCNet)

### Inferences
- For a personal/local app, any of these are practical. For a commercial product, only the KimberleyJSN Mel-RoFormer (MIT-tagged) has an explicit permissive weight tag. Even it was probably trained on data of unknown provenance, so legal review is advised.
- Commercial-clean stems would need self-training on licensed data (e.g., MoisesDB has its own terms; not verified here) or a commercial API (MVSEP, AudioShake, etc., not researched).

### Gaps
- I did not find primary licence statements from viperx, jarredou, unwa or aufr33 for their weights.
- I did not verify the licence of the training sets for community models.

## Best trained instrument recognition / tagging models; can any recognise tabla, harmonium, sitar?

### Takeaway
Replace the heuristic with an AudioSet-trained tagger: PANNs CNN14 (weights CC BY 4.0), EfficientAT (MIT) or PaSST (Apache-2.0). AudioSet's 527 labels include **Sitar, Tabla, Flute, Accordion, Harmonica, Organ, Drum kit, Singing, Music of Bollywood, Carnatic music and Music of Asia**. They do **not** include Harmonium or Dholak. For harmonium/dholak, the best options are CLAP zero-shot (LAION CLAP, Apache-2.0 weights) or a small probe trained on embeddings. The strongest music encoders (MERT, MuQ, MAEST, Essentia models) have non-commercial weights.

### Cited Findings
**AudioSet taggers**
- The AudioSet class list (used by PANNs/PaSST/EfficientAT/BEATs) contains: Sitar (148), Tabla (170), Flute (196), Harmonica (208), Accordion (209), Organ (155), Keyboard (152), Drum kit (162), Singing (27), Male/Female singing (32/33), Choir (28), Vocal music (254), Music of Asia (260), Carnatic music (261), Music of Bollywood (262). No "Harmonium", "Dholak", "Bansuri" or "Qawwali" class exists. — [PANNs class_labels_indices.csv](https://github.com/qiuqiangkong/audioset_tagging_cnn/blob/master/metadata/class_labels_indices.csv) (grepped directly)
- PANNs: Wavegram-Logmel-CNN gets 0.439 mAP on AudioSet. Code is MIT. — [PANNs README](https://github.com/qiuqiangkong/audioset_tagging_cnn)
- PANNs weights on Zenodo are **CC BY 4.0**. Sizes: Cnn14 327 MB, Cnn14_16k 359 MB, MobileNetV1 23.6 MB, MobileNetV2 20.8 MB, Cnn10 25.2 MB. — [Zenodo 3987831](https://zenodo.org/records/3987831)
- EfficientAT (MobileNetV3/DyMN, distilled from PaSST) reaches 0.478 AudioSet mAP with small CNNs. Code is MIT. — [EfficientAT GitHub](https://github.com/fschmid56/EfficientAT)
- PaSST reports 84.3 mAP on OpenMIC-2018 (20 instrument classes). Code is Apache-2.0. — [SOTA2 OpenMIC leaderboard](https://www.sota2.com/research/sota/musical-instrument-classification-on-openmic-test) (aggregator); [kkoutini/PaSST](https://github.com/kkoutini/PaSST)
- OpenMIC-2018 has 20,000 ten-second CC-licensed excerpts labelled for 20 Western instrument classes. — [Spotify Research](https://research.atspotify.com/publications/openmic-2018-an-open-dataset-for-multiple-instrument-recognition)
- BEATs code is MIT (microsoft/unilm). — [microsoft/unilm](https://github.com/microsoft/unilm). Weight licence unverified.

**Music foundation models (non-commercial weights)**
- MERT-v1-95M and MERT-v1-330M weights are **CC-BY-NC-4.0** on Hugging Face (code repo Apache-2.0). — [HF m-a-p/MERT-v1-330M](https://huggingface.co/m-a-p/MERT-v1-330M); [yizhilll/MERT](https://github.com/yizhilll/MERT)
- MuQ and MuQ-MuLan weights are **CC-BY-NC-4.0** (code MIT). — [HF OpenMuQ/MuQ-large-msd-iter](https://huggingface.co/OpenMuQ/MuQ-large-msd-iter); [HF OpenMuQ/MuQ-MuLan-large](https://huggingface.co/OpenMuQ/MuQ-MuLan-large); [tencent-ailab/MuQ](https://github.com/tencent-ailab/MuQ)
- Essentia/MTG models are **CC BY-NC-SA 4.0** (proprietary licence on request). They include MTG-Jamendo instrument (87 classes), NSynth instrument, voice/instrumental, voice gender, and MAEST / Discogs-EffNet embeddings. — [Essentia models](https://essentia.upf.edu/models.html); MAEST HF tag cc-by-nc-sa-4.0 [HF mtg-upf/discogs-maest-30s-pw-129e](https://huggingface.co/mtg-upf/discogs-maest-30s-pw-129e)

**Zero-shot (CLAP)**
- LAION CLAP repo is CC0-1.0. The HF checkpoints `laion/larger_clap_music` and `laion/clap-htsat-unfused` are tagged **Apache-2.0**. — [LAION-AI/CLAP](https://github.com/LAION-AI/CLAP); [HF laion/larger_clap_music](https://huggingface.co/laion/larger_clap_music)

**South Asian instruments**
- A 2024 study classified Dhol-Tasha, Flute, Harmonium, Sitar and Tabla with deep learning on an open-source dataset, on embedded platforms. — [ResearchGate 380804036](https://www.researchgate.net/publication/380804036_Indian_Music_Instrument_Classification_Using_Deep_Learning_on_Embedded_Platforms)
- IMIDataset covers 10 instruments (Flute, Veena, Sitar, Sarod, Tabla, Violin, Guitar, Piano, Bass, Drums). It has no harmonium. — [search summary of IMIDataset](https://www.sciencedirect.com/science/article/abs/pii/S0952197624007401) (not verified in full text)
- 2026 work applies transductive graph label propagation to Indian music analysis with limited labels. — [arXiv 2601.03626](https://arxiv.org/abs/2601.03626)

### Inferences
- **Recommended stack:** run PANNs CNN14 or EfficientAT on the full mix and on each stem. Read the sitar, tabla, flute and drum-kit logits directly. Add CLAP zero-shot prompts ("harmonium", "dholak", "tabla", "qawwali clapping") and calibrate thresholds on a few labelled Coke Studio clips. Everything in this stack is permissive (CC BY 4.0 / MIT / Apache-2.0).
- Harmonium is reed-based and acoustically close to accordion/harmonica, which AudioSet does cover. The accordion/harmonica/organ logits are a useful proxy, though this is unvalidated.
- For best accuracy in a non-commercial setting, train a small linear/MLP probe on MERT or MuQ embeddings with a few hundred labelled clips. Literature suggests such probes beat AudioSet taggers on music tasks, but I did not verify head-to-head numbers here.
- The current heuristic (flatness/centroid/onset on "other") has no learned timbre model, so any of these models should be a large step up.

### Gaps
- I found no published accuracy of PANNs/PaSST/CLAP on the AudioSet Tabla or Sitar classes specifically, and no evaluation on qawwali.
- BEATs, PaSST and EfficientAT weight licences are not explicitly stated (only the code licences were verified).
- CLAP zero-shot accuracy on Indian instruments is unknown.
- There is no public pretrained model for harmonium/dholak.

## Best singing voice detection / vocal activity detection approaches

### Takeaway
The most practical modern approach is separation-based. Run a strong RoFormer vocal model, then threshold the vocal stem's frame energy (or its PANNs "Singing" probability), with temporal smoothing. Dedicated SVD models are mostly 2018-2021 era CNN/CRNNs at about 91-94% accuracy on Jamendo. Recent research energy has moved to singing-deepfake detection and speech-vs-singing discrimination, not classic SVD.

### Cited Findings
- On the Jamendo corpus, CNNs on spectrograms reach up to 91.8% accuracy, and a 5-model voting ensemble reaches 94.2%. — [Singing Voice Detection: A Survey (Entropy 2022)](https://doi.org/10.3390/e24010114)
- "Revisiting Singing Voice Detection" (ISMIR 2018) provides code and pretrained weights. — [kyungyunlee/ismir2018-revisiting-svd](https://github.com/kyungyunlee/ismir2018-revisiting-svd)
- JDC (joint melody extraction and voice detection CRNN) has code and pretrained models. — [keums/melodyExtraction_JDC](https://github.com/keums/melodyExtraction_JDC)
- An LRCN approach that combines vocal separation with temporal smoothing improves SVD. This supports the separate-then-detect pipeline. — [Electronics 2020](https://dx.doi.org/10.3390/electronics9091458)
- Recent work (2025) on speech activity detection in the presence of singing (SR-SAD, BiGRU on mel-spectrograms) targets speech-vs-singing confusion. — [arXiv 2512.09713](https://arxiv.org/abs/2512.09713)
- SVDD 2024 (singing-voice deepfake detection) top EER was 1.65%. Speaker-recognition foundation models outperformed MERT there. — [arXiv 2408.16132](https://arxiv.org/abs/2408.16132)
- The Essentia voice/instrumental classifier exists but is non-commercial (CC BY-NC-SA). — [Essentia models](https://essentia.upf.edu/models.html)
- AudioSet "Singing", "Male singing", "Female singing" and "Choir" classes are available in PANNs/EfficientAT. — [PANNs labels](https://github.com/qiuqiangkong/audioset_tagging_cnn/blob/master/metadata/class_labels_indices.csv)

### Inferences
- Pipeline: RoFormer vocal stem → frame RMS in dB relative to the mix → hysteresis threshold + median filter (about 200-500 ms), cross-checked with the PANNs "Singing" frame-wise probability (the DecisionLevelMax/Att variants give framewise output).
- Qawwali has chorus vocals and hand-claps, and the claps can leak into vocal stems. The AudioSet "Clapping" class could be used to mask false positives (not verified as a label in this session).

### Gaps
- I found no 2024-2026 benchmark comparing separation-based SVD to dedicated SVD models.
- I found no SVD evaluation on South Asian music.

## Innovative approaches (text-queried separation, query-by-text detection)

### Takeaway
AudioSep (MIT code) does open-vocabulary, text-queried separation ("harmonium", "tabla"). It is the only practical way to try instrument-specific stems for non-Western instruments. Expect lower quality than dedicated stem models. CLAP gives matching query-by-text detection.

### Cited Findings
- AudioSep is a foundation model for open-domain separation from natural-language queries. It shows zero-shot generalisation on audio events, musical instruments and speech enhancement. It uses a CLAP/CLIP text encoder with FiLM conditioning on a ResUNet. The arXiv paper was revised Dec 2024. — [arXiv 2308.05037](https://arxiv.org/abs/2308.05037); [Unite.ai summary](https://www.unite.ai/audiosep-separate-anything-you-describe/)
- AudioSep code is MIT. The checkpoint `audiosep_base_4M_steps.ckpt` is hosted in the HF Space, at 32 kHz with a 2048 window and 320 hop. It was used in DCASE 2024 Task 9 (language-queried audio source separation). — [Audio-AGI/AudioSep README](https://github.com/Audio-AGI/AudioSep)
- CLAP (LAION) supports text-audio retrieval and zero-shot classification with Apache-2.0 HF weights. — [HF laion/larger_clap_music](https://huggingface.co/laion/larger_clap_music)
- Newer MSS research includes iterative MIMO separation with mixture consistency (arXiv 2609.07226) and music source restoration with BS-RoFormer + HiFi++ GAN (arXiv 2603.04032). — [arXiv 2609.07226](https://arxiv.org/pdf/2609.07226); [arXiv 2603.04032](https://arxiv.org/pdf/2603.04032)

### Inferences
- A useful pattern: RoFormer for vocals, htdemucs/SCNet for drums/bass, then AudioSep on the "other" stem with queries like "harmonium" and "sitar". Check each result with CLAP similarity before showing it.
- For tabla/dholak, AudioSep on the drums stem may separate them from the claps. This is untested.

### Gaps
- AudioSep's MUSIC-dataset SDRi numbers, checkpoint size and weight licence were not retrieved. Only the code licence (MIT) is verified.
- I did not research other 2025-2026 language-queried separation systems (DCASE 2024/2025 Task 9 winners, FlowSep, etc.).
