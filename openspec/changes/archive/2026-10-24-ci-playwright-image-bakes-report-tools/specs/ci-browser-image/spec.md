## MODIFIED Requirements

### Requirement: CI Playwright jobs run in a digest-pinned Playwright image

The system SHALL run every Playwright CI job in the
`ghcr.io/alrayyes/ci-playwright` image, referenced as `tag@sha256:digest`, and
SHALL NOT download browsers in those jobs.

#### Scenario: A Playwright job has no browser download

- **WHEN** a workflow job runs Playwright
- **THEN** it SHALL run in the pinned image and contain no `playwright install` step

#### Scenario: The image is not pinned by digest

- **WHEN** a workflow references the image without a `@sha256:` digest
- **THEN** the drift test SHALL fail
