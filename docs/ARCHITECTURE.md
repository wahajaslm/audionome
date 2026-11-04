# Architecture — Original visual interface, independent intelligence

The actual live `index.html` is a lightly adapted version of the user's original `reference/music-dna/player/index.html`. Its entire original CSS is unchanged. It retains its DOM structure, navigation and rendering of waveform selection, feedback, moments, Discover and the radial My Music DNA portrait.

**Playback:** `wavesurfer.js` provides real media timeline/playback. The visible waveform uses peaks derived from the decoded audio while retaining the original bar styling and region/toolbar interactions. No duplicate React player exists.

**Storage:** Dexie (`src/data/db.ts`) stores recordings, song metadata, user-created moments/labels/notes, opt-in listening events, ratings and versioned analysis vectors in IndexedDB. Data is local by default.

**Product intelligence:** `src/intelligence/personalize.ts` supplies candidate detection and a baseline personalized ranker. Listening events are **attention signals**, and only confirmed/saved/rated passages become preference labels. The My DNA circular ring reflects explicitly selected *musical qualities*, not speculative emotions or raw embedding scores.

**Research boundary:** All Python lives in the `musicdna` package (see `musicdna/README.md`): `audio` and `features` analyse recordings, `preference` learns from listening, `corpus` and `experiments` hold research data and studies, and `service` is the localhost API the player calls. The player displays only listener-relevant insight text and playable evidence. Local rights confirmation is required before analyzing imported music.

**Limitations:** This is an early local-first consumer prototype. Music rights and license conditions still apply, preference predictions have not been clinically or scientifically validated, and full Vite/browser E2E operation is pending verification.
