## Purpose

Gives a visitor a density-over-time view of their whole watch history —
a heatmap calendar shaded by how many viewings happened each day — so
patterns like binges and gaps are visible at a glance, something the
overview's own filterable table can't show.

## Requirements

### Requirement: Heatmap shows viewing density across the visitor's whole history

The system SHALL offer a `/calendar` page rendering a day-by-day heatmap
covering the visitor's whole logged history, shading each day by how
many viewings were logged on it. A day with no logged viewings SHALL
render as the lightest/empty shade, not an error or a gap in the grid.

#### Scenario: Heatmap with varying density

- **WHEN** a visitor opens `/calendar` and has logged multiple viewings on some days, one on others, and none on most days
- **THEN** the system SHALL shade each day's cell according to its own viewing count, distinguishably from the other two cases

#### Scenario: No logged viewings at all

- **WHEN** a visitor opens `/calendar` with no logged viewings
- **THEN** the system SHALL show the "no logged viewings" status text alone, rendering no month headings or grid cells — not a wall of empty-shaded cells across an arbitrary fallback range

#### Scenario: A month with no logged viewings, inside an otherwise-active history

- **WHEN** a visitor opens `/calendar` with logged viewings months apart, so that a month between them has none at all
- **THEN** the system SHALL show that month's own heading with a compact single line stating it has no viewings, rather than a full day-by-day grid of empty cells

### Requirement: A day cell opens a popup listing that day's own viewings

The system SHALL show a popup listing every viewing logged on that day
(title, medium, venue), each linking to its own details page, when a
visitor activates a day cell with at least one logged viewing — without
navigating away from the heatmap itself.

#### Scenario: Activating a day with one viewing

- **WHEN** a visitor activates a day cell that has exactly one logged viewing
- **THEN** the system SHALL open a popup naming that day and showing that viewing's title (linking to its own details page), medium, and venue
- **AND** the system SHALL remain on `/calendar`, not navigate elsewhere

#### Scenario: Activating a day with several viewings

- **WHEN** a visitor activates a day cell that has more than one logged viewing
- **THEN** the system SHALL list every one of that day's viewings in the popup, each linking to its own details page

#### Scenario: Activating an empty day does nothing

- **WHEN** a visitor activates a day cell with no logged viewings
- **THEN** the system SHALL NOT open a popup or navigate anywhere

### Requirement: Density is distinguishable without relying on colour alone

The system SHALL provide a non-colour-dependent way to tell a day's
viewing count — a text alternative (e.g. an accessible name or visible
label carrying the count), not shade alone — so the heatmap meets the
same WCAG 2.1 AA bar every other page in this app is held to.

#### Scenario: Accessible name carries the count

- **WHEN** a screen reader or other assistive technology inspects a day cell
- **THEN** its accessible name SHALL state that day's date and viewing count, not just be a coloured, unlabelled element

#### Scenario: Automated accessibility scan

- **WHEN** an automated accessibility scan runs against `/calendar`
- **THEN** the system SHALL report zero violations
