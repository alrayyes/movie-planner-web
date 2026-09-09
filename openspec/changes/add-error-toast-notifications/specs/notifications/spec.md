## Purpose

Defines how this app surfaces a genuine error to a visitor, distinct from routine status text — so a real failure is noticed and correctly announced to assistive technology, not blended into the same quiet line used for "Loading…" or a count.

## ADDED Requirements

### Requirement: Errors are visually distinct from routine status text

The system SHALL show a genuine error (a failed load, refresh, delete,
or similar action) with a visually distinct treatment — combining
colour, an icon, and a fixed position — separate from the plain, quiet
text style used for routine status updates (loading, counts, success
confirmations).

#### Scenario: A failed action shows a distinct error

- **WHEN** an action fails (for example, a NetworkError during a refresh)
- **THEN** the system SHALL present the error with its distinct colour/icon/position treatment, not the same plain text style as a routine status message

#### Scenario: Routine status is unaffected

- **WHEN** a routine status message is shown (loading, a count, a success confirmation)
- **THEN** the system SHALL keep showing it in the existing plain inline style, unaffected by this requirement

### Requirement: Errors use an assertive ARIA live region

The system SHALL announce a genuine error to assistive technology
using `role="alert"` (an assertive live region), interrupting whatever
is currently being announced, rather than `role="status"` (a polite
live region) used for routine updates.

#### Scenario: Screen reader interrupted for an error

- **WHEN** a screen reader is announcing something else and a genuine error occurs
- **THEN** the system SHALL interrupt that announcement to state the error immediately

### Requirement: Errors do not auto-dismiss

The system SHALL keep an error visible until a visitor dismisses it or
takes an action that resolves it, rather than removing it automatically
after a short timer.

#### Scenario: Error stays visible

- **WHEN** an error is shown and a visitor takes no action
- **THEN** the system SHALL keep it visible, not remove it automatically after a few seconds
