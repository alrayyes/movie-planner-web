## Context

See proposal.md for motivation. All the data this needs already exists
— every `LoggedViewing`'s own `start` timestamp — so this is
self-contained within movie-planner-web, unlike #8's map proposal which
depends on a CLI-side change that doesn't exist yet.

The overview already has a wide-history default (`importCheckRange()`,
see `calendar-overview`'s own spec and #188) and already supports
arriving pre-filtered via `from`/`to` query parameters — this proposal's
click-through target already works today with no changes needed there.

## Goals / Non-Goals

**Goals:**

- Render a full-history heatmap from data already reachable through the
  existing CalDAV client — no new fetch pattern beyond the wide-range
  query the overview and venues page already use.
- Meet the same WCAG 2.1 AA bar as every other page (a heatmap is
  inherently colour-coded, which needs deliberate handling — see specs).

**Non-Goals:**

- A range scrubber or slider — settled out during the design
  conversation (proposal.md's Why).
- Changing the calendar overview itself — the click-through relies on
  its existing, already-specified `from`/`to` query-parameter handling.

## Decisions

**Custom CSS Grid, not a charting library.** A day-by-day grid shaded by
a single numeric value per cell is well within plain CSS Grid plus
Tailwind's own colour scale — pulling in a charting library (Chart.js,
D3, a dedicated heatmap-calendar package) would add a dependency for
something this simple, the same reasoning `movie-details`'s own
blocked-time-graph research (#199) landed on for a single bar. Cells are
real DOM elements (buttons or links), not canvas-drawn — needed anyway
for the accessible-name requirement and real click targets.

**Day boundaries computed in the visitor's own local time, explicitly —
not by parsing a bare date string.** This session already hit a real bug
elsewhere (#188) from exactly this mistake: `new Date("YYYY-MM-DD")`
parses as **UTC midnight**, not local midnight, which silently shifts a
viewing into the wrong day's cell whenever the visitor's timezone isn't
UTC. Bucket each `LoggedViewing.start` into a day key using its own
local-time year/month/day components (`getFullYear()`/`getMonth()`/
`getDate()`, the same pattern `toDateInputValue()` already uses in
`CalendarOverview.svelte`), not a UTC-based one — and construct the
click-through's `from`/`to` values the same way `CalendarOverview.svelte`'s
own `localDayBoundary()` already does. Both helpers are currently
private to that component; extract them to a shared module
(`src/lib/ui/datetime.ts`, where `formatPeriod`/`formatDateTime` already
live) so this feature imports the fixed logic instead of re-deriving it
independently and risking the same bug resurfacing a third time.

**Shading scale**: a small fixed number of buckets (e.g. 0, 1, 2-3, 4+)
mapped to Tailwind's own colour scale steps, rather than a continuous
gradient computed per-cell. Discrete buckets are easier to keep
distinguishable in both light and dark mode, and cheaper to reason about
for the accessible-name text (state the bucket's own real count, not a
computed shade).

## Risks / Trade-offs

- **[A visitor with many years of history makes for a very tall/wide
  grid]** → Scope this as "worth a scroll container" rather than trying
  to fit an arbitrary number of years on screen at once — same pattern
  this app already uses for wide tables (`overflow-x auto` elsewhere).
  Not a blocker, just worth sizing for during implementation.
- **[Colour-coding accessibility]** → Addressed directly in the specs
  (accessible name carries the real count, not shade alone) rather than
  left as an afterthought — same rigour this app's other pages already
  hold to (axe-core scans are already wired into this app's Playwright
  suite for every page that ships).
