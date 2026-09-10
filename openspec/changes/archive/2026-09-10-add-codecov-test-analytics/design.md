## Context

See proposal.md - Why. The existing "upload coverage to Codecov" step only
reports a coverage delta, and only fires on a successful run — GitHub
Actions' default step condition (`success()`) skips it entirely once an
earlier step in the same job fails.

## Goals / Non-Goals

**Goals:** JUnit output from both test runners, uploaded to Codecov even
when tests fail.

**Non-Goals:** replacing the existing coverage-upload step, or gating any
required check on Test Analytics data.

## Decisions

- `bun test --reporter=junit` is additive — confirmed live it doesn't
  replace `bun test`'s own console output (the pass/fail summary and
  coverage table both still print) the way Playwright's single-reporter
  CLI flag would. Wired straight into `test:unit` rather than a second,
  parallel invocation.
- Playwright gets a second reporter (`junit`, alongside the existing
  `list`), CI-only — a local run has no upload step to feed it, so there's
  no reason to write the file there.
- One `codecov/codecov-action` step with `report_type: test_results`, not
  the dedicated `codecov/test-results-action` named in the ticket's own
  references — that action's README says it's deprecated in favour of this
  exact migration path.
- `if: ${{ !cancelled() }}` on the new step, not the existing step's
  implicit `success()` — the whole point of Test Analytics is showing
  what failed, so it has to run after a red "playwright test" step too.

## Open Questions

None outstanding from implementation — confirmed via local runs of both
test:unit (writes `coverage/junit-unit.xml`) and `CI=true` Playwright
(writes `playwright-report/junit.xml`). The acceptance criterion "a red PR
shows failed-test detail in the Codecov UI/PR comment" needs a real red PR
against the live Codecov integration to verify, not verifiable from the
session that implemented this.
