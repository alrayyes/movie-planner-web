## Context

See proposal.md - Why. `CalendarOverview.svelte` already implements the
per-row refresh, the OMDb disambiguation picker, and the bulk "Refresh
all metadata" action — roughly 130 lines of `handleRefresh`,
`showOmdbPicker`, and `handleRefreshAll`, all inline in that one
component. Only the picker's own DOM (`buildOmdbPicker`, in
`src/lib/omdb/picker.ts`) is already shared; the surrounding
fetch/reload/error-handling logic isn't. The new missing-data page is a
second consumer of that same behaviour (movie-editing capability, this
change's Modified Capabilities), so this change is also the first time
that logic needs to live in two places.

`hasOmdbMetadata()` in `src/lib/omdb/metadata.ts` is today's one
existing "is this viewing matched" check — a binary. This change needs
the per-field version of the same idea.

## Goals / Non-Goals

**Goals:**

- Share the refresh/picker/bulk-refresh logic between
  `CalendarOverview.svelte` and the new page rather than duplicating it.
- One source of truth for "which of the six tracked fields is this
  viewing missing," used by both the filter checkboxes and each row's
  displayed gap list.
- Follow `AttributeDetail.svelte`'s established shape for a focused,
  filter-scoped-to-itself page (own pagination, whole-history scan, no
  date-range filter) rather than threading a "missing-data mode" through
  `CalendarOverview.svelte`.

**Non-Goals:**

- No new filter dimensions beyond the six fields named in the proposal
  (no arbitrary "missing any OMDb field" catch-all).
- No change to `CalendarOverview.svelte`'s own columns, filters, or
  sorting.
- No server-side pagination or index — same client-side, whole-history
  fetch every other listing page (`AttributeOverview`, `VenuesOverview`)
  already does.

## Decisions

### Extract the refresh/picker/bulk-refresh logic into a shared module

Move `handleRefresh`, `showOmdbPicker`, and `handleRefreshAll`'s bodies
out of `CalendarOverview.svelte` into a new
`src/lib/omdb/refresh-actions.ts`, parameterized by the CalDAV config,
OMDb/TMDb keys, the target viewing(s), and callbacks for reload/status/
error/busy-state, so both `CalendarOverview.svelte` and the new
`MissingDataOverview.svelte` call the same functions instead of a
second hand-copied implementation drifting from the first.

Alternative considered: leave the logic in `CalendarOverview.svelte`
and have the new component duplicate it. Rejected — the movie-editing
spec's own scenarios (already-matched skip, year-then-title fallback,
disambiguation-picker-on-no-match, re-fetching the freshest CalDAV entry first) would
then need to stay in sync by hand across two files, and #450's own
precedent (one shared component/module over N hand-duplicated pages)
already rejected this shape for a simpler case.

### A single `missingOmdbFields()` helper alongside `hasOmdbMetadata()`

Add `missingOmdbFields(viewing): MissingField[]` to
`src/lib/omdb/metadata.ts`, returning the subset of `["imdbMatch",
"poster", "director", "actors", "genre", "synopsis"]` that viewing
lacks (`imdbMatch` absent whenever `imdbId` is unset, independent of
`hasOmdbMetadata`'s poster-inclusive definition, since "no match at
all" and "matched but missing a poster" are two different diagnostic
signals the proposal's checkboxes both name). Both the filter checkbox
evaluation and each row's displayed gap list read this one function,
so the definition of each field-kind lives in exactly one place.

### New page follows the `AttributeDetail.svelte` shape, not a `CalendarOverview` mode

`MissingDataOverview.svelte` is its own component with its own
pagination (`lib/ui/pagination.ts`) and its own whole-history load
(`importCheckRange()`), the same call `AttributeOverview`/
`AttributeDetail`/`VenuesOverview` already make — not a "hide most
filters, add a missing-data filter" mode threaded through
`CalendarOverview.svelte`. Same reasoning #450 already recorded for
the attribute pages: a shared mode would either bloat
`CalendarOverview.svelte` with a concern most visits never use, or
strip the missing-data page of nothing it needed in the first place.

### Filter state is local component state, not persisted

Unlike `CalendarOverview.svelte`'s filters (persisted to
`localStorage`, restorable across visits), the six checkboxes reset to
all-checked on every visit. This is a deliberately narrow diagnostic
tool opened to check on something specific, not a primary browsing
view a visitor tunes once and expects to keep — matching
`AttributeDetail.svelte`'s own no-persisted-filter-state precedent.

## Risks / Trade-offs

- [Extracting shared logic touches `CalendarOverview.svelte`, an
  already-large, heavily-specified file] → Existing
  `calendar-overview`/`movie-editing` spec scenarios and their tests
  stay the acceptance bar; the extraction changes where the code lives,
  not its behaviour, and the existing test suite is what proves that.
- [A visitor with a very large log pays a whole-history CalDAV fetch on
  every visit to this page] → Same cost `AttributeOverview.svelte`
  already pays for every attribute listing page; not a new pattern.

## Migration Plan

Purely additive — a new page, a new library module, one new link on
Settings, and an internal refactor of existing refresh logic with no
behaviour change. No data migration; every already-logged viewing is
picked up the first time the page loads.
