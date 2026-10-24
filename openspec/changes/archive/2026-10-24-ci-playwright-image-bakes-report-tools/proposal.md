## Why

The reports step installed `lcov` and `pipx` with apt on every run, because the
`ci-playwright` image lacked them. The image now ships both, so the step is a
network call it no longer needs. Tracked as movie-planner-web#954.

## What Changes

- Take the image digest that bakes in `lcov` and `pipx`, and drop the apt step.
- Narrow the requirement's wording from "every CI job that drives a browser" to
  the Playwright jobs, which is what the drift test checks.
- Test the check for two workflows on the same version with different digests.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `ci-browser-image`: the requirement names the Playwright jobs.

## Impact

- `.github/workflows/ci.yml`, `.github/workflows/screenshots.yml`
- `scripts/playwright-image.test.ts`
