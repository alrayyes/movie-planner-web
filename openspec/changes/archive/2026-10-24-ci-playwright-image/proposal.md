## Why

CI downloaded Chromium on every browser job, and a slow or failed download
failed the run. A prebuilt image, `ghcr.io/alrayyes/ci-playwright`, ships the
browsers. Its browsers only work with the exact Playwright release it is tagged
for, so the tag and the library version have to move together. Tracked as
movie-planner-web#952.

## What Changes

- The `test` and `screenshots` jobs run in that image, pinned by tag and
  digest, with no `playwright install` and no `setup-bun` step.
- `@playwright/test` moves to 1.64.1, the version the image exists for, and
  `playwright-core` is deduped to one copy.
- A test fails CI when the image tag differs from the lockfile's
  `@playwright/test` version, or the image is not digest-pinned.

## Capabilities

### New Capabilities

- `ci-browser-image`: how CI gets its browsers, and the guard that keeps the
  image and the library in step.

### Modified Capabilities

(none)

## Impact

- `.github/workflows/ci.yml`, `.github/workflows/screenshots.yml`
- `scripts/playwright-image.ts` and its test
- `package.json`, `bun.lock`
- `CONTRIBUTING.md`, `README.md`
