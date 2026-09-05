## Purpose

Lets a visitor connect their own CalDAV calendar (and optionally OMDb) to
the app, and change those details later, without the operator ever
storing them.

## Requirements

### Requirement: First-load credential capture

The system SHALL show a credentials screen as the first thing a visitor
with no stored credentials sees, before any calendar data is requested.

#### Scenario: No stored credentials

- **WHEN** a visitor loads the app in a browser with no previously stored credentials
- **THEN** the system SHALL display a form for CalDAV server URL, username, password, and an optional OMDb API key, and SHALL NOT attempt to load calendar data until credentials are submitted

### Requirement: Credentials stored only in the visitor's browser

The system SHALL persist submitted credentials only in the visitor's own
browser storage and SHALL NOT transmit or persist them to any
server-side store outside the lifetime of a single proxied request.

#### Scenario: Returning visitor

- **WHEN** a visitor who previously submitted credentials reloads the app
- **THEN** the system SHALL read the stored credentials from browser storage and SHALL NOT show the first-load credentials screen again

### Requirement: Settings screen for editing credentials

The system SHALL provide a settings screen where a visitor with stored
credentials can view and change the CalDAV URL, username, password, and
OMDb API key.

#### Scenario: Update CalDAV password

- **WHEN** a visitor changes their CalDAV password on the settings screen and saves
- **THEN** the system SHALL overwrite the stored password and SHALL use the new password for subsequent CalDAV requests

### Requirement: OMDb API key is optional

The system SHALL allow a visitor to submit credentials with no OMDb API
key set, and SHALL NOT block CalDAV functionality on its absence.

#### Scenario: No OMDb key set

- **WHEN** a visitor logs a viewing without an OMDb API key stored
- **THEN** the system SHALL save the viewing without ratings enrichment rather than failing the submission

### Requirement: OMDb lookups can be paused without clearing the key

The system SHALL let a visitor pause OMDb lookups independently of the
stored API key, so they can stay under OMDb's daily rate limit while
logging or importing a batch of viewings, and SHALL treat "paused" the
same as "no key set" for every action that calls OMDb (logging, single
refresh, refresh all) — no network request to OMDb at all while paused.

#### Scenario: Logging while paused

- **WHEN** a visitor has an OMDb API key stored but has paused lookups, and logs a viewing
- **THEN** the system SHALL save the viewing without an OMDb call and without a disambiguation picker

#### Scenario: Refresh controls hidden while paused

- **WHEN** a visitor has paused OMDb lookups
- **THEN** the overview and movie-details pages SHALL NOT show a Refresh or Refresh-all control, the same as if no key were set
