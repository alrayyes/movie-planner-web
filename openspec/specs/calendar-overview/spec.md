## Purpose

Gives a visitor a clean way to browse and filter everything they've
logged, showing the metadata the CLI already captures for each viewing.

## Requirements

### Requirement: Overview lists logged viewings, linking out for full metadata

The system SHALL display, for each logged viewing, its poster
thumbnail (if any), title, release year (if any), a merged start-end
period, and venue, as a fixed set of columns — narrow and predictable
enough to fit a phone screen without horizontal scroll. Medium,
director, actors, genre, and ratings are not overview columns; the
movie-details capability's own page is where a visitor sees those, one
click away via the title.

#### Scenario: Viewing with full metadata

- **WHEN** a visitor opens the overview and has a logged viewing with metadata enriched from OMDb
- **THEN** the system SHALL display its title, release year, start-end period, cinema/venue, and poster thumbnail, and SHALL link the title to that viewing's details page for the rest

### Requirement: Editing and deleting live only on the details page

The system SHALL NOT offer edit or delete controls on the overview —
those live only on the movie-details page, reached via the title link,
which keeps the overview to a fixed, narrow column count.

#### Scenario: No edit or delete on the overview

- **WHEN** a visitor opens the overview
- **THEN** the system SHALL show no edit or delete control on any row, only a title link to that viewing's details page

### Requirement: Dates and times use a consistent Dutch, 24-hour format

The system SHALL render every displayed date and time (not a native
form input) in Dutch (nl-NL) formatting with a 24-hour clock, so a
visitor sees a consistent format regardless of their own browser's
locale.

#### Scenario: Overview period rendering

- **WHEN** the overview renders a logged viewing's start-end period
- **THEN** the system SHALL show it in nl-NL formatting with a 24-hour clock, merging the date and time range into one column when start and end fall on the same day

### Requirement: Poster thumbnails are large enough to recognize

The system SHALL render the overview's poster thumbnail large enough to
recognize a film at a glance, not merely as a decorative marker.

#### Scenario: Poster thumbnail size

- **WHEN** a visitor opens the overview and has a logged viewing with a poster
- **THEN** the system SHALL render that poster substantially larger than a
  small decorative icon, while the overview still fits a phone screen
  without horizontal scroll

#### Scenario: Non-portrait source poster

- **WHEN** a logged viewing's poster is a landscape or square image rather
  than a normal portrait poster
- **THEN** the system SHALL crop it to the same poster-shaped box every
  other thumbnail uses, not stretch or squeeze it to its own shape

### Requirement: Overview cross-links to external sources

The system SHALL link a logged viewing's title out to IMDb, Rotten
Tomatoes, and Letterboxd. Only IMDb exposes a stable per-title ID
(`imdbID`, from OMDb); Rotten Tomatoes and Letterboxd links are
constructed searches, not a guarantee of the exact match.

#### Scenario: Cross-links shown for an enriched viewing

- **WHEN** a visitor opens the overview and has a logged viewing enriched with an IMDb ID
- **THEN** the system SHALL show a link to that title's IMDb page, alongside constructed Rotten Tomatoes and Letterboxd search links

### Requirement: Overview defaults to most-recently-watched first

The system SHALL sort the overview by start date descending by
default, so the most recently watched viewing appears first, and SHALL
preserve that order under a medium filter.

#### Scenario: Default ordering

- **WHEN** a visitor opens the overview with multiple logged viewings and no explicit sort applied
- **THEN** the system SHALL display them ordered by start date descending

### Requirement: Overview paginates a large result set

The system SHALL bound how many logged viewings render at once to a fixed
page size, with a way to reach the rest, rather than rendering the entire
filtered result set in one table.

#### Scenario: More viewings than fit on one page

- **WHEN** a visitor's selected date range and medium filter return more
  viewings than fit on one page
- **THEN** the system SHALL show only the first page's worth, with a control
  to reach later pages

#### Scenario: Pagination resets on a new filter

- **WHEN** a visitor changes the date range or medium filter
- **THEN** the system SHALL reset to the first page of the new result set

#### Scenario: Bulk refresh scoped to the current page

- **WHEN** a visitor on a later page uses "Refresh all metadata"
- **THEN** the system SHALL refresh only the viewings on that page, not the
  whole filtered result set

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
