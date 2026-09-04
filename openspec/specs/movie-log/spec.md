## Purpose

Lets a visitor log a viewing from a form or a Pathé booking email,
matching the CLI's `log` and `from-pathe-email` commands, with
best-effort ratings enrichment.

## Requirements

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

The system SHALL, when an OMDb API key is stored, look up a
best-matching result for a logged title and attach it to the entry
automatically, without prompting the visitor to disambiguate. This
holds for the successful case only: a confident single match always
attaches without a prompt.

#### Scenario: Confident single match

- **WHEN** a logged title's lookup finds a single confident OMDb match
- **THEN** the system SHALL attach it automatically, with no disambiguation prompt; a visitor who still gets a wrong match SHALL be able to correct it by adjusting the logged title (movie-editing capability) to something OMDb's search resolves more precisely, then refreshing — the OMDb-sourced fields themselves aren't directly editable, since re-running the lookup against the same unchanged title would just repeat the same match

### Requirement: Disambiguation picker on no confident match

The system SHALL, when the best-effort lookup finds no confident
match for a logged (or refreshed) title, search OMDb for candidate
titles and, if any are found, show the visitor a picker listing each
candidate's poster, title, and release year, rather than silently
logging the entry with no metadata. Selecting a candidate SHALL fetch
that title's full details and attach them, the same as an automatic
match would. The system SHALL let the visitor dismiss the picker and
continue without OMDb metadata, matching the outcome of finding no
candidates at all.

#### Scenario: No confident match, candidates found

- **WHEN** a visitor with an OMDb key set logs or refreshes a title with no single confident OMDb match, and OMDb's search returns candidates
- **THEN** the system SHALL show a picker of those candidates' posters, titles, and years, and attach the visitor's chosen candidate's full details on selection

#### Scenario: No candidates at all

- **WHEN** a visitor with an OMDb key set logs or refreshes a title OMDb's search returns no candidates for
- **THEN** the system SHALL leave the entry without OMDb metadata, with no picker shown, matching the CLI's original best-effort-or-nothing behaviour

#### Scenario: Picker dismissed

- **WHEN** a visitor dismisses the disambiguation picker without choosing a candidate
- **THEN** the system SHALL leave the entry without OMDb metadata, the same as if no candidates had been found
