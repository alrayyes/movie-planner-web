## 1. Extract shared date helpers

- [ ] 1.1 Move `toDateInputValue`/`localDayBoundary` out of `CalendarOverview.svelte` and into `src/lib/ui/datetime.ts`, updating `CalendarOverview.svelte`'s own imports, and verify `bun run test tests/calendar-overview.spec.ts` still passes unchanged
- [ ] 1.2 Add unit tests for both helpers directly (if not already covered) covering a local-timezone round-trip, matching the rigour #188's own fix required

## 2. Bucket viewings by local day

- [ ] 2.1 Add a function that buckets a list of `LoggedViewing` records by local-time day into a day-to-count map (using the extracted helpers above), and verify a unit test covering a day with several viewings, a day with a single viewing, and a day with none
- [ ] 2.2 Verify a unit test specifically for a viewing whose UTC day and local day differ (the exact class of bug #188 fixed) — it must bucket to the visitor's own local day, not UTC's

## 3. Heatmap component and page

- [ ] 3.1 Add the `/calendar` page and a heatmap component rendering a CSS Grid of day cells across the visitor's whole logged history (reusing the same wide-range query `importCheckRange()` already provides elsewhere), and verify it renders via a Playwright smoke test
- [ ] 3.2 Shade each cell by its bucketed count using a small fixed set of buckets (e.g. 0, 1, 2-3, 4+) mapped to Tailwind colour steps, in both light and dark mode, and verify a Playwright test asserts the right bucket's styling for a few representative counts
- [ ] 3.3 Give each cell an accessible name stating its date and real viewing count (not shade alone), and verify a Playwright test reads it via `getByRole` with an accessible name assertion
- [ ] 3.4 Make a day cell with at least one viewing a real link/button navigating to the calendar overview with `from`/`to` both set to that day; a cell with none is inert, and verify a Playwright test for both
- [ ] 3.5 Verify a Playwright test: no logged viewings at all still renders the full grid at the empty shade, not an error

## 4. Accessibility and finishing checks

- [ ] 4.1 Axe-scan `/calendar` and fix any violation before merging
- [ ] 4.2 Decide and implement how `/calendar` is reached (top-nav link vs. elsewhere) — a UI-placement detail per design.md, not load-bearing
- [ ] 4.3 Run `bun run check`, `bun run lint`, `bun run test`, `bun run format:check`, `bun run lint:mechanics` and confirm all green
- [ ] 4.4 Confirm `openspec/specs/viewing-heatmap/spec.md` (new) is ready for archive
