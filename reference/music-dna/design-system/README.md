# Music DNA

A minimal music player that learns which musical moments matter to you. Quiet when you listen, precise when you explore, personal when you are curious.

This system describes the player as designed in the Music DNA prototype: one dark theme, one accent, the system font, and a small set of components built around the waveform. Build the real player on these tokens and patterns; every value here is taken from the prototype.

## Principles

1. **Listening comes first.** The default screen is a song, a waveform and the controls. Everything else appears only when the listener selects something or asks.
2. **One accent, one meaning.** `accent` (#8ec5b8) means *a moment you chose*: a selected passage, a saved moment, a confirmed trait. It is never decoration, never a button colour, never a heading colour.
3. **Seamless, not boxed.** Pages are open lists separated by `line` hairlines. Only floating things get a surface (`bg-panel`) and a border: the selection toolbar, the ask row, the describe strip, the toast. If you are about to draw a card, use a row instead.
4. **Soft, not harsh.** Text is `ink` (#dcdce0), never pure white. Selected chips use a soft fill (`chip-on`), not a white block. The play ring is a 1px line at half strength.
5. **Ask little, ask in place.** Questions appear in one row directly under the waveform, never as a modal, and never stop playback. One tap answers; "More…" opens detail; "Skip" always exists.
6. **Signals, not conclusions.** Anything the AI infers is phrased as a hint ("You often come back to this part") and can be confirmed, corrected or removed.

## Colour

Dark theme only. Lightness, not hue, separates levels:

| Role | Token | Use |
|---|---|---|
| Ground | `bg` | page, player |
| Sunken | `bg-side` | sidebar, tab bar |
| Floating | `bg-panel` | toolbar, ask row, strip, toast |
| Hover | `bg-raise` | hovered and current nav, icon buttons |
| Hairline | `line` | row dividers |
| Border | `line-strong` | chips, outline buttons, panels, inputs |
| Text | `ink` › `ink-sub` › `ink-mute` | primary › secondary › captions |
| Moment | `accent` (+ `accent-saved`, `accent-fill`, `accent-line`) | chosen passages only |

`ink-mute` is the lightest text colour allowed (5.2:1 on `bg`). `wave-off` is for graphics only.

## Type

The system font stack (`--font-sans`): San Francisco on Apple, Segoe UI on Windows, Roboto on Android. No web fonts, no thin display faces. Weights are 300 (numeral, portrait), 400 (almost everything) and 500 (section headings, primary buttons). Use `tabular-nums` everywhere times appear.

Scale: `numeral` 52 · `page-title` 30 · `portrait` / `track-title` 26 · `heading` 18 · `item` 16 · `body` 15 · `label` 13 · `caption` 12. Nothing below 12px.

## Space and shape

4px base: `space-1` 4 … `space-8` 64. Rows use 14–16px vertical padding. The content column is centred and at most `content-max` (1000px) wide.

Radii follow the object: bars and ticks `radius-xs`, square chips and inputs `radius-sm`, floating panels `radius-md`, round chips, tabs, buttons and the play ring `radius-pill`. One shadow exists (`shadow-pop`) for the toolbar and toast.

## Layout

- **Shell.** Desktop: a `sidebar-width` (244px) sidebar on `bg-side` with Now playing, Library, My Moments, Discover, My Music DNA, then Collections. Below `breakpoint-tabs` (820px) the sidebar becomes a five-item bottom tab bar (Playing · Library · Moments · Discover · DNA).
- **Now playing.** Centred column, top to bottom: step strip and guide line → cover (96px disc) + title + artist → waveform → selection toolbar → ask row / describe strip → playback bar in the lower part of the screen. The playback bar is seamless (no frame) and sticky at the bottom when content grows.
- **Other pages.** Page title, one lead line, then open lists. When away from the player, a mini player sits at the bottom of the sidebar (desktop) or above the tabs (phone).

## The moment flow

The core interaction, always in this order and always in place under the waveform:

1. **Listen.** Playback never stops for any of the steps below.
2. **Select.** Drag across the waveform. Selected bars turn `accent`, a selection band appears, and the **selection toolbar** opens directly below the selected passage: range · Save · Loop · ✕.
3. **What stood out?** After Save, the **ask row** appears in the same place: one question, five one-tap answers (Vocals, Melody, Instruments, Rhythm, Build-up), More…, Skip.
4. **More…** expands the ask row into the **describe strip**: three rows (Feels · Love · Note), each one line high and scrolling sideways if needed, with Not now / Done.
5. **Saved.** The moment shows as `accent-saved` bars and an `accent` dot under the waveform, a toast confirms, and it appears in My Moments and feeds My Music DNA.

The same ask row is reused when the player notices repeated replays ("You keep coming back to 2:31. What is it?"). There is never a second way to describe a moment.

## Iconography

Line icons on a 24px grid, 1.5px stroke, round caps and joins, `currentColor`. Filled only for transport glyphs (play, pause, previous, next). Set used: wave (Now playing), library, heart (save / My Moments), compass (Discover), DNA helix, previous, play, pause, next, loop, sparkle (questions), volume, close, back, lock (on-device). No emoji anywhere.

## Voice

Plain, warm, second person, short. Name things by what listeners recognise ("moments", "what stood out"), not by the system ("signals pipeline", "embedding"). Inferences are hedged ("may feel like", "you often come back to"). Buttons say exactly what happens: Save, Loop, Skip, Done, Yes / Not really. Sample data is always labelled ("Illustrative, not real predictions").

## Motion

Short and functional: 200 ms for the toolbar opening, 280 ms ease for the ask/describe slot expanding (grid rows 0fr → 1fr), 150 ms for chip state. Respect `prefers-reduced-motion` by removing the slot transition. Nothing loops, pulses or animates on its own.

## Accessibility

- Every control is a real `<button>`, `<input>` or link, at least `hit-target` (44px) on touch.
- The waveform is a `role="slider"` with arrow keys (±5 s) and Enter to select ±10 s around the playhead.
- Pressed chips and toggles use `aria-pressed`; tabs use `aria-selected`; the learning switch is `role="switch"`.
- Focus ring: 1px `ink` outline, 2px offset.

## Components

Waveform · SelectionToolbar · AskRow · DescribeStrip · PlaybackBar · Chip · Button · NavItem · Toast · TraitRing · TraitRow · MomentRow. Each has a preview and guidelines in this system. They are plain HTML and CSS on the tokens; there is no component bundle yet, so implement them in your framework from the previews.
