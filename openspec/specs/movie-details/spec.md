## Purpose

Gives a visitor a dedicated page per logged viewing, showing the full
OMDb metadata the overview's own row deliberately leaves out (see
calendar-overview's "Overview lists logged viewings, linking out for
full metadata"), and the same edit/delete/refresh actions the overview
row offers.

## Requirements

### Requirement: Details page shows a viewing's full metadata

The system SHALL show, for a logged viewing reached from the overview's
title link, its poster, title, release year, start/end time, medium,
venue, director, actors, genre, ratings, and personal notes (whichever
of these are present), plus the same IMDb/Rotten Tomatoes/Letterboxd
cross-links the overview shows.

#### Scenario: Full metadata on the details page

- **WHEN** a visitor opens a logged viewing's details page
- **THEN** the system SHALL display every available field for that viewing, not just the subset the overview's own row shows

#### Scenario: Notes shown when present

- **WHEN** a logged viewing has personal notes attached (set by the CLI, or previously by this app)
- **THEN** the details page SHALL display them
- **AND WHEN** a viewing has no notes
- **THEN** the details page SHALL show no notes field at all, rather than an empty one

#### Scenario: IMDb/Letterboxd flagged as not linked without a real match

- **WHEN** a visitor opens a logged viewing's details page and it has no real `imdbId` and/or no real `letterboxdUrl` (only a constructed search link)
- **THEN** the system SHALL show "IMDb not linked" as plain text in place of the omitted IMDb link, and/or label the Letterboxd link "Letterboxd (search)", so a visitor can tell a confirmed match from a guess

### Requirement: Details page offers edit, refresh, and delete

The system SHALL let a visitor edit the viewing's own fields, refresh
its OMDb metadata (when an OMDb key is set), and delete it, directly
from the details page — the same actions the overview row offers,
governed by the same rules (movie-editing capability).

#### Scenario: Edit from the details page

- **WHEN** a visitor edits a viewing's own fields from its details page
- **THEN** the system SHALL write the change and reflect it on the same page

### Requirement: Details page handles a missing viewing gracefully

The system SHALL show a clear "not found" state, with a link back to
the overview, when the details page is loaded with no `uid` in its URL
or a `uid` that doesn't resolve to an existing viewing — never an
unhandled error.

#### Scenario: Unknown or missing uid

- **WHEN** a visitor loads the details page with a `uid` that doesn't exist, or with no `uid` at all
- **THEN** the system SHALL show a "not found" message and a link back to the overview, rather than an error
