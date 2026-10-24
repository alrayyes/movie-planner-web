## ADDED Requirements

### Requirement: CI browser jobs run in a digest-pinned Playwright image

The system SHALL run every CI job that drives a browser in the
`ghcr.io/alrayyes/ci-playwright` image, referenced as `tag@sha256:digest`, and
SHALL NOT download browsers in those jobs.

#### Scenario: A browser job has no browser download

- **WHEN** a workflow job runs Playwright
- **THEN** it SHALL run in the pinned image and contain no `playwright install` step

#### Scenario: The image is not pinned by digest

- **WHEN** a workflow references the image without a `@sha256:` digest
- **THEN** the drift test SHALL fail

### Requirement: The image tag equals the lock file's Playwright version

The image tag's Playwright version SHALL equal the `@playwright/test` version
in `bun.lock`, in every workflow that uses the image.

#### Scenario: A Playwright bump forgets the workflows

- **WHEN** `@playwright/test` changes in the lock file and a workflow's image tag does not
- **THEN** the drift test SHALL fail, naming the file and both versions
