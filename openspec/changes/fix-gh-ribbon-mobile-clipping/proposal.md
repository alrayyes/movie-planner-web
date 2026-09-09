## Why

The "Fork me on GitHub" ribbon's own mobile breakpoint (`src/styles/global.css:76-89`, added for an earlier fix at #66) still clips the text on real mobile viewports — confirmed via a live screenshot at ~393px width. Tracked as movie-planner-web#433.

## What Changes

- Resize the ribbon's mobile-breakpoint band/font so "Fork me on GitHub" fully fits within `.gh-ribbon`'s clipped box at real device widths, not just the previously-guessed values.
- Add test coverage for the ribbon at a real mobile viewport, since none exists today.

## Capabilities

### New Capabilities

(none — cosmetic CSS fix, no existing capability covers page chrome like this)

### Modified Capabilities

(none)

## Impact

- `src/styles/global.css` (`.gh-ribbon`, `.gh-ribbon a`, the `@media (max-width: 640px)` block).
- `tests/responsive.spec.ts` (or a new location): new coverage.
