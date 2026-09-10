## Why

`~/.config/claude/skills/repo-creation/SKILL.md`'s "Bundle Analysis" section
calls for wiring up Codecov Bundle Analysis for this Astro site's build — JS
bundle-size trend tracking per PR (a size-delta comment, regression
detection), free on Codecov's Developer (OSS) plan for a public repo,
reusing the `CODECOV_TOKEN` secret this repo already has for coverage and
Test Analytics. Tracked as movie-planner-web#574.

## What Changes

- Add `@codecov/astro-plugin` to `astro.config.mjs`'s `integrations` array,
  active only where a Codecov token is actually available.

## Capabilities

### New Capabilities

(none — pure CI/build configuration)

### Modified Capabilities

(none)

## Impact

- `package.json`/`bun.lock` (new pinned dependency)
- `astro.config.mjs` (the new integration, `CODECOV_TOKEN`-gated)
- `.github/workflows/ci.yml` (`CODECOV_TOKEN` exposed to the step that runs
  `astro build`)
