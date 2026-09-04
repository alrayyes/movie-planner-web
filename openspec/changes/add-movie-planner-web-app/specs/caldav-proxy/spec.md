## Purpose

Lets the browser read and write to any CalDAV calendar without every
visitor's calendar server needing to support cross-origin browser
requests, while keeping the operator from ever holding a visitor's
credentials at rest.

## ADDED Requirements

### Requirement: Stateless per-request relay

The system SHALL accept a visitor's CalDAV base URL and credentials on
every proxied request and SHALL NOT persist them beyond that request's
handling.

#### Scenario: Sequential requests

- **WHEN** two separate proxied requests arrive from the same visitor
- **THEN** the system SHALL process each independently using only the credentials included in that request, keeping no session or cache of prior credentials

### Requirement: HTTPS-only CalDAV targets

The system SHALL reject a proxied request whose CalDAV base URL does not
use the `https://` scheme.

#### Scenario: Plain HTTP base URL

- **WHEN** a proxied request specifies a CalDAV base URL starting with `http://`
- **THEN** the system SHALL reject the request with an error explaining HTTPS is required, without attempting to contact the URL

### Requirement: Fixed set of CalDAV operations

The system SHALL expose only a fixed set of CalDAV operations (list
events in a range, get/create/update/delete an event, get/update the
sidecar picklist) and SHALL NOT accept an arbitrary method, path, or URL
from the browser.

#### Scenario: Unsupported operation requested

- **WHEN** the browser requests an operation outside the fixed set
- **THEN** the system SHALL reject the request without making any outbound CalDAV call

### Requirement: Bounded outbound requests

The system SHALL apply a timeout and a response size cap to every
outbound request it makes to a visitor's CalDAV server.

#### Scenario: Unresponsive CalDAV server

- **WHEN** a visitor's CalDAV server does not respond within the proxy's timeout
- **THEN** the system SHALL abort the outbound request and return an error to the browser rather than waiting indefinitely
