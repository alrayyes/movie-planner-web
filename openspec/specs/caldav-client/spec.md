## Purpose

Lets the browser read and write to a visitor's own CalDAV calendar
directly, with no server-side relay of any kind — so no server this
project runs ever holds or even sees a visitor's credentials, not even
transiently.

## Requirements

### Requirement: Direct browser-to-server CalDAV calls

The system SHALL make every CalDAV/WebDAV call directly from the
browser to the visitor's own CalDAV server, using the credentials held
only in that visitor's own browser storage, and SHALL NOT route any such
call through a server this project operates.

#### Scenario: A logged viewing is created

- **WHEN** a visitor logs a viewing
- **THEN** the browser SHALL send the resulting `PUT` request directly to the visitor's own CalDAV server, with no intermediate request to any server this project runs

### Requirement: Cross-origin access requires the visitor's own server to opt in

The system SHALL rely on the visitor's CalDAV server sending CORS
headers permitting this app's origin, and SHALL document the exact
headers and an example reverse-proxy configuration required, since the
app has no way to configure a server it doesn't operate.

#### Scenario: CalDAV server without CORS configured

- **WHEN** a visitor points the app at a CalDAV server that doesn't send the required CORS headers
- **THEN** the browser SHALL block the cross-origin request and the system SHALL surface a readable error rather than a silent failure

### Requirement: HTTPS-only CalDAV targets

The system SHALL reject a CalDAV base URL that does not use the
`https://` scheme, before attempting any request.

#### Scenario: Plain HTTP base URL

- **WHEN** a visitor's stored CalDAV base URL starts with `http://`
- **THEN** the system SHALL reject it with an error explaining HTTPS is required, without attempting to contact the URL

### Requirement: Bounded outbound requests

The system SHALL apply a timeout and a response size cap to every
outbound request it makes to a visitor's CalDAV server, so an
unresponsive or misbehaving server doesn't hang the page indefinitely or
stream an unbounded response into memory.

#### Scenario: Unresponsive CalDAV server

- **WHEN** a visitor's CalDAV server does not respond within the client's timeout
- **THEN** the system SHALL abort the request and surface an error rather than waiting indefinitely

### Requirement: Reads the movie-planner CLI's own calendar format

The system SHALL extract IMDb, Rotten Tomatoes, Metacritic, and
Letterboxd ratings/links, and personal notes, from a VEVENT's
`DESCRIPTION` when this app's own `X-*` metadata properties aren't
present, matching the plain-text format the `movie-planner` CLI writes
there — so a viewing logged by the CLI shows its already-known data
without a fresh OMDb call. This app's own `X-*` properties, when
present, always take priority over `DESCRIPTION` parsing.

#### Scenario: CLI-logged viewing has no X-* properties

- **WHEN** a visitor's calendar has a viewing logged by the CLI, with ratings/links only in its `DESCRIPTION` text
- **THEN** the system SHALL display that title's IMDb/Rotten Tomatoes/Metacritic ratings and its IMDb/Letterboxd links, without calling OMDb

#### Scenario: CLI-logged viewing has a notes line

- **WHEN** a visitor's calendar has a viewing logged by the CLI whose `DESCRIPTION` has a labelled `Notes:` line
- **THEN** the system SHALL parse it as that viewing's notes, distinguishing it from an unlabelled screening-details line the CLI may also write

#### Scenario: Both sources present

- **WHEN** a VEVENT has both this app's own `X-*` metadata and a `DESCRIPTION` with conflicting values
- **THEN** the system SHALL use the `X-*` values
