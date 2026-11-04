# src/ layers

The Vue app is the player: `index.html` mounts `main.ts`. The original single-page player is kept at
`legacy/original-player.html`; it uses the same `core/` audio engine, listening log, media clock and
waveform peaks, and the same Dexie database.

| Folder | What lives here | May import |
|---|---|---|
| `core/` | Framework-free TypeScript: audio engine, listening log, loop / preview controller, waveform peaks (legacy page only; the Vue app uses wavesurfer.js), moment rules (`moments.ts`), DNA traits and ring geometry (`dna.ts`), Discover grouping and ratings (`discover.ts`), Feature-analysis rows (`diagnostics.ts`), track sources, Dexie wrappers (`repository.ts`). Unit-tested in `tests/core.test.mjs`. No Vue. | `data/`, `intelligence/`, `services/` |
| `stores/` | Pinia, one store per domain: `playback` (track, time, selection, loop — the only playback state), `library` (import, delete, analysis, streams), `moments` (save, edit, correct, play, play all), `momentFlow` (save → ask → describe flow), `listening` (event log, Learning switch, clear history, export), `intelligence` (analyses, suggestions, ratings, attention hints), `diagnostics` (Feature analysis), `ui` (toasts). | `core/` |
| `composables/` | DOM and lifecycle glue: `useAudioEngine` (the single engine instance), `useMediaClock` (rAF playhead), `useWaveform` (binds the wavesurfer.js waveform in `ui/Waveform.vue` to the stores), `useKeyboardShortcuts`, `useAppBootstrap`. | `stores/`, `core/` |
| `ui/` | Design-system components, one per `reference/music-dna/design-system/components/*` (Button, Chip, Toast, NavItem, Waveform, SelectionToolbar, DescribeStrip, AskRow, PlaybackBar, MomentRow, TraitRing, TraitRow, Cover) plus Icon, Switch and Tabs. Props in, events out, tokens only. | nothing app-specific |
| `features/<screen>/` | Screens composed from `ui/` + stores: now-playing, library (with "Add from a link"), moments, discover, dna, settings, admin (Feature analysis), shell. | `stores/`, `composables/`, `ui/`, `core/` pure functions |
| `router/` | vue-router, hash history, one route per screen. | `features/` |
| `data/`, `intelligence/`, `services/` | Existing modules: Dexie schema and types, preference model, local service clients. | — |

Dependency direction: `core` ← `stores` ← `composables` / `features` ← `router` / `App.vue`.
`ui/` depends only on its props and `tokens.css`. Components never touch Dexie or the engine
directly; they call store actions.

Rules: one audio engine app-wide; every timestamp comes from the media clock
(`core/listening.ts` `readMediaTime`); every SYNC FIX / DELAY FIX keeps its comment and example.
