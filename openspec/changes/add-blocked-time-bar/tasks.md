## 1. Position/width computation

- [ ] 1.1 Add a function computing `{ positionPercent, widthPercent }` from a viewing's `start`/`end` in local time (per design.md's formula), and verify a unit test covering a same-day viewing, a viewing crossing midnight (clipped, not wrapped), and a very short viewing
- [ ] 1.2 Verify a unit test specifically for a viewing whose UTC day/hour and local day/hour differ (the same class of bug #188 fixed) — the bar must position against the visitor's own local time, matching what Start/End already show via `formatDateTime`

## 2. Render the bar

- [ ] 2.1 Add the 24-hour track and bar to `MovieDetails.svelte`, below the existing Start/End fields, using the computation from task 1
- [ ] 2.2 Mark the bar `aria-hidden="true"`, and verify a Playwright test confirms it's excluded from the accessibility tree while Start/End remain in it
- [ ] 2.3 Verify a Playwright test for a same-day viewing and a midnight-crossing one, asserting the bar's own rendered position/width (or clipped width) match the computation

## 3. Finishing checks

- [ ] 3.1 Axe-scan the details page with the bar present and fix any violation before merging
- [ ] 3.2 Run `bun run check`, `bun run lint`, `bun run test`, `bun run format:check`, `bun run lint:mechanics` and confirm all green
- [ ] 3.3 Confirm `openspec/specs/movie-details/spec.md`'s new requirement is ready for archive
