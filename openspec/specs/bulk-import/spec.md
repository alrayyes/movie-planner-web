## Purpose

Lets a visitor bring an existing CSV or JSON export of viewings into
their calendar in one step, matching the CLI's `import` command, and
lets them export their own calendar back out to that same format —
including OMDb-derived metadata, not just the CLI's minimal fields —
so a visitor can move between browsers/devices without re-running
OMDb lookups, or hand a file to the CLI (or any other tool) that
understands the same shape.

## Requirements

### Requirement: CSV/JSON import

The system SHALL accept a CSV or JSON file using the same fields as the
CLI's import format and SHALL create a CalDAV event for each viewing it
contains.

#### Scenario: Valid import file

- **WHEN** a visitor uploads a CSV file with viewings in the CLI's import format
- **THEN** the system SHALL create a corresponding CalDAV event for each row

### Requirement: Duplicate detection on import

The system SHALL detect likely duplicate viewings during import (same
normalized title, same day) against both the file being imported and the
visitor's existing calendar, and SHALL ask for confirmation before
writing a likely duplicate. This applies only to a row with no `uid`,
or whose `uid` doesn't match any existing entry — see "Updating an
existing entry by uid" below for a row whose `uid` does match.

#### Scenario: Duplicate within existing calendar

- **WHEN** an imported viewing has the same normalized title and date as an already-logged viewing
- **THEN** the system SHALL flag it as a likely duplicate and ask for confirmation before creating a new event

### Requirement: Export as JSON

The system SHALL let a visitor download their whole logged history —
not merely the calendar overview's currently-filtered or paginated
set — as a JSON array, one object per viewing, carrying every
`LoggedViewing` field (including OMDb-derived metadata) using the same
field names the extended-import requirement below reads, so the file
is directly re-importable with no data loss.

#### Scenario: Export covers the whole history, not the active filter

- **WHEN** a visitor chooses "Export as JSON" while a date-range or medium filter is applied on the overview
- **THEN** the system SHALL still export every viewing in the visitor's whole history, not just what the active filter currently shows

#### Scenario: Export carries OMDb-derived metadata

- **WHEN** a visitor exports a viewing that has OMDb-derived metadata (poster, director, actors, genre, ratings)
- **THEN** the exported row SHALL carry those fields, not just the CLI's minimal import fields

### Requirement: Extended-field JSON import

The system SHALL accept, on JSON import, every field this app's own
export produces (OMDb-derived metadata and a `uid`) in addition to the
CLI's minimal fields, using the CLI's own canonical field names, and
SHALL carry the OMDb-derived fields onto a newly-created CalDAV event
unchanged, without a fresh OMDb lookup for that row. A minimal-format
file (no OMDb fields, no `uid`) SHALL keep working exactly as the
CSV/JSON import requirement above describes.

#### Scenario: Re-imported OMDb metadata needs no fresh OMDb call

- **WHEN** a visitor imports a JSON file produced by this app's own export, and none of its rows match an existing entry's `uid`
- **THEN** the system SHALL create each row's CalDAV event with its OMDb-derived fields carried over unchanged, and SHALL NOT call OMDb for those rows

### Requirement: Updating an existing entry by uid

The system SHALL treat an imported row whose `uid` matches an existing
CalDAV entry as a candidate update to that entry rather than a new
create, and SHALL only ever propose a change for a field the row
actually specifies and that genuinely differs from the entry's current
value — a field the row leaves unset is left alone, never cleared. The
visitor SHALL see every proposed change listed field by field (old
value, new value), each with its own checkbox to approve individually,
before anything is written, and only the approved fields SHALL be
written. A row whose `uid` matches but has no actual differences SHALL
make no request at all.

#### Scenario: Reviewing and approving specific field changes

- **WHEN** a visitor imports a JSON file where a row's `uid` matches an existing entry and some of its fields differ
- **THEN** the system SHALL list each differing field with its old and new value and its own checkbox, and on import SHALL write only the fields the visitor left checked, to that existing entry — never as a new event

#### Scenario: A field the row doesn't specify is left untouched

- **WHEN** an imported row's `uid` matches an existing entry, and the row doesn't specify a given field at all
- **THEN** the system SHALL NOT propose clearing or changing that field, regardless of what the existing entry currently holds

#### Scenario: No actual differences, no request

- **WHEN** an imported row's `uid` matches an existing entry and every field the row specifies already matches
- **THEN** the system SHALL make no update request for that row
