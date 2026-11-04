# Button

Pill-shaped buttons in three weights, plus the round play button and the learning switch.

- Primary: `ink` fill, `on-ink` text, weight 500. At most one per view or row (Save moment, Done, Yes, that's me).
- Outline: `line-strong` border, `ink` text, for the alternative answer (Not really).
- Ghost: no border, `ink-sub` text, for dismissals (Skip, Not now) and inline links ("Find unfamiliar moments like these →").
- Heights: 38px default, 30–36px inside strips and rows. All `radius-pill`.
- Round play (40px, `line-strong` ring) starts a moment from any list.
- Switch: `role="switch"`, track `line-strong` off / accent at 35% on, knob `ink-sub` → `ink`. Used once: Learning on/paused.
