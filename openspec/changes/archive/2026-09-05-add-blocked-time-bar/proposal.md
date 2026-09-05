## Why

A viewing's Start and End fields on the details page require reading and
mentally subtracting two timestamps to know how long it actually took.
Issue #199 asks for a visual bar showing that duration at a glance
instead, scoped through a short design conversation with the user
2026-09-05: below the existing Start/End fields (not replacing them),
and clipped at the track's midnight edge for the rare viewing that
crosses it.

## What Changes

- Add a horizontal bar within a 24-hour track on the movie-details page,
  positioned below the existing Start/End fields — those stay exactly
  as they are, the real and only accessible text for a viewing's
  timing. The bar itself is a purely visual supplement (`aria-hidden`),
  not a second, redundant accessible description of the same two
  timestamps.
- The bar's position and width are computed from the viewing's own
  start time (position within the 24-hour track) and duration (width),
  using plain CSS Grid/absolute positioning — no charting library for a
  single bar.
- A viewing that starts on one day and ends the next SHALL have its bar
  clipped at the track's midnight edge rather than showing a second
  segment or wrapping — a rare case (a very late showing), and the real
  Start/End text right above it is unaffected either way.

## Capabilities

### Modified Capabilities

- `movie-details`: the details page gains this bar as part of its
  existing full-metadata display, alongside Start/End rather than
  replacing them.

## Impact

- No new dependency — plain CSS, no charting library.
- No cross-repo dependency, unlike #8's map proposal — this uses only
  the `start`/`end` timestamps already on every `LoggedViewing`.
- Touches only `MovieDetails.svelte` and its own tests/spec.
