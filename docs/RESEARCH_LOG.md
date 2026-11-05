# Research log

One line per finished step. Newest at the bottom. Details and plots live in the notebook named.

## Base model: which moments do people replay? (`notebooks/02_base_model.ipynb`)

Research only: YouTube replay data is not cleared for a product model.

### Main hypothesis (set 2026-11-05)

> In Eastern music (subcontinent classical, Indian and Pakistani film and pop, Coke Studio fusion, Arabic and Turkish), the moments listeners return to are better predicted by features outside Western theory than by Western features alone. In Western music, those features add little.

- **Western features:** DSP (12-note chroma, loudness, brightness) and CLAP embeddings.
- **Eastern features, for voice and instruments alike:**
  - **Pitch:** tonic-relative pitch and microtones (shruti, maqam quarter tones), measured on the voice and on melodic instruments (sitar, sarangi, bansuri, harmonium, oud, ney, violin).
  - **Ornaments:** glides and ornaments (meend, gamak, Arabic and Turkish ornaments).
  - **Drone:** presence and stability.
  - **Percussion:** density and cycle patterns (tabla, dholak, darbuka, riq).
  - **Instrument usage:** which instruments play when, solo vs. ensemble, and voice-instrument call and response.
  - **Tempo arc:** how the tempo changes over the piece.
- **Test:** the same model trained with Western features only, then with Eastern features added. Results are scored separately on Eastern and Western songs. The hypothesis holds only if the Eastern features help on Eastern songs and add little on Western songs.
- **Bar to clear:** generic loudness, brightness and roughness peaks predicted chills in Western, Chinese and Hindustani music alike (Beier et al. 2022). The Eastern features must add value beyond those.
- **Not measured directly:** "spiritual connection". Proxies: replays, saves, and the player's feeling tags (*Chills*, *Calm*).
- **Needs:** stems (about 10 GB free disk). Instrument pitch needs the "other" stem, since Demucs puts sitar, oud and similar instruments there, plus a check that pitch tracking works on it.
- **Corpus gaps:** a Coke Studio group, subcontinent classical, Arabic classical. Studio recordings only, no live uploads.

### Do CLAP or MERT already capture it? (planned 2026-11-05)

- **Test 1, in Steps 4-5:** on Eastern songs, compare CLAP alone vs. CLAP + Eastern features, and MERT alone vs. MERT + Eastern features. If adding the features gives no gain, the embedding already captures them.
- **Test 2, in Step 2, a linear probe:** predict each Eastern feature (instrument_offgrid, drone_strength, glides, percussion onset rate) from CLAP numbers alone, then from MERT numbers alone, on held-out songs.
  - High R² means the embedding already encodes that feature.
  - Low R² means the feature adds information the embedding lacks.
- **Why MERT may differ:** it was pretrained partly to reconstruct a CQT, a fine-pitch spectrogram. It is research-only (CC BY-NC weights), so it needs a MERT pass over the corpus.

### Main test plan (fixed 2026-11-05, before the main test was run)

Everything below is fixed before `full` or `western` is run with the Eastern features. Nothing here changes after seeing results.

**Hypotheses**
- **H1 (Eastern gain):** on Eastern songs, `full` scores higher than `western`.
  - Eastern songs: Bollywood, Punjabi, qawwali/Sufi, Pakistani pop, Arabic pop, Turkish pop.
  - `full` = tonic-aligned 20-cent CQT + DSP + spatial + vocal + intonation + intonation profile + Eastern ensemble + CLAP.
  - `western` = semitone CQT + DSP + spatial + CLAP.
- **H2 (asymmetry):** the gain (`full` − `western`) on Eastern songs is larger than on Western songs (pop, rock, hip-hop, jazz, R&B).
- House is reported but not part of H2. East Asian (K-pop) is excluded.

**Metric**
- Song-averaged pairwise accuracy on clear within-song pairs (residual-replay gap > 0.1).
- The position prior is fitted on training songs only.
- Each song's score is averaged over 5 seeds (0–4).

**Fixed settings**
- `moment_model.py` as of this entry: epochs 30, patience 6, lr 3e-4, width 128, branch dropout 0.25.
- Windows 12 s, hop 6 s.
- CLEAR_GAP 0.1.

**Where it is decided**
- **Main set (92 songs):** 5 artist-grouped folds. This is *exploratory*, because the design was shaped on these songs.
- **Confirmation set (`genre_mix_confirm`):** fresh songs, none from the main set. Train on all main-set songs, score **once** on the confirmation songs: `--corpus genre_mix --test-corpus genre_mix_confirm --seeds 5`.

**Decision rule (confirmation set only)**
- H1 is supported if the 95% bootstrap interval (over songs) of the paired difference `full` − `western` on Eastern songs lies above 0.
- H2 is supported if the 95% bootstrap interval of (Eastern difference − Western difference) lies above 0.
- Otherwise the result is "not supported". It is reported either way.

**Feature gate**
- Before the main run, the fixed `drone_strength` and `instrument_offgrid` must pass the Step 2 region check: higher medians in Eastern than in house songs.
- That check uses only feature distributions, not replay results.
- If either fails, it is dropped from `full`, and the drop is logged before the main run.

**Secondary (exploratory, no decision attached)**
- CultureMERT and MERT as the embedding.
- Ablations: no CNN, no hand-built features, no embedding.
- Permutation importance and per-genre results.

### Literature check (2026-11-05, every citation opened and checked)

**Already done, not ours to claim:**
- **Replay curves as highlight labels, for video.** Mr. HiSum (Sul, Han, Lee; NeurIPS 2023 D&B).
  - 31,892 YouTube-8M videos.
  - Metrics: F1 at a 15% length budget, and mAP for the top 50% and top 15% of segments.
  - https://proceedings.neurips.cc/paper_files/paper/2023/file/7f880e3a325b06e3601af1384a653038-Paper-Datasets_and_Benchmarks.pdf
- **Moment-level favourite passages.** FAV corpus (Lustig & Temperley; ISMIR 2023).
  - 140 Rochester students (about 85% music majors), 420 excerpts.
  - Energy gain cited 14x more than energy loss.
  - "Simplicity" cited 3x more than "complexity" (not "simple motifs").
  - https://archives.ismir.net/ismir2023/paper/000039.pdf
- **Music highlights learned from emotion labels.** Pop Music Highlighter (Huang, Chou, Yang; TISMIR 2018). No human highlight labels; evaluated against chorus overlap. https://arxiv.org/abs/1802.10495
- **Structure and chorus detection, all Western-trained:**
  - DeepChorus (ICASSP 2022).
  - allin1 (Kim & Nam; WASPAA 2023). Code MIT; weights trained on Harmonix, with no weights licence stated.
  - SongFormer (ASLP@NPU; arXiv 2510.02797).
- **Eastern music analysed on its own terms.** CompMusic (Serra, UPF, 2011–2017): Hindustani, Carnatic, Turkish makam, Arab-Andalusian and Beijing opera, covering tonic, intonation and raga recognition. https://compmusic.upf.edu/
- **Raga intervals predict emotion ratings.**
  - Mathur et al., Frontiers 2015.
  - Midya et al., PLOS ONE 2019: tonality drove Indian listeners' ratings, rhythm drove non-Indian listeners'.
- **Foundation models degrade on non-Western music.**
  - Papaioannou et al., ISMIR 2025.
  - CultureMERT, ISMIR 2025: CLAP-Music ROC-AUC falls from 80% on MagnaTagATune to 61% on Carnatic.
- **Warning on replay labels.** Sahu & Pandey (arXiv 2607.01400, 2026) call some music replay peaks an "onset-replay artifact".

**Not found anywhere, so this is the gap:**
- No study combines moment-level labels, listener behaviour, microtonal and ornament features, and an Eastern-vs-Western asymmetry test.
- No highlight detection on Indian, Arabic or Turkish music.
- No study links meend or gamak features to listener preference.

**Main counter-evidence:** Beier, Janata, Hulbert, Ferreira 2022. Chills followed the same generic acoustic peaks in all three styles tested.

### Steps

- **2026-11-05 · Step 1 Data · PASS.** 120 songs in 15 genres; 92 have a "Most replayed" curve (weakest genre: Arabic pop, 4/8). Low-view tiers often lack curves (low 18/30, underrated 16/30). 62% of peaks fall in the first 40% of a song, so Step 2 must separate real musical peaks from viewers dropping off over time.
- **2026-11-05 · Step 2 Explore · WEAK PASS.** 91 songs, 4,166 windows (12 s, 6 s hop). Position alone explains a median 70% of within-song replay variation: replay rises, peaks at 30-50% of the song, then falls, in every region. After removing position, simple sound features line up only weakly: brightness ρ = +0.14 [+0.03, +0.21], onset activity +0.12, loudness +0.09 (CI touches 0). Eastern songs show the clearest link (brightness +0.17 [+0.08, +0.42]); house shows none. In 47% of clear pairs the more replayed window is the quieter one, so loudness alone cannot win.

### Eastern feature survey (2026-11-05)

Sources were found by a literature search agent and are linked in the session notes. Items dated 2026 (MaqamNet, the Saba/ney study) were not checked by hand.

**Already covered:**
- Tonic, tonic-relative pitch profile (24 bins), held-note offsets, glides, vibrato and ornament counts.
- Roughness, build-up, drone, tempo, drum and other stem activity, instrument off-grid energy, solo time, voice-instrument alternation.

**Top 10 to add, ranked by value and feasibility:**
1. Nyas / landmark notes: long, stable phrase-ending notes. From the existing pitch contour. (Gulati et al., ICMC-SMC 2014)
2. Phrase recurrence: repeats of the tonic-relative contour, which act as hooks. (Gulati et al., ICASSP 2016)
3. Sam arrival: distance to the cycle downbeat, plus tihai and cadence landings. (Srinivasamurthy, ISMIR 2017)
4. Svara peak shape: width and skew per note, not just the offset. (Koduri et al., ISMIR 2012, JNMR 2014)
5. Ornament types: kan, murki, andolan and meend, instead of plain counts. (arXiv 2505.04419; ROD dataset)
6. Rhythmic density jumps and laya changes: rhythmogram novelty. (Vinutha et al., ISMIR 2016; Clayton, MTO 2020)
7. Heterophony: lag and pitch correlation between the voice and the other-stem melody (sarangi, harmonium, violin shadowing the singer). (Plaja-Roglans et al., TISMIR 2023)
8. Tabla stroke mix: damped vs. resonant, bass vs. treble, on the drum stem. (Rohit et al., TISMIR 2023)
9. Maqam and jins fit per window, plus modulation events, on a 53-TET grid. (Bozkurt, JNMR 2008; MaqamNet)
10. Unmetered-to-metered boundary: alap to gat, taqsim to usul, from pulse clarity. (Rao et al., TISMIR 2021)

**Gaps found in the literature:**
- No darbuka/riq stroke recognition.
- Weak Indian instrument recognition.
- No taqsim vs. metered detection.
- No study links any of these features to replays or chills at the moment level.

**Licences:**
- Essentia and compIAM are AGPL-3.0.
- MTG pretrained models and Saraga are non-commercial.
- Both are fine for research. A product needs legal review.
- **2026-11-05 · Interim model (no CNN, Western features only: DSP + spatial + CLAP).** 92 songs, 5 artist-grouped folds, pairwise accuracy on clear within-song pairs (random ≈ 0.50):
  - **All songs:** model 0.606 [0.563, 0.647] vs. best simple rule (brightest window) 0.582.
  - **Western:** 0.626 vs. 0.566. **House:** 0.649 vs. 0.536.
  - **Eastern:** **0.571, below the brightness rule (0.615).**
  - Western features help on Western and house songs but not on Eastern songs. That points the way the hypothesis predicts. It is not proof: the confidence intervals overlap, and there are only 41 Eastern songs.
  - Top-1 hit (picking the most replayed window within ±6 s) is about 0.12–0.16 for every method, near random.
- **2026-11-05 · What the interim model relied on (permutation importance).** Each block's values were shuffled across a song's windows (5 repeats per song), and the drop in pairwise accuracy was measured:
  - **CLAP: drop +0.036 [+0.010, +0.061].** By region: Eastern +0.041, Western +0.017, house +0.058.
  - **Every DSP block and stereo: drop of 0.005 or less,** i.e. unused. That includes loudness, brightness and onsets, chroma, and MFCC.
  - **The model relies almost only on CLAP.** It ignores brightness, even though "brightest window" alone scores 0.615 on Eastern songs. So the 12 hand-built scalars are drowned out by CLAP's 512 dimensions. The full model should give the hand-built groups their own branch or pre-scaling, and Step 6 should test that.

### CultureMERT: what it already covers (checked 2026-11-05)

- **Base:** MERT-v1-95M, given continued masked pretraining on 650 hours:
  - Hindustani: 200 h.
  - Carnatic: 200 h.
  - Turkish makam: 200 h.
  - Greek Lyra: 50 h.
  - Sources: the CompMusic corpora and Lyra. https://arxiv.org/html/2506.17818
- **Classical only.** No Bollywood or film music, Pakistani pop, Coke Studio, Punjabi or Arabic.
- **Gains over MERT (tagging, ROC-AUC):** Hindustani 82.4 → 88.2, Carnatic 74.9 → 79.2.
- **Licence:** CC BY-NC 4.0, research only. https://huggingface.co/ntua-slp/CultureMERT-95M
- **Plan:**
  1. Test CultureMERT as-is first, as one more embedding row alongside CLAP and MERT.
  2. Continue its pretraining on Coke Studio, film, pop, Punjabi and Arabic only if it falls short on those songs.
- **2026-11-05 · CLAP vs. CultureMERT (no CNN; DSP + spatial + one embedding).** Same folds, pairwise accuracy:
  - **Overall there is no difference.** Paired CultureMERT − CLAP: all +0.001 [−0.025, +0.026], Eastern +0.004 [−0.038, +0.049]. Its classical-music pretraining (Hindustani, Carnatic, makam) does not carry over to our film, pop and fusion songs.
  - **Subcontinent + Arabic songs (28: Bollywood, Punjabi, qawwali/Sufi, Pakistani pop, Arabic pop):** the brightness rule scores 0.666, CLAP model 0.602, CultureMERT model 0.587. The learned models lose to a one-feature rule.
    - Pakistani pop: rule 0.68 vs. 0.49 / 0.42.
    - Bollywood: 0.63 vs. 0.54 / 0.53.
  - **Western and house:** the learned models beat the rule clearly. House 0.54 → 0.68 / 0.67; jazz 0.51 → 0.67 / 0.64.
  - **K-pop scored below random for every method** (0.42–0.46). It had been grouped as "eastern". It is now its own region, `east_asian`, to match the research's Eastern scope (subcontinent, Arabic, Turkish).
  - **Caveat:** 4–8 songs per genre, so per-genre numbers are noisy.
  - **Reading:** general and classical-trained embeddings, averaged over 12 s, miss what drives replays in subcontinent and Arabic popular music, while simple brightness catches part of it. That is the case for the hand-built Eastern features and the fine-pitch CNN. Next: give the hand-built features their own branch and per-song scaling, so the model cannot ignore them.
- **2026-11-05 · Fix: separate branches + per-song scaling + modality dropout (CLAP, no CNN).** Same folds. "Eastern" now excludes K-pop; the old run recomputed the same way gives Eastern 0.597.
  - **Overall:** 0.606 → **0.619**. **Western:** 0.626 → **0.657**. **Eastern:** 0.597 → **0.606**, still below the brightness rule (0.656).
  - **The model now uses the hand-built features.** Shuffling loudness, brightness and onsets costs +0.025 on Eastern songs (was +0.005), and MFCC +0.014. CLAP still matters most on Eastern songs (+0.032).
  - **K-pop (8 songs) is below random for every method,** around 0.40–0.45. Its replay peaks may follow visuals or choreography, not sound.
- **2026-11-05 · Step 2 check of the Eastern ensemble features: PARTLY FAILED.** Medians of the 120 songs' per-song medians, by region and genre:
  - **instrument_offgrid is highest in tech house** (0.164), with Bollywood at 0.046 and Pakistani pop at 0.048. **drone_strength is highest in house** (0.507 vs. Eastern 0.281). So these two catch detuned synths and sustained pads, not raga or maqam practice. Modern film and pop instrumentation is mostly tuned to 12-TET (keyboards, pitch correction); its microtones sit mainly in the voice.
  - **Sensible:** percussion share (house 0.83), instrument solo time (house 0.37 vs. under 0.10 elsewhere), tempo, build-up and roughness.
  - **Decision:** these two are not used in the hypothesis test until fixed.
    - Microtones: measure them on the voice relative to Sa (intonation stage). For instruments, require stable off-grid scale degrees rather than detuned spread.
    - Drone: require the sustained pitch class to be Sa or Pa.
- **2026-11-05 · CLAP vs. MERT vs. CultureMERT with the fixed model** (separate branches, per-song scaling; no CNN; DSP + spatial + one embedding). Pairwise accuracy:
  - **Eastern** (34 songs): CLAP 0.606, MERT 0.624, **CultureMERT 0.639**. Brightness rule 0.656.
  - **Western** (31): **CLAP 0.657**, MERT 0.651, CultureMERT 0.634.
  - **House** (19): 0.645 / 0.635 / 0.658.
  - **Paired difference, CultureMERT − CLAP:**
    - Eastern +0.033 [−0.005, +0.070].
    - Western −0.023 [−0.055, +0.007].
  - **Reading:** the asymmetry the hypothesis predicts. The encoder adapted to Indian classical and makam music helps on Eastern songs and costs a little on Western ones. Both intervals just touch 0, so this is suggestive, not established. Every model is still at or below the brightness rule on Eastern songs.
  - **Note:** with the old single-branch model, CultureMERT showed no gain (Eastern +0.004). So the per-song scaling fix was needed to see it.
