## Purpose

Lets a visitor maintain the medium and venue picklists used when logging
a viewing, stored portably inside their own CalDAV calendar rather than
tied to one browser or device.

## ADDED Requirements

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

### Requirement: Missing or unparsable sidecar degrades gracefully

The system SHALL treat a missing or unparsable sidecar VJOURNAL as an
empty picklist rather than failing.

#### Scenario: Corrupted sidecar content

- **WHEN** the sidecar VJOURNAL's DESCRIPTION field cannot be parsed as the expected picklist format
- **THEN** the system SHALL present empty media/venue picklists rather than showing an error that blocks logging
