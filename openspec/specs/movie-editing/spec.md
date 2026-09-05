## Purpose

Lets a visitor correct or remove an already-logged viewing, matching the
CLI's `update` and `delete` commands.

## Requirements

### Requirement: Update a logged viewing's own fields

The system SHALL let a visitor edit a logged viewing's title, start
time, end time, medium, and venue, and SHALL write the change to the
corresponding CalDAV event. The system SHALL NOT offer OMDb-sourced
fields (director, actors, ratings, genre, year, poster, IMDb ID) as
directly editable — see "Refresh OMDb metadata" for how those are
corrected instead, since a value hand-typed there would drift from what
OMDb actually reports and there would be no way to tell the two apart.

#### Scenario: Edit a viewing's own field

- **WHEN** a visitor edits a logged viewing's title, time, medium, or venue
- **THEN** the system SHALL update the CalDAV event to reflect the change, leaving every OMDb-sourced field on that event untouched

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

#### Scenario: Stale metadata refreshed

- **WHEN** a visitor with an OMDb key set refreshes a logged viewing whose calendar entry doesn't yet have an IMDb ID
- **THEN** the system SHALL re-fetch the best-effort match for its stored title, using its watched year as a hint, and overwrite its director, actors, ratings, genre, year, poster, and IMDb ID with the new result

#### Scenario: Calendar entry re-checked before calling OMDb

- **WHEN** a visitor refreshes a logged viewing
- **THEN** the system SHALL re-fetch that viewing's current CalDAV entry first, and SHALL write any subsequent OMDb match on top of that freshly-fetched entry's fields, not a possibly-stale in-memory copy

#### Scenario: Already matched elsewhere since the list loaded

- **WHEN** a visitor refreshes a logged viewing and its freshly-fetched CalDAV entry already has an IMDb ID (matched by the CLI's own sync, or another tab/device, since the overview's list was loaded)
- **THEN** the system SHALL skip the OMDb call entirely and report the entry as already up to date

#### Scenario: Watched year doesn't match the film's actual release year

- **WHEN** a visitor refreshes a viewing whose watched year returns no OMDb match for that title
- **THEN** the system SHALL fall back to a plain title search and use that result instead of reporting no match

#### Scenario: No confident match on refresh

- **WHEN** a visitor refreshes a viewing and neither the year-scoped nor the plain title search finds a confident match
- **THEN** the system SHALL follow the movie-log capability's "Disambiguation picker on no confident match" behaviour — a picker when OMDb's search has candidates, otherwise a plain "no match" report

### Requirement: Refresh all metadata on screen

The system SHALL let a visitor re-run the Refresh OMDb metadata action
across every logged viewing currently displayed on the overview (the
filtered, sorted set — not the visitor's whole calendar), in one action,
and SHALL report how many succeeded and how many had no match or
failed. The system SHALL only offer this when the visitor has an OMDb
key set.

#### Scenario: Bulk refresh over a filtered set

- **WHEN** a visitor with an OMDb key set refreshes all metadata while a medium filter is applied
- **THEN** the system SHALL refresh only the viewings currently shown under that filter, not the visitor's whole calendar

#### Scenario: Some titles have no match

- **WHEN** a bulk refresh includes a title OMDb has no match for
- **THEN** the system SHALL still refresh every other title and report the count that had no match or failed, rather than aborting the whole batch

#### Scenario: Already-matched titles are skipped

- **WHEN** a visitor runs a bulk refresh and some titles on screen already have an IMDb ID
- **THEN** the system SHALL not call OMDb for those titles, leaving them out of the refreshed/missed count, since the calendar entry is already the confirmed match

#### Scenario: Nothing on screen needs a bulk refresh

- **WHEN** every title currently on screen already has an IMDb ID
- **THEN** the system SHALL not offer the bulk refresh control at all

Note: the single per-viewing refresh (above) is unaffected by this —
it stays available on any title regardless of existing metadata, since
it's the deliberate way to correct a stale or wrong match.

### Requirement: Visible busy state while a refresh is in flight

The system SHALL show a visible loading indicator on the triggering
control (a per-row refresh or the bulk "Refresh all metadata" control)
and its affected row(s) while an OMDb refresh request is in flight,
and SHALL disable that control for the duration so it can't be
triggered again mid-request. The busy state SHALL be exposed to
assistive technology (`aria-busy`), not only visually.

#### Scenario: Per-row refresh in flight

- **WHEN** a visitor clicks a per-row Refresh control
- **THEN** the system SHALL disable that control and mark its row as busy until the request resolves, then clear both

#### Scenario: Bulk refresh in flight

- **WHEN** a visitor clicks "Refresh all metadata"
- **THEN** the system SHALL disable that control and mark it as busy until the whole batch resolves, then clear both

### Requirement: Delete a logged viewing

The system SHALL let a visitor delete an existing logged viewing,
removing the corresponding CalDAV event.

#### Scenario: Delete confirmation

- **WHEN** a visitor requests deletion of a logged viewing
- **THEN** the system SHALL ask for confirmation before removing the CalDAV event
