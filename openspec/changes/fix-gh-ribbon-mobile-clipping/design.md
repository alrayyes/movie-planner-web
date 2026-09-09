## Context

See proposal.md - Why. `.gh-ribbon` is a fixed 130×130px box (`overflow: hidden`) at the `max-width: 640px` breakpoint; `.gh-ribbon a` is a 195px-wide band at 11px font, rotated 45deg. The text doesn't fit inside that band's rendered width at real device font rendering, so it overflows the band and gets clipped by the parent box.

## Goals / Non-Goals

**Goals:** the full ribbon text renders inside the clipped box at real mobile viewport widths, verified against an actual browser render, not calculated blindly.

**Non-Goals:** redesigning the ribbon's look — this is a sizing fix to the existing hand-rolled shape (`#66`'s own choice over a dependency), not a rebuild.

## Decisions

**Measure against a real Playwright render before picking new numbers**, rather than guessing pixel values the way the original `#66` breakpoint apparently was. Options considered: widen the band/box further, shrink the font further, or shorten the copy (e.g. "Fork on GitHub") to something that fits more comfortably at a legible size. Shortening the copy avoids fighting geometry at the cost of matching the desktop version's wording exactly less closely — worth checking whether desktop's copy needs to match, or whether a shorter mobile-specific string is acceptable.

## Risks / Trade-offs

- [A fix verified only on one device/viewport width regresses at a different narrow width] → the new Playwright test should assert at the actual breakpoint boundary and at a common real device width (e.g. 375px, 393px), not just one arbitrary size.
