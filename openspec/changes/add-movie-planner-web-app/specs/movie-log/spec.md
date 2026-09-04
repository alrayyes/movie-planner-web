## Purpose

Lets a visitor log a viewing from a form or a Pathé booking email,
matching the CLI's `log` and `from-pathe-email` commands, with
best-effort ratings enrichment.

## ADDED Requirements

### Requirement: Manual log form

The system SHALL let a visitor log a viewing by submitting title, date,
start/end time, medium, and venue, and SHALL write it as a CalDAV event.

#### Scenario: Minimal manual log

- **WHEN** a visitor submits the log form with title, date, start/end time, and medium
- **THEN** the system SHALL create a corresponding CalDAV event in the visitor's calendar

### Requirement: Pathé email parsing

The system SHALL let a visitor paste or upload a Pathé booking
confirmation email and SHALL parse title, date, times, cinema, and
booking number from it, showing the parsed result for confirmation
before writing.

#### Scenario: Re-submitted booking confirmation

- **WHEN** a visitor submits a Pathé confirmation email whose booking number matches an already-logged viewing
- **THEN** the system SHALL update that existing entry instead of creating a duplicate

### Requirement: Best-effort OMDb enrichment

The system SHALL, when an OMDb API key is stored, look up ratings for a
logged title and attach the best-matching result to the entry without
prompting the visitor to disambiguate between multiple candidates.

#### Scenario: Ambiguous title match

- **WHEN** a logged title matches more than one OMDb result
- **THEN** the system SHALL attach its best-effort match automatically, and the visitor SHALL be able to correct it afterward via editing the entry
