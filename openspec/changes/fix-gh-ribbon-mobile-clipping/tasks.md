## 1. Fix

- [x] 1.1 Reproduce the clipping in a real Playwright render at a mobile viewport (e.g. 393px), confirming the bug before changing anything
- [x] 1.2 Adjust `.gh-ribbon`/`.gh-ribbon a`'s mobile-breakpoint sizing (or the copy itself) so the full text renders unclipped, verified against the same render

## 2. Test coverage

- [x] 2.1 Add a Playwright test asserting the ribbon's full accessible text is present and its bounding box doesn't exceed `.gh-ribbon`'s visible area, at both the breakpoint boundary and a real device width

## 3. Verification

- [x] 3.1 Verify `bun run check`/`lint`/`test` all pass
