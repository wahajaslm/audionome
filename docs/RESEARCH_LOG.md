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
