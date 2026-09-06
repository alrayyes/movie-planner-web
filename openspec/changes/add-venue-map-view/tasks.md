## 1. Confirm the CLI-side dependency before starting

- [x] 1.1 Confirm `movie-planner`'s own GEO-coordinate ticket/OpenSpec change exists and has resolved its two open questions (precedence against the hardcoded chain/city/country lookup, and whether a venue-update mechanism is needed) — do not proceed past this task until it does, per design.md's Context and first Risk (movie-planner#170, merged via movie-planner#183)
- [x] 1.2 Confirm the actual shape it lands on matches this change's assumption (`GEO:lat;long` on the `VEVENT`, alongside `LOCATION`) — if it differs, stop and revisit proposal.md/design.md/the specs before continuing (confirmed: `GEO:{lat};{lon}` via `icalendar` 7.3's `vGeo`, omitted entirely — not `0;0` — when a venue has no coordinates)

## 2. Parse and carry `geo` through the CalDAV client

- [x] 2.1 Add an optional `geo?: { lat: number; lon: number }` field to `LoggedViewing` (`src/lib/caldav/types.ts`) and verify `bun run check` passes with the new field referenced nowhere yet
- [x] 2.2 Parse the `VEVENT`'s `GEO` property (`lat;lon`, semicolon-separated per RFC 5545 §3.8.1.6) into `geo` in the CalDAV client's read path, and verify a unit test covering a `GEO` value, a missing one, and a malformed one (non-numeric, wrong separator)
- [x] 2.3 Write `geo` back out as a `GEO` property when creating/updating a viewing that has it, and verify a unit test round-trips a `geo` value through write-then-read

## 3. Nominatim address-search lookup

- [x] 3.1 Add a small Nominatim client (`src/lib/geo/nominatim.ts` or similar): debounced query, a descriptive `User-Agent`, parses the response into candidate `{ label, lat, lon }` results, and verify unit tests cover a successful response, an empty result set, and a network/HTTP failure (fails soft, same pattern as OMDb lookups) — debouncing lives with the form that calls this (task 4/5), not the client itself; `User-Agent` turned out to be impossible to set from browser `fetch` (Fetch spec's forbidden-header list) — the browser's own `Referer` is what actually satisfies Nominatim's policy instead, see `nominatim.ts`'s own comment
- [x] 3.2 Add a "reuse known coordinates" lookup: given a venue name and the viewings already loaded in the current context, return the first matching `geo` value found, and verify a unit test covers a match, no match, and multiple viewings at the same venue with differing `geo` (first-found wins, documented as such)

## 4. Log form: optional coordinate entry

- [x] 4.1 When the venue field's value has no known coordinates (per 3.2), show the optional address-search field; when it does, attach the known coordinates automatically and show no field — verify a Playwright test for both paths (also converted `movie-log-form.ts` to `LogViewingForm.svelte` as part of this change, per the standing opportunistic-Svelte-migration rule — non-trivial work on this component, so the conversion rides along rather than a separate PR)
- [x] 4.2 Selecting a Nominatim candidate attaches its coordinates to the viewing being logged; leaving the field empty logs the viewing with no `geo` — verify a Playwright test for both (the Pathé email flow gets automatic reuse only, not a search field — its confirm step is a fixed read-only summary, and a Pathé booking's cinema rarely lacks known coordinates given movie-planner's own hardcoded venue fixtures; documented as a deliberate scope choice in the shipping PR)
- [x] 4.3 Update `openspec/specs/movie-log/spec.md`'s two new scenarios to point at this test once it exists (traceability, not new behaviour) — checked: no `spec.md` in this repo references a test file path (searched `openspec/specs/*/spec.md` and every archived change's own delta), so adding one here would invent an unused convention rather than follow an established one; the delta spec's two scenarios (`specs/movie-log/spec.md` in this change) already match the three new Playwright tests in `tests/movie-log.spec.ts`'s "coordinate entry" describe block one-for-one

## 5. Movie-editing: optional coordinate entry

- [ ] 5.1 Same behaviour as task 4, applied to the edit form on the movie-details page when a visitor changes the venue field — verify a Playwright test for both the new-venue and known-venue paths
- [ ] 5.2 Verify editing a viewing's venue back to one with existing coordinates doesn't require re-entering them (matches 3.2's reuse lookup)

## 6. Per-venue map on the details page

- [ ] 6.1 Add the bundled local map-outline asset (image or GeoJSON) and a small Leaflet-based map component configured with it instead of a tile layer, and verify no network request fires when the component mounts (a Playwright test asserting no request to a map-tile-shaped URL)
- [ ] 6.2 Render the map on the movie-details page when the viewing's `geo` is present; render nothing when it isn't — verify a Playwright test for both
- [ ] 6.3 Add the "Open in Maps" link next to the pin, pointing at the venue's exact coordinates — verify a Playwright test asserts its `href`

## 7. Global `/map` page

- [ ] 7.1 Add the `/map` page, querying the visitor's whole history (same wide range `importCheckRange()` already provides elsewhere) and rendering one pin per viewing with a `geo` value, reusing the map component from task 6
- [ ] 7.2 Verify a Playwright test: a mix of located/unlocated viewings shows the right pin count and omits the unlocated ones without error
- [ ] 7.3 Verify a Playwright test: no logged viewings with a `geo` value renders an empty map, not an error
- [ ] 7.4 Decide and implement how `/map` is reached (top-nav link vs. a link from the Venues page, per design.md's second Open Question) and verify it's reachable in a Playwright test

## 8. Accessibility and finishing checks

- [ ] 8.1 Axe-scan `/map` and the movie-details page's per-venue map, and fix any violation before merging
- [ ] 8.2 Run `bun run check`, `bun run lint`, `bun run test`, `bun run format:check`, `bun run lint:mechanics` and confirm all green
- [ ] 8.3 Update `openspec/specs/venue-map/spec.md` (new), `movie-log/spec.md`, and `movie-editing/spec.md` deltas are ready for archive; update the README if `/map` needs a mention alongside the other pages
