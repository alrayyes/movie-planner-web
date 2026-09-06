## MODIFIED Requirements

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
