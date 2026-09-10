## MODIFIED Requirements

### Requirement: Refresh all metadata on screen

The system SHALL let a visitor re-run the Refresh OMDb metadata action
across every logged viewing currently displayed on the overview they're
using — the calendar overview's filtered, sorted set, or the
missing-data overview's currently-filtered set — not the visitor's
whole calendar, in one action, and SHALL report how many succeeded and
how many had no match or failed. The system SHALL only offer this when
the visitor has an OMDb key set.

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

Note: the single per-viewing refresh (above) is unaffected by this —
it stays available on any title regardless of existing metadata, since
it's the deliberate way to correct a stale or wrong match.
