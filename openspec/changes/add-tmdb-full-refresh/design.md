## Context

See proposal.md - Why. This app's OMDb client (`src/lib/omdb/client.ts`)
already resolves an `imdbId` for most matched viewings. The CLI's own
TMDb client (`src/movie_planner/tmdb.py`, confirmed via the
movie-planner-cli session) chains off that same id rather than
searching TMDb independently: `find/{imdb_id}` to resolve TMDb's numeric
id, then one `movie/{tmdb_id}?append_to_response=credits,videos,release_dates,keywords`
call. `api.themoviedb.org` sends `Access-Control-Allow-Origin: *` on
both GET and preflight `OPTIONS` (confirmed live via curl), so this
runs the same as OMDb does today: straight from the browser, no proxy.

## Goals / Non-Goals

**Goals:**

- One shared enrichment step, reused by every call site that already
  attaches OMDb metadata to a viewing.
- Byte-for-byte the same "no imdb_id, no TMDb call, no fallback search"
  rule the CLI already enforces.

**Non-Goals:**

- A TMDb-only search path (title/year) — explicitly rejected; TMDb only
  ever runs off an already-resolved IMDb ID.
- Displaying the new fields on the details page — that's #400, a
  separate change.
- A "confirmed no trailer, don't ask again" marker (`X-TRAILER-CHECKED-AT`)
  — deferred, per #360's original description, unchanged by this scope
  expansion.

## Decisions

**ID-chained lookup, not title/year search.** #360 originally specified
mirroring OMDb's search-then-fetch shape; superseded after confirming
the CLI's actual approach is ID-chained and after deciding (in
conversation) that TMDb only runs when an IMDb ID already exists. This
removes the need for a TMDb-specific disambiguation picker entirely —
the existing OMDb picker (movie-log capability) is still what resolves
ambiguity, before TMDb ever runs.

**One shared helper (`src/lib/tmdb/client.ts`'s enrichment function),
called from three sites**, rather than wiring TMDb into each
independently:

- `CalendarOverview.svelte`'s `handleRefresh` (single-row refresh)
- `CalendarOverview.svelte`'s `handleRefreshAll` (bulk refresh)
- `LogViewingForm.svelte`'s confident-match and picker-selection paths

Each site already has a point where it just attached OMDb metadata
(`{ ...viewing, ...metadata }`) and knows whether the result has an
`imdbId`; the shared helper takes a viewing and returns the TMDb fields
to merge in, or nothing if no key/no imdb_id/no TMDb match.

**Field overwrite rules mirror the CLI exactly**: `actors`/`website`
overwritten only when TMDb actually has a value (never blanked);
`trailerUrl`/`collection`/`certification`/`keywords`/`budget`/`popularity`
follow the existing "omit, never guess" convention already used
throughout this schema. `budget: 0` from TMDb is treated as "not
entered" (`undefined`), matching the CLI's own handling.

**Bulk refresh calls TMDb sequentially**, same rate-limit posture the
existing OMDb bulk refresh already uses (#59's own comment: "hitting
OMDb's own rate limits, not just this app's") — TMDb calls are added to
the same per-viewing loop, not parallelized.

## Risks / Trade-offs

- [Two extra HTTP round trips per viewing when both keys are set
  (`find` + `movie`), on top of OMDb's existing call] → bulk refresh
  already runs sequentially and reports progress; this adds to that
  same, already-visible "Refreshing N of M…" status rather than
  introducing a new kind of wait.
- [A viewing with metadata already correct but no `budget`/`popularity`
  et al. (matched before this change shipped) won't get backfilled by
  the "already up to date" skip logic in bulk refresh] → the existing
  `hasOmdbMetadata` skip check is unaffected by this change; a visitor
  wanting the new TMDb fields on an already-matched viewing uses the
  single-row refresh, which — per the existing "Refresh OMDb metadata"
  requirement — always re-runs regardless of existing metadata.
