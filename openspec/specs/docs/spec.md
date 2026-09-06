## Purpose

Gives a visitor a usage guide for the app itself — connecting a CalDAV
server, logging a viewing, the calendar overview, import/export, and
keyboard shortcuts — separate from the README's developer-facing setup
instructions, so someone who only wants to use the app isn't sent
through a build toolchain to find out how.

## Requirements

### Requirement: A Starlight-powered docs site is mounted at /docs

The system SHALL render a documentation site at the `/docs` path,
covering: connecting a CalDAV server (including the CORS requirement),
logging a viewing (manual and Pathé email parsing), the calendar
overview and its filters/sorting/actions, the viewing heatmap, venues,
the map, CSV/JSON import/export, and keyboard shortcuts.

#### Scenario: Docs index renders

- **WHEN** a visitor opens `/docs`
- **THEN** the system SHALL render an index page linking to each of the topics above, not a 404

### Requirement: The connect form explains itself before asking for credentials

The system SHALL render a plain-language introduction above the
credentials form on first load, explaining what the app is and what it
does with the CalDAV fields, with links to `/docs/connecting/` and
`/privacy`.

#### Scenario: First-time visitor sees the introduction

- **WHEN** a visitor with no stored credentials opens the app
- **THEN** the system SHALL render the introduction above the form, with working links to `/docs/connecting/` and `/privacy`

### Requirement: The main app's own pages are unaffected

The system SHALL mount the docs site at the `/docs` subpath only,
without changing the behaviour or routes of any existing page.

#### Scenario: Main app pages still render

- **WHEN** a visitor opens the calendar overview or any other existing page
- **THEN** the system SHALL render it exactly as before, independent of the docs site's presence

### Requirement: Docs pages meet the same accessibility bar as the rest of the app

The system SHALL introduce no accessibility violations on the docs site,
matching the bar every other page in this app is held to.

#### Scenario: Automated accessibility scan on the docs index

- **WHEN** an automated accessibility scan runs against `/docs`
- **THEN** the system SHALL report zero violations
