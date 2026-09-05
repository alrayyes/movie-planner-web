## Why

A visitor's watch history is currently only browsable as a filterable
table (the calendar overview). That's good for finding a specific
viewing, but bad for seeing patterns over time — gaps, binges, how
watching habits changed year to year. Issue #198 asks for a
calendar/timeline view to show that density at a glance, originally
framed around a range slider; a design pass with the user settled on a
GitHub-contribution-style heatmap instead (see Capabilities), with no
slider at all.

## What Changes

- Add a new `/calendar` page: a heatmap grid, one cell per day across
  the visitor's whole logged history, shaded by how many viewings
  happened that day (0 shaded lightest/not at all, more viewings shaded
  progressively darker).
- Clicking a day cell navigates to the existing calendar overview with
  `from`/`to` both set to that day — reusing the overview's own existing
  carried-over-date-range support (`calendar-overview`'s "Arriving with
  a carried-over date range" scenario), not a new mechanism.
- No date-range scrubber and no separate slider control — the heatmap
  itself is the whole feature. A visitor wanting a narrower view already
  has the overview's own From/To fields.

## Capabilities

### New Capabilities

- `viewing-heatmap`: the `/calendar` page itself — rendering the heatmap
  from the visitor's logged viewings, per-cell density shading, click-to-
  filter behaviour, and its own accessibility requirements (a heatmap is
  inherently colour-coded, which needs a non-colour-dependent alternative
  to meet this app's existing WCAG 2.1 AA bar).

### Modified Capabilities

(none — the click-through target is the calendar overview's existing
`from`/`to` query-parameter handling, already specified and implemented;
nothing about its behaviour changes)

## Impact

- No cross-repo dependency, unlike #8's map proposal — this uses only
  data already available through the existing CalDAV client (`start`
  timestamps on logged viewings), nothing new to fetch or store.
- New page/component: the heatmap itself, plus whatever site-nav entry
  point it gets (a top-nav link, or reached via the overview — a UI
  placement detail, not load-bearing to the design).
- No change to `calendar-overview` — it's linked to, not modified.
