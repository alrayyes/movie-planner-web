## Purpose

Lets a visitor switch between light and dark colour schemes, so the app
is comfortable to use in low light without leaving contrast or system
integration as an afterthought.

## Requirements

### Requirement: Theme defaults to the OS preference

The system SHALL default to the visitor's OS-level
`prefers-color-scheme` when no explicit choice has been stored.

#### Scenario: First visit, OS prefers dark

- **WHEN** a visitor with no stored theme preference loads the app on a system set to dark mode
- **THEN** the system SHALL render in dark mode

### Requirement: Visitor's explicit choice persists and overrides the OS

The system SHALL let a visitor switch themes via a toggle reachable from
every page, and SHALL persist that choice client-side so it applies on
future visits regardless of the OS preference.

#### Scenario: Toggle overrides OS preference

- **WHEN** a visitor on a system set to light mode explicitly switches to dark
- **THEN** the system SHALL render in dark mode on this visit and on every later visit, until the visitor switches back

### Requirement: Both themes meet WCAG 2.1 AA contrast

The system SHALL maintain WCAG 2.1 AA contrast in both the light and
dark colour schemes.

#### Scenario: Automated accessibility scan in dark mode

- **WHEN** an automated accessibility scan runs against a page in dark mode
- **THEN** the system SHALL report zero violations, matching the same bar the light-mode scans already hold every page to
