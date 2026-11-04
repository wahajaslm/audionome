# PlaybackBar

The transport row: time on the left, five symmetric controls in the centre, volume on the right — seamless, with no frame.

- Grid `1fr auto 1fr` so the play button is always the exact centre of the column.
- Centre, in order: ♡ save the last 20 s (`ink-sub`) · previous · play/pause (52px, 1px ring at half `ink`) · next · loop selection (`ink-sub`, pressed = `accent`).
- Sits in the lower part of the player (column `min-height` ≈ viewport, bar `margin-top:auto`) and is `position:sticky` to the bottom when content is taller. Background is `bg`, no border, no radius.
- Below `breakpoint-phone`: hide volume, put time left and controls right; the bar sits just above the tab bar.
- Loop with no selection shows a toast: "Select a passage on the waveform to loop it."
