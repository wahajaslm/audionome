# NavItem

A sidebar or tab-bar entry for the five places in the app: Now playing, Library, My Moments, Discover, My Music DNA.

- Sidebar item: 42px, `radius-sm`-ish 10px corners, 18px line icon + label (`body`), optional count right in `ink-mute`. Current = `bg-raise` fill + `ink` text, marked `aria-current="page"`.
- Collections follow under a `caption` heading as 36px text-only items.
- Below `breakpoint-tabs` the same five items become a bottom tab bar on `bg-side`: icon above a short label (Playing, Library, Moments, Discover, DNA), 52px tall, padded by the safe-area inset.
- When not on the player, a mini player (cover, title, artist · time, play/pause) sits at the bottom of the sidebar or above the tabs and returns to Now playing.
