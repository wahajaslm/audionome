# Music DNA — player prototype and design system

## What's inside

- `player/index.html`: the clickable prototype (Now playing, Library, My Moments, Discover, My Music DNA). Open it in any browser.
- `design-system/index.html`: the design system as a readable page: guide, colours, type, spacing, and live examples of all 12 components. Open it in any browser.
- `design-system/tokens.css`: every token as a CSS variable, plus a class per text style. Drop it into your project first.
- `design-system/tokens.json`: the same tokens as data, for tools or other platforms (iOS, Android, Figma plugins).
- `design-system/README.md`: the guide: principles, colour roles, type, layout, the moment flow, icons, voice, motion and accessibility.
- `design-system/components/<Name>/`: for each component, `preview.html` (a working example using only the tokens) and `README.md` (its rules).

## Building the real player

1. Add `tokens.css` to your app and use only its variables (`var(--accent)`, `var(--space-4)` …), never raw values.
2. Read `design-system/README.md`, especially "The moment flow": select → Save / Loop → "What stood out?" → More… → saved.
3. Rebuild each component from its `preview.html` and `README.md` in your framework. Start with Waveform, SelectionToolbar, AskRow and PlaybackBar: together they are the Now playing screen.
4. Use `player/index.html` as the reference for how screens connect and behave.

All song names, artists and numbers in the prototype are invented sample data.
