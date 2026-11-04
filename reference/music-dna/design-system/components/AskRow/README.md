# AskRow

A single-line question under the waveform that the listener can answer with one tap, expand, or skip.

- Appears after Save ("Saved. What stood out?") and when the player notices repeated replays ("You keep coming back to 2:31. What is it?"). Same component both times.
- One row, ≥44px high, `bg-panel`, `line-strong` border, `radius-md`. Sparkle icon + question, then five square chips (Vocals, Melody, Instruments, Rhythm, Build-up), then More…, then Skip pushed right. Scrolls sideways on narrow screens instead of wrapping.
- Opens in the slot under the toolbar with a 280 ms grid-rows transition; never a modal, never pauses playback.
- A tap answers and closes the row with a toast ("Thanks. Added to vocal transitions."). More… replaces it with the DescribeStrip for the same moment. Skip closes it.
- Ask at most one question at a time, and only when the answer would change what Music DNA believes.
