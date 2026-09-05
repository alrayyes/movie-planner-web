## ADDED Requirements

### Requirement: Optional coordinate lookup when editing a venue

The system SHALL offer the same optional, skippable address-search
lookup on the edit form that the log form offers, when a visitor changes
a viewing's venue to one with no known coordinates. The system SHALL
save the edit successfully whether or not this lookup is used.

#### Scenario: Editing a viewing to a venue with no known coordinates

- **WHEN** a visitor edits a viewing's venue to one with no known coordinates and uses the address-search lookup to pick a match
- **THEN** the system SHALL attach the resulting coordinates to the edited viewing

#### Scenario: Editing to an already-located venue

- **WHEN** a visitor edits a viewing's venue to one that already has known coordinates from an earlier logged viewing
- **THEN** the system SHALL attach those same coordinates automatically and SHALL NOT prompt for the address-search lookup
