## Purpose

Lets a visitor bring an existing CSV or JSON export of viewings into
their calendar in one step, matching the CLI's `import` command.

## Requirements

### Requirement: CSV/JSON import

The system SHALL accept a CSV or JSON file using the same fields as the
CLI's import format and SHALL create a CalDAV event for each viewing it
contains.

#### Scenario: Valid import file

- **WHEN** a visitor uploads a CSV file with viewings in the CLI's import format
- **THEN** the system SHALL create a corresponding CalDAV event for each row

### Requirement: Duplicate detection on import

The system SHALL detect likely duplicate viewings during import (same
normalized title, same day) against both the file being imported and the
visitor's existing calendar, and SHALL ask for confirmation before
writing a likely duplicate.

#### Scenario: Duplicate within existing calendar

- **WHEN** an imported viewing has the same normalized title and date as an already-logged viewing
- **THEN** the system SHALL flag it as a likely duplicate and ask for confirmation before creating a new event
