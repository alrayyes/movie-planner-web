## MODIFIED Requirements

### Requirement: Refresh OMDb metadata

The system SHALL let a visitor re-run the best-effort OMDb lookup for an
already-logged viewing that doesn't yet have a confident match, using
its stored title and the year it was watched as a fuzzy disambiguation
hint, and SHALL overwrite the CalDAV event's OMDb-sourced fields with
the new result. The system SHALL only offer this when the visitor has
an OMDb key set. A year-scoped search that finds nothing SHALL fall
back to a plain title search rather than reporting no match, since a
re-watch of an older film is logged in a different year than its
actual release.

When the refresh (or a fresh OMDb match found during it) resolves an
IMDb ID and the visitor has a TMDb key set, the system SHALL also fetch
TMDb's data for that IMDb ID and write it to the CalDAV event: a
trailer URL, collection, certification, keywords, and budget/popularity,
plus overwriting the actors and website fields when TMDb has richer
data than OMDb's. The system SHALL NOT search TMDb by title — the TMDb
lookup only ever runs off an IMDb ID already resolved by OMDb.

#### Scenario: Stale metadata refreshed

- **WHEN** a visitor with an OMDb key set refreshes a logged viewing whose calendar entry doesn't yet have an IMDb ID
- **THEN** the system SHALL re-fetch the best-effort match for its stored title, using its watched year as a hint, and overwrite its director, actors, ratings, genre, year, poster, and IMDb ID with the new result

#### Scenario: Calendar entry re-checked before calling OMDb

- **WHEN** a visitor refreshes a logged viewing
- **THEN** the system SHALL re-fetch that viewing's current CalDAV entry first, and SHALL write any subsequent OMDb match on top of that freshly-fetched entry's fields, not a possibly-stale in-memory copy

#### Scenario: Already matched elsewhere since the list loaded

- **WHEN** a visitor refreshes a logged viewing and its freshly-fetched CalDAV entry already has both an IMDb ID and a poster
- **THEN** the system SHALL skip the OMDb call entirely and report the entry as already up to date

#### Scenario: An IMDb link alone isn't a confident match

- **WHEN** a visitor refreshes a logged viewing whose only field that looks like an OMDb match is an IMDb ID sourced from the CLI's own DESCRIPTION text, with no poster
- **THEN** the system SHALL still call OMDb, since no actual OMDb lookup — this app's own or the CLI's — has ever run for that viewing

#### Scenario: Matched but missing a poster

- **WHEN** a visitor refreshes a logged viewing whose freshly-fetched CalDAV entry has an IMDb ID and other OMDb-sourced fields (director, actors, genre, year) but no poster
- **THEN** the system SHALL still call OMDb, so a title matched before this field existed, or one OMDb had no poster for at the time, can pick one up

#### Scenario: Watched year doesn't match the film's actual release year

- **WHEN** a visitor refreshes a viewing whose watched year returns no OMDb match for that title
- **THEN** the system SHALL fall back to a plain title search and use that result instead of reporting no match

#### Scenario: No confident match on refresh

- **WHEN** a visitor refreshes a viewing and neither the year-scoped nor the plain title search finds a confident match
- **THEN** the system SHALL follow the movie-log capability's "Disambiguation picker on no confident match" behaviour — a picker when OMDb's search has candidates, otherwise a plain "no match" report

#### Scenario: Refresh also pulls TMDb data when both keys are set

- **WHEN** a visitor with both an OMDb key and a TMDb key set refreshes a viewing, and the refresh resolves an IMDb ID
- **THEN** the system SHALL fetch TMDb's trailer, collection, certification, keywords, and budget/popularity for that IMDb ID, and overwrite actors/website with TMDb's data where TMDb has it

#### Scenario: Refresh with no TMDb key set

- **WHEN** a visitor with an OMDb key but no TMDb key refreshes a viewing
- **THEN** the system SHALL behave exactly as it does today — OMDb only, no TMDb call attempted

#### Scenario: Refresh resolves no IMDb ID

- **WHEN** a visitor with a TMDb key set refreshes a viewing and neither the existing entry nor a fresh OMDb match produces an IMDb ID
- **THEN** the system SHALL NOT attempt any TMDb call for that viewing

### Requirement: Refresh all metadata on screen

The system SHALL let a visitor re-run the Refresh OMDb metadata action
across every logged viewing currently displayed on the overview (the
filtered, sorted set — not the visitor's whole calendar), in one action,
and SHALL report how many succeeded and how many had no match or
failed. The system SHALL only offer this when the visitor has an OMDb
key set.

When the visitor also has a TMDb key set, each viewing refreshed in the
batch that resolves an IMDb ID SHALL also receive the same TMDb
enrichment as the single-viewing refresh (trailer, collection,
certification, keywords, budget/popularity, actors/website overrides).

#### Scenario: Bulk refresh over a filtered set

- **WHEN** a visitor with an OMDb key set refreshes all metadata while a medium filter is applied
- **THEN** the system SHALL refresh only the viewings currently shown under that filter, not the visitor's whole calendar

#### Scenario: Some titles have no match

- **WHEN** a bulk refresh includes a title OMDb has no match for
- **THEN** the system SHALL still refresh every other title and report the count that had no match or failed, rather than aborting the whole batch

#### Scenario: Already-matched titles are skipped

- **WHEN** a visitor runs a bulk refresh and some titles on screen already have both an IMDb ID and OMDb-sourced metadata (a director, actors, genre, year, or poster)
- **THEN** the system SHALL not call OMDb for those titles, leaving them out of the refreshed/missed count, since an actual OMDb lookup has already confirmed the match

#### Scenario: Nothing on screen needs a bulk refresh

- **WHEN** every title currently on screen already has both an IMDb ID and OMDb-sourced metadata
- **THEN** the system SHALL not offer the bulk refresh control at all

#### Scenario: Bulk refresh also pulls TMDb data when both keys are set

- **WHEN** a visitor with both an OMDb key and a TMDb key set runs a bulk refresh, and some viewings in the batch resolve an IMDb ID
- **THEN** the system SHALL fetch TMDb data for each such viewing the same way the single-viewing refresh does, as part of the same batch action

Note: the single per-viewing refresh (above) is unaffected by this —
it stays available on any title regardless of existing metadata, since
it's the deliberate way to correct a stale or wrong match.
