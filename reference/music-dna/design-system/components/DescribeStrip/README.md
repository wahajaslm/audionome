# DescribeStrip

The detailed form of the AskRow: three one-line rows for how a moment feels, what you love about it, and an optional note.

- Opened only from AskRow's More…; it updates the moment that was just saved rather than creating a new one.
- Rows: Feels (round chips, `radius-pill`), Love (square chips, `radius-sm`), Note (single-line input + Not now + Done). Each row is 40px; a row that does not fit scrolls sideways. The strip never grows past three rows.
- Feelings and musical qualities stay separate inputs: someone can love a sad passage for its melody.
- Pressed chips: `chip-on` fill, `chip-on-line` border, `ink` text. Never a solid white chip.
- Done shows a toast naming the traits it fed ("Moment updated · added to vocal transitions").
