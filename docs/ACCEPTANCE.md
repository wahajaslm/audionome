# Music DNA M3.1 — Acceptance checklist

## A. Original interface — must not regress
- [ ] Compare live player with `reference/music-dna/player/index.html`: layout, typography, muted sea-glass accent, waveform bar geometry, bottom playback bar, and contextual floating selection toolbar match.
- [ ] Compare **My Music DNA**: original circular ring, percentage labels, trait chips, explanatory portrait, expandable trait rows and hearing evidence all remain visible.
- [ ] Test desktop and narrow/mobile viewport; original responsive sidebar/bottom-navigation behavior remains.
- [ ] Technical Python analysis charts do **not** clutter the listening screen or DNA portrait.

## B. Player & storage
- [ ] Original WAV demo starts, pauses, seeks and moves the playhead with actual audio.
- [ ] Import a supported real song; select passage by dragging, save, describe and loop it.
- [ ] Reopen the page; library, saved moments, emotions and labels persist.
- [ ] A saved passage from another song actually opens the correct recording and time range.
- [ ] Play My Moments collection; the selected passages play back-to-back.
- [ ] Feedback can be given even while passive listening-event collection is paused.

## C. Personal intelligence — no fabricated observations
- [ ] Initial Music DNA ring is empty/neutral, with all groups at 0% and no invented artists or emotions.
- [ ] Save a moment and select `Vocals`; vocal trait appears with a linked playable passage and accurately counted evidence.
- [ ] Click `Correct` beside a moment's trait; the specific association disappears and remains corrected after reload.
- [ ] Enable Learning on My Music DNA, seek back to the same segment twice; attention candidate can appear. Never label it a confirmed favorite automatically.
- [ ] Optional local Python analysis of rights-cleared tracks enables suggestions only when there is real analytical evidence.
- [ ] Rate a suggested passage `I like it` or `Not for me`; the ranking updates and the rating persists.
- [ ] Export profile JSON; metadata/ratings included, original music audio excluded.

## D. Research and legal boundaries
- [ ] Python `musicdna.experiments.acoustic_explorer` exports actual librosa feature CSV/JSON/plots from a local recording.
- [ ] No Spotify/Apple/YouTube audio is scraped or analyzed under a playback-only right.
- [ ] Optional pretrained deep encoder cannot silently download weights; DSP and neural model IDs never mix.

## Verification
- **Verified here:** five original-UI/source checks, five TypeScript preference-model tests, four Python analysis tests, JavaScript module syntax, and Python local research CLI.
- **Not verified here:** complete `npm run build`, Vite runtime, real browser audio gestures and IndexedDB persistence after page reload. These need local validation.
