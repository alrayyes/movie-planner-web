## 1. Versions

- [x] 1.1 Bump `@playwright/test` to 1.64.1 and dedupe `playwright-core`

## 2. Container image

- [x] 2.1 Run the `test` and `screenshots` jobs in the digest-pinned image,
      with `--ipc=host`, and drop `playwright install` and `setup-bun`
- [x] 2.2 Install `pipx` and `lcov` in the reports step, which the image lacks

## 3. Drift guard

- [x] 3.1 `scripts/playwright-image.test.ts` fails when the tag and the
      lockfile version differ, or the digest is missing

## 4. Docs

- [x] 4.1 CONTRIBUTING.md and README.md say a Playwright bump moves the tag
