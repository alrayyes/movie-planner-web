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
already-logged viewing, using its stored title, and SHALL overwrite the
CalDAV event's OMDb-sourced fields with the new result. The system SHALL
only offer this when the visitor has an OMDb key set.

#### Scenario: Stale metadata refreshed

- **WHEN** a visitor with an OMDb key set refreshes a logged viewing
- **THEN** the system SHALL re-fetch the best-effort match for its stored title and overwrite its director, actors, ratings, genre, year, poster, and IMDb ID with the new result

### Requirement: Delete a logged viewing

The system SHALL let a visitor delete an existing logged viewing,
removing the corresponding CalDAV event.

#### Scenario: Delete confirmation

- **WHEN** a visitor requests deletion of a logged viewing
- **THEN** the system SHALL ask for confirmation before removing the CalDAV event
