## Purpose

Gives a visitor a density-over-time view of their whole watch history —
a heatmap calendar shaded by how many viewings happened each day — so
patterns like binges and gaps are visible at a glance, something the
overview's own filterable table can't show.

## Requirements

### Requirement: Heatmap shows viewing density as a GitHub-style grid, grouped by year

The system SHALL offer a `/calendar` page rendering a GitHub-contribution-graph-style
heatmap of the visitor's whole logged history: one grid per calendar
year, weeks as columns running left to right, Sunday-to-Saturday as
rows, month labels positioned above the columns they span, and one
cell per day shaded by how many viewings were logged on it. A day with
no logged viewings SHALL render as the lightest/empty shade, not an
error or a gap in the grid.

#### Scenario: Heatmap with varying density

- **WHEN** a visitor opens `/calendar` and has logged multiple viewings on some days, one on others, and none on most days
- **THEN** the system SHALL shade each day's cell according to its own viewing count, distinguishably from the other two cases

#### Scenario: No logged viewings at all

- **WHEN** a visitor opens `/calendar` with no logged viewings
- **THEN** the system SHALL show the "no logged viewings" status text alone, rendering no year headings or grid cells — not a wall of empty-shaded cells across an arbitrary fallback range

#### Scenario: A year's grid runs its whole calendar year

- **WHEN** a visitor opens `/calendar` and a given year has at least one logged viewing anywhere in it
- **THEN** the system SHALL render that year's grid from its own January 1st through its December 31st (or through today, for the year still in progress), including days with no logged viewings, rather than skipping quiet stretches

#### Scenario: A year with no logged viewings at all is dropped

- **WHEN** a visitor opens `/calendar` with logged viewings from more than one calendar year, with at least one calendar year in between carrying no logged viewings at all
- **THEN** the system SHALL render no grid at all for that empty year, rather than a heading with an empty grid under it

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
