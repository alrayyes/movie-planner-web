## Purpose

Gives an undecided visitor a public, no-credentials-required page
showing what the app actually looks like, so they can judge it before
pointing it at their own CalDAV server.

## Requirements

### Requirement: A public About page tours the app's features with screenshots

The system SHALL render a `/about` page, reachable without stored
credentials, showing a short explanation of the app and a screenshot
for each of: the calendar overview, venues, the heatmap, and the map.

#### Scenario: Visitor with no stored credentials opens /about

- **WHEN** a visitor with no stored credentials opens `/about`
- **THEN** the system SHALL render the page fully, not redirect to the connect form

#### Scenario: Each feature shows a theme-matched screenshot

- **WHEN** a visitor views `/about` in light or dark mode
- **THEN** the system SHALL show the screenshot matching that mode, not a fixed one

### Requirement: The About page is reachable from the site footer

The system SHALL link `/about` from the site footer, alongside GitHub,
Disclaimer, and Privacy.

#### Scenario: Visitor follows the footer link

- **WHEN** a visitor clicks "About" in the footer on any page
- **THEN** the system SHALL navigate to `/about`
