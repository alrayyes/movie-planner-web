## 1. Per-field missing-data check

- [x] 1.1 Add failing unit tests to `src/lib/omdb/metadata.test.ts` for a new `missingOmdbFields()` covering: no `imdbId` (every field missing, including `imdbMatch`), matched-with-poster-but-no-genre (only `genre` missing), and fully-matched (empty result) — verify the new tests fail against the not-yet-written function
- [x] 1.2 Implement `missingOmdbFields()` in `src/lib/omdb/metadata.ts` and verify `bun run test src/lib/omdb/metadata.test.ts` passes

## 2. Shared refresh/picker logic

- [x] 2.1 Add failing unit tests to a new `src/lib/omdb/refresh-actions.test.ts` for the extracted refresh/bulk-refresh/picker-selection functions, covering the movie-editing spec's own scenarios (re-fetching the freshest CalDAV entry first, already-matched skip, year-then-title fallback, disambiguation picker on no confident match, busy-state callbacks) — verify they fail against the not-yet-extracted module
- [x] 2.2 Extract `handleRefresh`, `showOmdbPicker`, and `handleRefreshAll`'s bodies out of `CalendarOverview.svelte` into `src/lib/omdb/refresh-actions.ts` (config/keys/callbacks as parameters, per design.md), and verify the new unit tests pass
- [x] 2.3 Update `CalendarOverview.svelte` to call the extracted module in place of its inline logic, and verify `tests/omdb-refresh.spec.ts` and `tests/calendar-overview.spec.ts` still pass unchanged

## 3. Missing-data overview page

- [x] 3.1 Create `src/components/MissingDataOverview.svelte`: whole-history load (`importCheckRange()`), six checkboxes (IMDb match, poster, director, actors, genre, synopsis) defaulting to all-checked with OR filtering via `missingOmdbFields()`, a table of poster/title/watched-date/missing-fields, pagination via `lib/ui/pagination.ts`, and per-row/bulk refresh wired to the shared `refresh-actions.ts` module — verify it type-checks (`bun run check`)
- [x] 3.2 Create `src/pages/missing-data.astro` mounting `MissingDataOverview` with `client:only="svelte"` (matching `VenuesOverview`'s own credential-reading-island convention) and verify `bun run build` succeeds
- [x] 3.3 Add a link and short description to `src/pages/settings.astro`'s "More" list, alongside Import/Activity/Docs, and verify it renders (`bun run dev` or the new Playwright test in 4.1)

## 4. End-to-end coverage and docs

- [x] 4.1 Write `tests/missing-data.spec.ts` (Playwright) covering: a viewing missing one field shows the right badge, unchecking all but one checkbox narrows the list, all-checkboxes-checked is the default, the empty state when nothing's missing, per-row refresh (including the disambiguation picker), bulk refresh scoped to the current filter, pagination, reachability from Settings, and an axe-core scan (`WCAG_TAGS`, matching every other journey test) — verify `bun run test tests/missing-data.spec.ts` passes
- [ ] 4.2 Add a short mention of the missing-data page to `src/content/docs/docs/logging.md`'s "Refreshing metadata" section, and verify `bun run format:check` (prose/mechanics lint) passes
- [ ] 4.3 Run the full suite — `bun run check`, `bun run lint`, `bun run test`, `bun run format:check` — and fix anything that fails
