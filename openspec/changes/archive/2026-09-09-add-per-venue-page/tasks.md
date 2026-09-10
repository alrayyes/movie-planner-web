## 1. New page

- [x] 1.1 Create `src/pages/venue.astro` reading `venue` from the query string
- [x] 1.2 Render the results table, pagination, and map for that venue only, reusing existing logic rather than duplicating it, with no filter UI
- [x] 1.3 Verify an unmatched `venue` value shows an empty-results state, not an error

## 2. Wire up links

- [x] 2.1 Update `VenuesOverview.svelte`'s `venueHref` to point to `/venue?venue=...`

## 2a. Breadcrumb

- [x] 2a.1 Broadcast the venue's trimmed display name (the shared helper from #440) the same way the overview's chip-driven filter breadcrumb already does (`ACTIVE_FILTER_LABEL_EVENT`), so `site-breadcrumb.ts` shows "Home / Venues / {venue}" on `/venue`
- [x] 2a.2 Verify the breadcrumb shows the trimmed name (e.g. "City, Amsterdam"), not the raw stored venue value

## 3. Verification

- [x] 3.1 Playwright coverage: clicking a venue on `/venues` lands on `/venue` showing only that venue's viewings, with no filter controls
- [x] 3.2 Verify `bun run check`/`lint`/`test` all pass
