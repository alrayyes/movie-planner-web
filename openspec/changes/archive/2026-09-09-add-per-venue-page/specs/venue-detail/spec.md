## Purpose

Gives a visitor a dedicated, filter-free page showing everything logged at one venue — results, pagination, and a map — reached from the Venues page, without the main overview's filter chrome that doesn't apply to a single-venue view.

## ADDED Requirements

### Requirement: Dedicated per-venue page

The system SHALL provide a `/venue` page that reads a venue from a
`venue` query parameter and shows only that venue's logged viewings —
a results table, pagination, and a map of that venue's own pin(s) —
with no filter controls of any kind. A literal per-venue path segment
(e.g. `/venue/<id>`) is not offered, since this app is fully static and
a visitor's venue names are private data unknowable at build time,
same reasoning as the existing `/movie?uid=...` details page.

#### Scenario: Viewing a single venue

- **WHEN** a visitor opens `/venue?venue=<value>` for a venue with logged viewings
- **THEN** the system SHALL show only that venue's viewings in the results table, with pagination and a map, and no filter controls

#### Scenario: No filter controls at all

- **WHEN** a visitor is on `/venue`
- **THEN** the system SHALL NOT offer any way to change or clear the venue, or to filter by any other field

#### Scenario: Unknown venue

- **WHEN** a visitor opens `/venue` with a `venue` value that matches no logged viewing
- **THEN** the system SHALL show an empty-results state, not an error

### Requirement: Breadcrumb shows the venue's trimmed display name

The system SHALL show a breadcrumb trail of "Home / Venues / {venue}"
on `/venue`, where `{venue}` is the venue's trimmed display name (name
plus known city, per the venue-display trimming rule — for example,
"City, Amsterdam"), not its raw stored value.

#### Scenario: Breadcrumb on the per-venue page

- **WHEN** a visitor opens `/venue?venue=<value>` for a known venue
- **THEN** the system SHALL show a breadcrumb reading "Home / Venues / {trimmed name and city}"

### Requirement: Venue links route to the per-venue page

The system SHALL take a visitor to `/venue?venue=<value>` when they
click a venue name on `/venues`, rather than the main overview's
pre-filtered view.

#### Scenario: Clicking a venue on the Venues page

- **WHEN** a visitor clicks a venue name on `/venues`
- **THEN** the system SHALL navigate them to `/venue?venue=<that venue's value>`
