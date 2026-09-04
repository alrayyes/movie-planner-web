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
already-logged viewing, using its stored title and the year it was
watched as a fuzzy disambiguation hint, and SHALL overwrite the CalDAV
event's OMDb-sourced fields with the new result. The system SHALL only
offer this when the visitor has an OMDb key set. A year-scoped search
that finds nothing SHALL fall back to a plain title search rather than
reporting no match, since a re-watch of an older film is logged in a
different year than its actual release.

#### Scenario: Stale metadata refreshed

- **WHEN** a visitor with an OMDb key set refreshes a logged viewing
- **THEN** the system SHALL re-fetch the best-effort match for its stored title, using its watched year as a hint, and overwrite its director, actors, ratings, genre, year, poster, and IMDb ID with the new result

#### Scenario: Watched year doesn't match the film's actual release year

- **WHEN** a visitor refreshes a viewing whose watched year returns no OMDb match for that title
- **THEN** the system SHALL fall back to a plain title search and use that result instead of reporting no match

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

### Requirement: Delete a logged viewing

The system SHALL let a visitor delete an existing logged viewing,
removing the corresponding CalDAV event.

#### Scenario: Delete confirmation

- **WHEN** a visitor requests deletion of a logged viewing
- **THEN** the system SHALL ask for confirmation before removing the CalDAV event
