## ADDED Requirements

### Requirement: Details page shows a visual blocked-time bar

The system SHALL show a horizontal bar within a 24-hour track below the
Start/End fields, positioned and sized from the viewing's own start time
and duration, so a visitor can see at a glance how long a viewing took
without subtracting two timestamps. The bar SHALL be purely
supplementary to the existing Start/End fields, not a replacement for
them and not a second accessible description of the same information.

#### Scenario: A same-day viewing

- **WHEN** a visitor opens the details page for a viewing that starts and ends on the same day
- **THEN** the system SHALL show a bar positioned at the start time and sized to the viewing's duration, within a single 24-hour track

#### Scenario: A viewing crossing midnight is clipped, not wrapped

- **WHEN** a visitor opens the details page for a viewing that starts on one day and ends after midnight
- **THEN** the system SHALL clip the bar at the track's midnight edge rather than wrapping it or showing a second segment

#### Scenario: The bar is decorative, not a second accessible description

- **WHEN** a screen reader or other assistive technology inspects the details page
- **THEN** the bar SHALL be hidden from it (the existing Start/End fields remain the real, only accessible description of the viewing's timing)
