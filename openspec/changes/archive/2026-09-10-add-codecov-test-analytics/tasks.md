## 1. Wire up JUnit output

- [x] 1.1 `bun test`'s own `--reporter=junit` (`package.json`'s `test:unit`)
- [x] 1.2 Playwright's own second reporter, CI-only (`playwright.config.ts`)

## 2. Upload to Codecov

- [x] 2.1 New `codecov/codecov-action` step, `report_type: test_results`,
      `if: ${{ !cancelled() }}` (`.github/workflows/ci.yml`)
- [x] 2.2 Confirm locally: `bun run test:unit` writes
      `coverage/junit-unit.xml`; `CI=true bunx playwright test` writes
      `playwright-report/junit.xml`
- [x] 2.3 Shipped in #584 — closed referencing that merge

## 3. Confirm live

- [ ] 3.1 A red PR shows failed-test detail in the Codecov UI/PR comment —
      needs a real red run against the live Codecov integration to check,
      not verifiable from the implementing session
