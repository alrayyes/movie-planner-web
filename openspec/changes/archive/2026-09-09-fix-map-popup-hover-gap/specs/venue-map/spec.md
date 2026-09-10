## ADDED Requirements

### Requirement: A pin's popup stays open while the cursor is over its content

The system SHALL keep a pin's popup open while the visitor's cursor is
over the popup's own content, not just while it's over the marker
itself, closing it only once the cursor leaves both the marker and the
popup.

#### Scenario: Moving from marker to popup content

- **WHEN** a visitor opens a pin's popup (by hover or click) and moves the cursor from the marker toward a link inside the popup
- **THEN** the system SHALL keep the popup open for the whole path, so the visitor can click the link

#### Scenario: Moving away from both closes it

- **WHEN** a visitor moves the cursor away from both the marker and the popup entirely
- **THEN** the system SHALL close the popup, same as today

#### Scenario: Touch devices unaffected

- **WHEN** a visitor on a touch device taps a pin
- **THEN** the system SHALL open its popup and keep it open the same way it does today, unaffected by this hover-specific fix
