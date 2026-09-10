## Why

This app has zero TMDb integration today — fields like `trailerUrl` only ever arrive already-written by the CLI. The CLI enriches every matched viewing with TMDb data (trailer, full cast, collection, certification, keywords, budget, popularity) once it has an IMDb ID (`imdb_id`) from OMDb; this app has no equivalent, so a viewing logged or refreshed entirely through the web app never gets that data at all. Tracked as `alrayyes/movie-planner-web`#360 and #400.

## What Changes

- New `src/lib/tmdb/client.ts`: resolves TMDb's numeric id via `find/{imdb_id}` (never a title/year search — TMDb only ever runs when an IMDb ID (`imdb_id`) is already known), then fetches `movie/{tmdb_id}?append_to_response=credits,videos,release_dates,keywords` in one round trip.
- One shared enrichment helper, called from every place this app already attaches OMDb metadata to a viewing: single-row "Refresh metadata", initial log via the manual form and Pathé-email flow (both the confident-match and disambiguation-picker paths), and bulk "Refresh all metadata".
- New CalDAV properties: `X-COLLECTION`, `X-CERTIFICATION`, `X-KEYWORDS`, `X-BUDGET`, `X-POPULARITY`. `X-TRAILER-URL` already exists in the schema (previously CLI-only-written); this app now writes it too. `actors`/`website` are overridden when TMDb has richer data than OMDb's.
- New TMDb API key field on the credentials form, same optional/opt-in graceful-degradation pattern as the existing OMDb key — no key configured means no TMDb calls, never a hard failure.

## Capabilities

### New Capabilities

(none — TMDb enrichment is woven into the existing capabilities below, matching how OMDb enrichment has no capability of its own either)

### Modified Capabilities

- `movie-editing`: "Refresh OMDb metadata" and "Refresh all metadata on screen" requirements gain TMDb enrichment as a second step, gated on an existing `imdb_id`.
- `movie-log`: "Best-effort OMDb enrichment" requirement gains the same TMDb step once OMDb resolves (or the disambiguation picker attaches) an IMDb ID (`imdb_id`).
- `credentials`: new requirement, "TMDb API key is optional", mirroring the existing "OMDb API key is optional" requirement.

## Impact

- `src/lib/tmdb/client.ts` (new), with unit tests.
- `src/lib/caldav/types.ts`, `src/lib/caldav/ical.ts`: new fields/X-properties.
- `src/components/credentials-gate.ts`, `src/components/credentials-settings-form.ts` (or wherever the credentials form lives): new TMDb key field.
- `src/components/CalendarOverview.svelte` (`handleRefresh`, `handleRefreshAll`), `src/components/LogViewingForm.svelte` (confident-match and picker paths): wired to the shared helper.
- `docs/connecting.md`: documents the new key.
- No CORS/proxy concerns — confirmed `api.themoviedb.org` sends `Access-Control-Allow-Origin: *` on both GET and preflight `OPTIONS`.
