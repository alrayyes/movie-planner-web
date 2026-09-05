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
- **THEN** the system SHALL display its title, release year, start-end period, cinema/venue, and poster thumbnail, and SHALL link both the title and the poster thumbnail to that viewing's details page for the rest

### Requirement: Editing and deleting live only on the details page

The system SHALL NOT offer edit or delete controls on the overview —
those live only on the movie-details page, reached via the title link,
which keeps the overview to a fixed, narrow column count.

#### Scenario: No edit or delete on the overview

- **WHEN** a visitor opens the overview
- **THEN** the system SHALL show no edit or delete control on any row, only a title link to that viewing's details page

### Requirement: Dates and times use a consistent Dutch, 24-hour format, with an English weekday

The system SHALL render every displayed date and time (not a native
form input) in Dutch (nl-NL) day-month-year order with a 24-hour
clock, so a visitor sees a consistent format regardless of their own
browser's locale. The weekday abbreviation on a rendered date SHALL be
in English, not Dutch — a deliberate exception to the rest of the
nl-NL formatting.

#### Scenario: Overview period rendering

- **WHEN** the overview renders a logged viewing's start-end period
- **THEN** the system SHALL show it in nl-NL day-month-year order with a 24-hour clock, merging the date and time range into one column when start and end fall on the same day

#### Scenario: Weekday abbreviation stays English

- **WHEN** the system renders a date that includes a weekday abbreviation
- **THEN** the system SHALL show that abbreviation in English (for example "Wed"), while the day, month and year stay in nl-NL order

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

### Requirement: Overview defaults to most-recently-watched first, and is sortable

The system SHALL sort the overview by start date descending by
default, so the most recently watched viewing appears first, and SHALL
preserve that order under a medium filter. The system SHALL let a
visitor click the Title, When, or Venue column header to sort by it
instead — ascending on the first click of a column, reversing to
descending on a second click of the same column.

#### Scenario: Default ordering

- **WHEN** a visitor opens the overview with multiple logged viewings and no explicit sort applied
- **THEN** the system SHALL display them ordered by start date descending

#### Scenario: Sorting by a column header

- **WHEN** a visitor clicks the "Title" column header
- **THEN** the system SHALL sort the overview alphabetically by title, ascending
- **AND WHEN** the visitor clicks "Title" again
- **THEN** the system SHALL reverse to descending

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

### Requirement: Overview filters by date range, medium, venue, director, actor, and genre

The system SHALL let a visitor filter the overview by a date range, by
medium, and by venue, matching the filters the CLI's `list` command
supports (medium and date range) plus a venue filter of its own, and
by director, actor, and genre. The system SHALL read initial
venue/director/actor/genre filter values from
`venue`/`director`/`actor`/`genre` URL query parameters, so a link
elsewhere in the app can land here pre-filtered, and SHALL show those
values in the filter fields themselves rather than applying them
invisibly. The system SHALL offer medium autocomplete suggestions
drawn from the union of the location-management picklist and the
medium values on the viewings already loaded, so a medium logged only
via the CLI still suggests itself even though it was never typed into
this app's own log form. Director, actor, and genre are multi-value,
comma-separated OMDb fields (unlike venue and medium): the system
SHALL match a viewing when the filter value equals one of its
individually split values exactly, not a substring of the whole
comma-joined field. The system SHALL offer the same kind of
autocomplete suggestions for venue (union of the location-management
picklist and loaded viewings, same as medium) and for director/actor/genre
(every distinct individually-split value on the viewings already
loaded — these have no picklist of their own, being OMDb-derived).

#### Scenario: Filter by month and medium

- **WHEN** a visitor filters the overview to a specific month and to medium "cinema"
- **THEN** the system SHALL display only logged viewings within that month whose medium is "cinema"

#### Scenario: Medium autocomplete includes a CLI-only medium

- **WHEN** a visitor opens the overview and has a logged viewing whose medium was never typed into this app's own log form
- **THEN** the system SHALL still offer that medium as an autocomplete suggestion in the medium filter field

#### Scenario: Filter by venue

- **WHEN** a visitor filters the overview to a specific venue
- **THEN** the system SHALL display only logged viewings at that venue, over whatever the date range already returned

#### Scenario: Arriving pre-filtered by venue

- **WHEN** a visitor opens the overview with a `venue` query parameter set
- **THEN** the system SHALL populate the venue filter field with that value and show only logged viewings at that venue

#### Scenario: Arriving with a carried-over date range

- **WHEN** a visitor opens the overview with `from` and `to` query parameters set
- **THEN** the system SHALL populate the From and To filter fields with those values instead of its own default range, so a link from elsewhere in the app (the venues page's own count, for one) lands on the same result set it was drawn from

#### Scenario: Filter by director, actor or genre matches an exact split value

- **WHEN** a visitor filters the overview to genre "Action", and one logged viewing's genre is "Action, Drama" while another's is "Live Action Adaptation, Comedy"
- **THEN** the system SHALL display only the first viewing, not the second
- **AND WHEN** a visitor filters the overview to director "Denis Villeneuve", and one logged viewing's director is exactly that while another's is "A Denis Villeneuve Impersonator"
- **THEN** the system SHALL display only the first viewing, not the second

#### Scenario: Venue, director, actor and genre autocomplete

- **WHEN** a visitor opens the overview with logged viewings carrying various venues, directors, actors and genres
- **THEN** the system SHALL offer each as an autocomplete suggestion in its own filter field

#### Scenario: Arriving pre-filtered by actor or genre

- **WHEN** a visitor opens the overview with the `actor` or `genre` query parameter set (for example, from a details-page chip)
- **THEN** the system SHALL populate the corresponding filter field with that value and show only logged viewings with that exact actor or genre value

### Requirement: Overview reflects the visitor's own calendar

The system SHALL populate the overview from the CalDAV calendar
identified by the visitor's own stored credentials, not from any other
visitor's data.

#### Scenario: Two visitors, two calendars

- **WHEN** two different visitors load the overview with different stored CalDAV credentials
- **THEN** each SHALL see only the viewings logged in their own calendar
