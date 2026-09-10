## Purpose

Surfaces logged viewings whose OMDb-sourced metadata is incomplete —
usually the sign of a wrong or missing title match — so a visitor can
find and fix them without opening every viewing's details page.

## ADDED Requirements

### Requirement: Overview lists viewings missing OMDb-sourced data

The system SHALL display, for each logged viewing missing at least one
of an IMDb match, poster, director, actors, genre, or synopsis, its
poster thumbnail (if any), title, watched date, and which of those
fields it's specifically missing. The system SHALL scan the visitor's
whole history, not a recent window, since a wrong match can date back
to any point in the log.

#### Scenario: Viewing with a partial match

- **WHEN** a visitor opens the missing-data overview and has a logged
  viewing with an IMDb ID and poster but no genre
- **THEN** the system SHALL show that viewing's poster thumbnail, title,
  and watched date, with "Genre" listed among its missing fields

#### Scenario: Viewing with no OMDb match at all

- **WHEN** a visitor has a logged viewing with no IMDb ID
- **THEN** the system SHALL list it with "No IMDb match" among its
  missing fields, alongside every other field that's consequently also
  unset

#### Scenario: No viewings are missing anything

- **WHEN** a visitor opens the missing-data overview and every logged
  viewing already has an IMDb match, poster, director, actors, genre,
  and synopsis
- **THEN** the system SHALL show an empty-state message rather than an
  empty table

### Requirement: Filterable by which kind of data is missing

The system SHALL offer one checkbox per trackable field (IMDb match,
poster, director, actors, genre, synopsis), all checked by default, and
SHALL include a viewing in the overview when it is missing at least one
of the checked fields (an OR across the checked set, not a requirement
that every checked field be missing at once).

#### Scenario: Narrowing to one field

- **WHEN** a visitor unchecks every field except "Genre"
- **THEN** the system SHALL show only viewings missing a genre,
  regardless of whether they're also missing other fields

#### Scenario: All fields checked by default

- **WHEN** a visitor opens the missing-data overview for the first time
- **THEN** the system SHALL show every checkbox checked, and SHALL list
  every viewing missing at least one of the six tracked fields

### Requirement: Missing-data overview offers the same refresh actions as the calendar overview

The system SHALL offer the same per-row "Refresh metadata" control and
"Refresh all metadata" bulk control, with the same disambiguation
picker, busy states, and OMDb-key gating, that the calendar overview
offers — see the movie-editing capability's "Refresh OMDb metadata",
"Refresh all metadata on screen", and "Visible busy state while a
refresh is in flight" requirements, which this page is a second surface
for.

#### Scenario: Fixing a wrong match from the missing-data overview

- **WHEN** a visitor refreshes a row on the missing-data overview and
  OMDb returns a confident new match
- **THEN** the system SHALL overwrite that viewing's OMDb-sourced
  fields and SHALL remove it from the list if it no longer matches any
  checked missing-data filter

#### Scenario: Bulk refresh scoped to the current filter

- **WHEN** a visitor uses "Refresh all metadata" while only "Poster" is
  checked
- **THEN** the system SHALL refresh only the viewings currently shown
  under that filter, not every viewing missing any field

### Requirement: Missing-data overview paginates a large result set

The system SHALL bound how many viewings render at once to a fixed page
size, with a way to reach the rest, and SHALL reset to the first page
when the missing-data filter changes.

#### Scenario: More missing-data viewings than fit on one page

- **WHEN** the current missing-data filter matches more viewings than
  fit on one page
- **THEN** the system SHALL show only the first page's worth, with a
  control to reach later pages

#### Scenario: Pagination resets on a filter change

- **WHEN** a visitor checks or unchecks one of the missing-data
  checkboxes
- **THEN** the system SHALL reset to the first page of the new result
  set

### Requirement: Reachable from Settings, not the top navigation

The system SHALL link to the missing-data overview from the Settings
page's "More" list, alongside Import, Activity, and Docs, rather than
adding a fifth top-navigation entry — matching how those already
low-frequency pages are reached.

#### Scenario: Finding the missing-data overview

- **WHEN** a visitor opens Settings
- **THEN** the system SHALL show a link to the missing-data overview in
  the "More" list, with a short description of what it's for
