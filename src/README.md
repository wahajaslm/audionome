# src/ layers

The Vue app is being migrated to become the real player (phase 1 of 3: shared core + Now playing).
`index.html` is still the live entry point; it already uses `core/` for the audio engine,
listening log, media clock and waveform peaks.

| Folder | What lives here | May import |
|---|---|---|
| `core/` | Framework-free TypeScript: audio engine, listening log, loop / preview controller, waveform peaks, moment rules, track sources, Dexie wrappers (`repository.ts`). Unit-tested in `tests/core.test.mjs`. No Vue. | `data/`, `intelligence/`, `services/` |
| `stores/` | Pinia, one store per domain: `playback` (track, time, selection, loop — the only playback state), `library`, `moments`, `momentFlow` (save → ask → describe flow), `listening` (event log, Learning switch), `intelligence` (analyses, attention hints), `ui` (toasts). | `core/` |
| `composables/` | DOM and lifecycle glue: `useAudioEngine` (the single engine instance), `useMediaClock` (rAF playhead), `useWaveform`, `useKeyboardShortcuts`, `useAppBootstrap`. | `stores/`, `core/` |
| `ui/` | Design-system components, one per `reference/music-dna/design-system/components/*` (Button, Chip, Toast, NavItem, Waveform, SelectionToolbar, DescribeStrip, AskRow, PlaybackBar, MomentRow, Cover) plus Icon and ProgressRail. Props in, events out, tokens only. | nothing app-specific |
| `features/<screen>/` | Screens composed from `ui/` + stores. `now-playing` is fully ported; others follow in phase 2. | `stores/`, `composables/`, `ui/`, `core/` constants |
| `router/` | vue-router, hash history, one route per screen. | `features/` |
| `data/`, `intelligence/`, `services/` | Existing modules: Dexie schema and types, preference model, local service clients. | — |

Dependency direction: `core` ← `stores` ← `composables` / `features` ← `router` / `App.vue`.
`ui/` depends only on its props and `tokens.css`. Components never touch Dexie or the engine
directly; they call store actions.

Rules: one audio engine app-wide; every timestamp comes from the media clock
(`core/listening.ts` `readMediaTime`); every SYNC FIX / DELAY FIX keeps its comment and example.
