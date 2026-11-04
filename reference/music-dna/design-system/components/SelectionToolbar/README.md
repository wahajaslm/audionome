# SelectionToolbar

The small floating bar that appears directly under a selected passage with exactly three actions: Save, Loop, Clear.

- Position: in the flow below the waveform (its container grows 0 → 58px in 200 ms), horizontally centred on the selection and clamped to the waveform's edges.
- Surface: `bg-panel`, `line-strong` border, `radius-md`, `shadow-pop`. Height 44px; buttons 36px, `radius-sm`, hover `bg-raise`.
- Contents in order: the range (`label`, `ink-sub`, hairline after it) · Save · Loop (toggle, `aria-pressed`, pressed = `accent` text) · ✕ clear.
- Never add Describe here. Describing happens after Save, in the AskRow. On phones hide the range text to save width.
