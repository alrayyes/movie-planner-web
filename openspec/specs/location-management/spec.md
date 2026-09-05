## Purpose

Lets a visitor maintain the medium and venue picklists used when logging
a viewing, stored portably inside their own CalDAV calendar rather than
tied to one browser or device.

## Requirements

### Requirement: Picklists stored as a sidecar CalDAV object

The system SHALL store the visitor's medium and venue picklists as a
single VJOURNAL calendar object with a fixed, well-known UID in the
visitor's CalDAV collection, encoded in its plain-text DESCRIPTION field.

#### Scenario: First venue added

- **WHEN** a visitor adds a venue and no sidecar VJOURNAL yet exists in their calendar
- **THEN** the system SHALL create the sidecar VJOURNAL with that venue in its picklist

### Requirement: Picklists usable from the log form

The system SHALL offer the visitor's stored media and venues as choices
when logging a viewing.

#### Scenario: Logging with an existing venue

- **WHEN** a visitor opens the log form and has previously added venues
- **THEN** the system SHALL offer those venues as selectable choices

### Requirement: Picklists usable when editing

The system SHALL offer the visitor's stored venues as choices when
editing a logged viewing's venue on the movie-details page, the same
as the log form already does.

#### Scenario: Editing with an existing venue

- **WHEN** a visitor opens the edit form on the movie-details page and has previously added venues
- **THEN** the system SHALL offer those venues as selectable choices for the venue field

### Requirement: Venues overview page

The system SHALL provide a `/venues` page listing every venue that
either appears on a logged viewing or is in the visitor's picklist (a
CalDAV entry not logged through this app's own log form, such as one
created by the CLI, carries a venue that was never typed into this
app and so was never added to the picklist), alongside a count of
logged viewings at that venue, computed over the visitor's whole
history rather than the calendar overview's narrower default window.
A venue with zero logged viewings SHALL still be listed, with a count
of zero, rather than omitted. A venue appearing in both sources SHALL
be listed exactly once.

#### Scenario: Venues listed with counts

- **WHEN** a visitor with logged viewings at more than one venue opens `/venues`
- **THEN** the system SHALL list every known venue with a count of logged viewings at each

#### Scenario: Venue with no viewings

- **WHEN** a venue exists in the picklist but has no logged viewings
- **THEN** the system SHALL still list it, with a count of zero

#### Scenario: Venue only known from a calendar entry

- **WHEN** a logged viewing has a venue that was never added to the picklist (for example, an entry logged by the CLI)
- **THEN** the system SHALL still list that venue, with its real count

### Requirement: Missing or unparsable sidecar degrades gracefully

The system SHALL treat a missing or unparsable sidecar VJOURNAL as an
empty picklist rather than failing.

#### Scenario: Corrupted sidecar content

- **WHEN** the sidecar VJOURNAL's DESCRIPTION field cannot be parsed as the expected picklist format
- **THEN** the system SHALL present empty media/venue picklists rather than showing an error that blocks logging
