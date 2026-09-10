## Why

`~/.config/claude/skills/repo-creation/SKILL.md`'s "Test Analytics" section
calls for wiring up Codecov Test Analytics alongside the coverage upload
this repo already has — per-test failure/flake history and a
shortest-path-to-green on a red PR, not just a line-coverage number, free
on Codecov's Developer (OSS) plan for a public repo, reusing the
`CODECOV_TOKEN` secret already set here. Tracked as movie-planner-web#573.

## What Changes

- Generate JUnit-XML test output for both of this repo's test runners
  (`bun test`, Playwright).
- Upload it via a second `codecov/codecov-action` step
  (`report_type: test_results`), gated `if: ${{ !cancelled() }}` so it
  reports on a red run too, not just a green one.

## Capabilities

### New Capabilities

(none — pure CI configuration)

### Modified Capabilities

(none)

## Impact

- `package.json` (`test:unit`'s reporter flags)
- `playwright.config.ts` (a second, CI-only reporter)
- `.github/workflows/ci.yml` (the new upload step)
