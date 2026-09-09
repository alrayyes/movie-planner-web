## Why

Clicking a venue on `/venues` currently lands on the main overview, pre-filtered — a shared page carrying filter chrome that doesn't apply to a single-venue view. Tracked as movie-planner-web#448.

## What Changes

- A new static page, `/venue`, reading the venue from a `?venue=...` query string (the full raw venue value, matching what filtering already keys on — not the display-trimmed name from #440).
- Shows that venue's results table, pagination, and map — no filter controls of any kind, permanently locked to the venue from the query string.
- `VenuesOverview.svelte`'s venue links updated to point here instead of the main overview's pre-filtered view.
- Breadcrumb reads "Home / Venues / {venue}", using the venue's trimmed display name (depends on `trim-venue-display-to-name-and-city`, #440).

## Capabilities

### New Capabilities

- `venue-detail`: a dedicated, filter-free view of a single venue's viewings (results, pagination, map).

### Modified Capabilities

- `location-management`: "A venue links to its filtered viewings" scenario updates to point at the new page instead of the main overview.

## Impact

- New `src/pages/venue.astro`, reusing existing table/pagination/map logic (from `CalendarOverview.svelte`/`VenueMap.svelte`) rather than duplicating it wholesale — implementation-time call on exact reuse mechanism.
- `src/components/VenuesOverview.svelte`: `venueHref` updated.
