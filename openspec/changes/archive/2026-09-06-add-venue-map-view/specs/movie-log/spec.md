## ADDED Requirements

### Requirement: Optional coordinate lookup when logging at a new venue

The system SHALL offer an optional, skippable address-search lookup to
attach coordinates to a viewing's venue when logging it, if that venue
has no known coordinates from an earlier logged viewing. The system
SHALL log the viewing successfully whether or not this lookup is used.

#### Scenario: Logging at a venue with no known coordinates

- **WHEN** a visitor logs a viewing at a venue with no known coordinates and uses the address-search lookup to pick a match
- **THEN** the system SHALL attach the resulting coordinates to the logged viewing

#### Scenario: Skipping the lookup

- **WHEN** a visitor logs a viewing at a venue with no known coordinates and does not use the address-search lookup
- **THEN** the system SHALL log the viewing successfully with no coordinates attached

### Requirement: Reuses a venue's known coordinates instead of re-prompting

The system SHALL reuse the coordinates from an earlier logged viewing at
the same venue, without prompting for the address-search lookup again,
when logging a new viewing at a venue that already has known
coordinates.

#### Scenario: Logging again at an already-located venue

- **WHEN** a visitor logs a viewing at a venue that already has known coordinates from an earlier logged viewing
- **THEN** the system SHALL attach those same coordinates automatically and SHALL NOT prompt for the address-search lookup
