# Waveform

The centre of the player: navigation, selection and a quiet record of saved moments in one control.

- Bars are `wave-bar` (2px) wide, `radius-xs`, spaced 5px centre to centre; compute the count from the container width so bars never stretch. Height 160px desktop, 120px phone; bar height = amplitude × (height − 20px), minimum 2px.
- Colour per bar, in priority order: inside the current selection → `accent`; inside a saved moment → `accent-saved`; before the playhead → `wave-played`; else `wave-off`.
- The selection band (`accent-fill` fill, `accent-line` border, `radius-sm`) sits behind selected bars, 4px wider on each side.
- Playhead: 1px `playhead`, 6px taller than the waveform at top and bottom.
- Saved moments get a 5px `accent` dot centred under them. Do not draw boxes or dashed lines for inferred interest: those signals live in words, not marks.
- Interaction: click seeks; drag (more than ~2 s of track) selects; minimum selection 3 s. Keyboard: `role="slider"`, ←/→ ±5 s, Enter selects ±10 s around the playhead.
- A backward seek is a listening signal: record it, never show it on the waveform.
- Consumer provides: amplitude data (≈400 samples normalised 0–1), duration, current time, selection, saved ranges.
