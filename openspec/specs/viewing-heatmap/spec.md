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
- **THEN** the system SHALL render the full heatmap grid with every cell at the empty shade, rather than an error

### Requirement: A day cell links to that day on the overview

The system SHALL navigate to the calendar overview, filtered to that
exact day (`from` and `to` both set to it), when a visitor activates a
day cell with at least one logged viewing.

#### Scenario: Clicking a day with viewings

- **WHEN** a visitor activates a day cell that has one or more logged viewings
- **THEN** the system SHALL navigate to the calendar overview with `from` and `to` both set to that day, showing exactly that day's viewings

#### Scenario: Activating an empty day does nothing

- **WHEN** a visitor activates a day cell with no logged viewings
- **THEN** the system SHALL NOT navigate anywhere

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
