# Architecture — Vue player on a shared, framework-free core

**Entry:** `index.html` mounts the Vue 3 app (`src/main.ts`): Pinia stores, hash router, one screen per route (Now playing, Library, My Moments, Discover, My Music DNA, Settings, Feature analysis). Styling uses only the design-system tokens (`src/tokens.css` = `reference/music-dna/design-system/tokens.css`) and its components, implemented in `src/ui/` (Waveform, SelectionToolbar, AskRow, DescribeStrip, PlaybackBar, Chip, Button, NavItem, Toast, TraitRing, TraitRow, MomentRow, Cover, plus Switch and Tabs).

**Layers** (see `src/README.md`): `core/` (no Vue: audio engine, listening log, loop/preview controller, peaks, moment / DNA / Discover / diagnostics rules, Dexie wrappers) ← `stores/` (Pinia, one per domain) ← `features/` and `composables/` ← `router/`, `App.vue`. Components never touch Dexie or the engine; they call store actions, which call `core/`.

**Legacy player:** the original single-page player lives at `legacy/original-player.html` with its exact CSS. It imports the same `src/core` engine, listening log and peaks, and the same Dexie schema, so it still plays and shares data with the Vue app. It is built as a second Vite page.

**Playback:** one `NativeAudioEngine` (HTML5 audio) for the whole app. Every timestamp comes from the media clock (`readMediaTime`). Each SYNC FIX / DELAY FIX is explained with an example where it lives in `src/core` or the stores.

**Storage:** Dexie (`src/data/db.ts`, database `music-dna-v1`) stores recordings, user-created moments/labels/notes, opt-in listening events, ratings, settings and versioned analysis vectors in IndexedDB. Data is local by default; the profile export omits audio.

**Product intelligence:** `src/intelligence/personalize.ts` supplies attention candidates and the personal ranker. Listening events are **attention signals**; only saved, confirmed or rated passages become preference labels. The DNA ring reflects explicitly selected *musical qualities*, not emotions or embedding scores.

**Research boundary:** all Python lives in `musicdna/`; `musicdna.service` is the localhost API (127.0.0.1:8765) the player calls for analysis, streams and diagnostics. Every call fails soft when the service is off. Local rights confirmation is required before analysing imported music unless automatic analysis was switched on.

**Limitations:** early local-first prototype. Music rights still apply; preference predictions are not scientifically validated.
