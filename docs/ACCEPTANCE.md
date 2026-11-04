# Music DNA M3.1 — Acceptance checklist

## A. Interface — Vue player
- [ ] `/` is the Vue player and follows the design system (`reference/music-dna/design-system/`): tokens only, one accent for chosen moments, open lists, no cards.
- [ ] **My Music DNA**: TraitRing with percentage labels (tabs below 700px), portrait sentence, TraitRow list with expandable, playable evidence.
- [ ] Desktop sidebar (five places + Collections + Settings / Feature analysis) and the phone bottom tab bar (< 820px); no horizontal scroll at 390px.
- [ ] Technical analysis stays on Feature analysis and the research studio, not on the listening screen or DNA portrait.

## B. Player & storage
- [ ] Original WAV demo starts, pauses, seeks and moves the playhead with actual audio.
- [ ] Import a supported real song; select passage by dragging, save, describe and loop it.
- [ ] Reopen the page; library, saved moments, emotions and labels persist.
- [ ] A saved passage from another song actually opens the correct recording and time range.
- [ ] Play My Moments collection; the selected passages play back-to-back.
- [ ] Edit a moment's tags and note in My Moments; the change shows in My Music DNA.
- [ ] Delete an imported song in Library; its moments go too, after an in-place confirmation.
- [ ] Settings: Learning, automatic analysis and volume persist after reload; Clear history empties the event log.
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
- **Automated:** `npm test` (source checks for the Vue app, core unit tests), `npm run test:model`, `vue-tsc` + `npm run build`.
- **End to end (Playwright, Chromium, 1440×900 and 390×844, service stubbed with 503):** every route renders without console errors; WAV import, play, select, loop, save, ask; moment in My Moments and DNA; edit, collection playback, Correct after reload; Discover like/dislike written to `ratings`; Settings toggles and volume persist after reload; export downloads `music-dna-profile.json`; delete song.
- **Not verified here:** analysis with the real Python service running, and stream import (both need the service).
