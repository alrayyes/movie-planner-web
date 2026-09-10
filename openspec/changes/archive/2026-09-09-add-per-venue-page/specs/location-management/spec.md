## MODIFIED Requirements

### Requirement: Venues overview page

The system SHALL provide a `/venues` page listing every venue that
either appears on a logged viewing or is in the visitor's picklist (a
CalDAV entry not logged through this app's own log form, such as one
created by the CLI, carries a venue that was never typed into this
app and so was never added to the picklist), alongside a count of
logged viewings at that venue, computed by default over the visitor's
whole history rather than the calendar overview's narrower default
window. A venue with zero logged viewings SHALL still be listed, with
a count of zero, rather than omitted. A venue appearing in both
sources SHALL be listed exactly once.

#### Scenario: Venues listed with counts

- **WHEN** a visitor with logged viewings at more than one venue opens `/venues`
- **THEN** the system SHALL list every known venue with a count of logged viewings at each

#### Scenario: Venue with no viewings

- **WHEN** a venue exists in the picklist but has no logged viewings
- **THEN** the system SHALL still list it, with a count of zero

#### Scenario: Venue only known from a calendar entry

- **WHEN** a logged viewing has a venue that was never added to the picklist (for example, an entry logged by the CLI)
- **THEN** the system SHALL still list that venue, with its real count

#### Scenario: A venue links to its filtered viewings

- **WHEN** a visitor clicks a venue name on `/venues`
- **THEN** the system SHALL take them to the venue-detail capability's own `/venue?venue=<value>` page, not the calendar overview

#### Scenario: A filter submitted before the previous load finishes doesn't get clobbered by it

- **WHEN** a new reload of `/venues` starts while a previous one is still in flight
- **THEN** the system SHALL cancel that previous load rather than let its result overwrite the newer one's own result once it eventually resolves
