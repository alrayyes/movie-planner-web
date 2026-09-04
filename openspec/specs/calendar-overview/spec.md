## Purpose

Gives a visitor a clean way to browse and filter everything they've
logged, showing the metadata the CLI already captures for each viewing.

## Requirements

### Requirement: Overview lists all logged viewings with full metadata

The system SHALL display, for each logged viewing, at minimum its title,
start and end time, medium, venue, and any available ratings/director/
actor metadata.

#### Scenario: Viewing with full metadata

- **WHEN** a visitor opens the overview and has a logged viewing with metadata enriched from OMDb
- **THEN** the system SHALL display its title, start/end time, cinema/venue, director, actors, and ratings

### Requirement: Overview defaults to most-recently-watched first

The system SHALL sort the overview by start date descending by
default, so the most recently watched viewing appears first, and SHALL
preserve that order under a medium filter.

#### Scenario: Default ordering

- **WHEN** a visitor opens the overview with multiple logged viewings and no explicit sort applied
- **THEN** the system SHALL display them ordered by start date descending

### Requirement: Overview filters by date range and medium

The system SHALL let a visitor filter the overview by a date range and
by medium, matching the filters the CLI's `list` command supports.

#### Scenario: Filter by month and medium

- **WHEN** a visitor filters the overview to a specific month and to medium "cinema"
- **THEN** the system SHALL display only logged viewings within that month whose medium is "cinema"

### Requirement: Overview reflects the visitor's own calendar

The system SHALL populate the overview from the CalDAV calendar
identified by the visitor's own stored credentials, not from any other
visitor's data.

#### Scenario: Two visitors, two calendars

- **WHEN** two different visitors load the overview with different stored CalDAV credentials
- **THEN** each SHALL see only the viewings logged in their own calendar
