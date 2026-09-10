## 1. Schema

- [x] 1.1 Add `collection`, `certification`, `keywords`, `budget`, `popularity` to `LoggedViewing` in `src/lib/caldav/types.ts` and verify `bun run check` passes
- [x] 1.2 Add `X-COLLECTION`, `X-CERTIFICATION`, `X-KEYWORDS`, `X-BUDGET`, `X-POPULARITY` to `X_PROPERTIES` in `src/lib/caldav/ical.ts` and verify a round-trip unit test (serialize then parse) recovers all five fields

## 2. TMDb client

- [x] 2.1 Create `src/lib/tmdb/client.ts`: `find/{imdb_id}?external_source=imdb_id` to resolve TMDb's numeric id, and verify a unit test covers no-match (empty `movie_results`)
- [x] 2.2 Add `movie/{tmdb_id}?append_to_response=credits,videos,release_dates,keywords` fetch and field extraction (trailer from `videos`, cast from `credits`, certification from `release_dates` filtered to US only, keywords, budget treating `0` as `undefined`, popularity), and verify unit tests cover each field's presence/absence case
- [x] 2.3 Write the shared enrichment helper (given a viewing with an IMDb ID (`imdbId`) and a TMDb key, returns the fields to merge or `undefined` if no key/no `imdb_id`/no match) and verify a unit test covers all three skip conditions

## 3. Credentials

- [x] 3.1 Add a TMDb API key field to the credentials form/store, matching the existing OMDb key's optional/opt-in treatment, and verify a Playwright test covers submitting credentials with no TMDb key set
- [x] 3.2 Document the new key in `docs/connecting.md`

## 4. Wire the three call sites

- [x] 4.1 Wire `CalendarOverview.svelte`'s `handleRefresh` to call the shared helper after an OMDb match, and verify a Playwright test covers a single-row refresh attaching TMDb fields
- [x] 4.2 Wire `CalendarOverview.svelte`'s `handleRefreshAll` to call the shared helper per viewing in the existing sequential loop, and verify a Playwright test covers a bulk refresh attaching TMDb fields across multiple viewings
- [x] 4.3 Wire `LogViewingForm.svelte`'s confident-match path to call the shared helper, and verify a Playwright test covers logging a title that gets both OMDb and TMDb data in one submission
- [x] 4.4 Wire `LogViewingForm.svelte`'s disambiguation-picker selection path to call the shared helper, and verify a Playwright test covers picker selection attaching TMDb fields

## 5. Verification

- [x] 5.1 Verify `bun run check`/`lint`/`test` all pass
- [x] 5.2 Verify the four movie-editing/movie-log/credentials spec scenarios for "no TMDb key" and "no IMDb ID resolved" behave as unchanged/no-call, by running their corresponding tests
