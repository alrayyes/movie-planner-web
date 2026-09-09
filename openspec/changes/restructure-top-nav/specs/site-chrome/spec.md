## Purpose

Defines the app's persistent cross-page navigation shape — what the top nav lists as browsing destinations, where the primary "log a viewing" create action lives, and how low-frequency utility pages are reached — independent of any single page's own content.

## ADDED Requirements

### Requirement: Top nav lists only browsing destinations

The system SHALL list only Viewings, Venues, Calendar, Map, and Settings
in the top navigation, once a visitor has connected credentials. The
system SHALL NOT include "Log a viewing", "Import", or "Activity" as
top-level nav entries.

#### Scenario: Nav contents after connecting

- **WHEN** a visitor has connected credentials and views any page
- **THEN** the top nav SHALL show exactly Viewings, Venues, Calendar, Map, and Settings, in that order

#### Scenario: Nav fits one row on a narrow mobile viewport

- **WHEN** a visitor views the top nav at a narrow mobile viewport (e.g. 375-393px wide)
- **THEN** the system SHALL render all 5 nav entries on a single row, without wrapping

### Requirement: Persistent "Log a viewing" header button

The system SHALL show a "Log a viewing" button in the page header,
distinct from the nav links, on every page once a visitor has connected
credentials, linking to `/log`.

#### Scenario: Log button present from any page

- **WHEN** a visitor views any page other than the pre-connection credentials screen
- **THEN** the system SHALL show a "Log a viewing" button in the header, separate from the nav link list

### Requirement: Import and Activity reached via Settings

The system SHALL provide links from the Settings page to both Import
and Activity, clearly labelled, as their entry point once removed from
the top nav. The system SHALL NOT change `/import` or `/activity`'s own
page behaviour — visiting either URL directly SHALL work exactly as
before.

#### Scenario: Settings links to Import and Activity

- **WHEN** a visitor opens `/settings`
- **THEN** the system SHALL show clearly labelled links to Import and Activity

#### Scenario: Direct URLs still work

- **WHEN** a visitor navigates directly to `/import` or `/activity` (a bookmark, a typed URL)
- **THEN** the system SHALL render that page exactly as it did before this change
