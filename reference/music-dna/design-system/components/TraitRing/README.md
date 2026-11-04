# TraitRing

The signature visual of My Music DNA: a ring of fine ticks where each arc is one trait and its length is that trait's share of your saved moments.

- 300px ring (radius 150), 2px ticks, `radius-xs`. Each trait gets 3 ticks per moment plus a 3-tick gap; tick length 12–36px, swelling towards the middle of its arc.
- Colour: selected trait `accent`; others `wave-off` while one is selected, #b4b4b9 when none is.
- Outside labels at each arc's midpoint: share in 20px `ink` (accent when selected) over a short name in `label`. Labels are buttons that select the trait. Below 700px hide them and show the same items as tabs under the ring.
- Centre: `numeral` share + trait name + "of your saved moments"; with nothing selected, total moments + "tap a trait".
- Pair it with the portrait sentence directly underneath, whose underlined phrases select the same traits.
