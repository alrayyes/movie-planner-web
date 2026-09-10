## ADDED Requirements

### Requirement: TMDb API key is optional

The system SHALL allow a visitor to submit credentials with no TMDb API
key set, and SHALL NOT block CalDAV, OMDb, or any other functionality on
its absence. The system SHALL only attempt a TMDb call for a viewing
when both a TMDb key is stored and that viewing already has an IMDb ID
resolved (via OMDb) — the system SHALL NOT search TMDb by title as a
substitute.

#### Scenario: No TMDb key set

- **WHEN** a visitor logs, refreshes, or bulk-refreshes viewings without a TMDb API key stored
- **THEN** the system SHALL behave exactly as it would with only an OMDb key set, with no TMDb call attempted and no error shown

#### Scenario: TMDb key set but no IMDb ID resolved

- **WHEN** a visitor has a TMDb key stored, and a viewing being logged or refreshed has no IMDb ID (OMDb hasn't matched it)
- **THEN** the system SHALL NOT attempt a TMDb call for that viewing
