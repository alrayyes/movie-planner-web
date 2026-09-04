## Purpose

Lets a visitor correct or remove an already-logged viewing, matching the
CLI's `update` and `delete` commands.

## Requirements

### Requirement: Update a logged viewing

The system SHALL let a visitor edit any field of an existing logged
viewing and SHALL write the change to the corresponding CalDAV event.

#### Scenario: Correct a mismatched OMDb match

- **WHEN** a visitor edits a logged viewing's title or ratings after a best-effort OMDb match guessed wrong
- **THEN** the system SHALL update the CalDAV event to reflect the correction

### Requirement: Delete a logged viewing

The system SHALL let a visitor delete an existing logged viewing,
removing the corresponding CalDAV event.

#### Scenario: Delete confirmation

- **WHEN** a visitor requests deletion of a logged viewing
- **THEN** the system SHALL ask for confirmation before removing the CalDAV event
