## 1. Nav

- [x] 1.1 Reduce `site-nav.ts`'s `LINKS` to Viewings, Venues, Calendar, Map, Settings, and verify a unit/Playwright test covers the nav rendering exactly these 5 entries
- [x] 1.2 Verify at a real mobile viewport (375-393px) that the nav fits one row without wrapping

## 2. Log a viewing button

- [x] 2.1 Add a persistent "Log a viewing" button to `Layout.astro`'s `header-actions` group, linking to `/log`, and verify it renders on every page once connected
- [x] 2.2 Verify it's visually distinct from the nav links (not styled as a nav item)

## 3. Settings hub

- [x] 3.1 Add clearly labelled links to `/import` and `/activity` on `settings.astro`
- [x] 3.2 Verify `/import` and `/activity` render exactly as before when visited directly (no behaviour change to those pages themselves)

## 4. Breadcrumb consistency

- [x] 4.1 Review `site-breadcrumb.ts`'s `PAGE_NAMES` against the new nav structure and update if needed for consistency

## 5. Verification

- [x] 5.1 Verify `bun run check`/`lint`/`test` all pass
- [x] 5.2 Verify the full connected-visitor flow: land on Viewings, reach every other page via the new nav/header button/Settings hub
