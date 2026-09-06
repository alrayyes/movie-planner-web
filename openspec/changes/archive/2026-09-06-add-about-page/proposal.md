## Why

An undecided visitor currently can't see what the app looks like
without connecting it to a real CalDAV server first — the README has
prose and one screenshot, but nothing tours the app's actual features.
The user asked for a public About page showing what's possible, with
screenshots. Builds on the docs catch-up in #269 (`add-end-user-docs`),
which added the venues, heatmap, and map docs pages this reuses the
screenshot-generation pattern from.

## What Changes

- Add a public `/about` page — reachable without connecting, like
  `/privacy` and `/disclaimer` — touring the overview, venues, heatmap,
  and map with a description and a theme-aware screenshot each, linked
  from the site footer.
- Add venues and heatmap screenshots (light/dark) via the permanent
  Playwright suite, and reuse the existing overview and map screenshots
  (map screenshots reused as-is; the overview capture now also writes a
  second copy to `public/screenshots/` alongside its existing
  `docs/screenshots/` one, so the README and the live site can never
  drift apart from each other).
- Note in `CONTRIBUTING.md` that `/docs` and `/about` both need updating
  in the same pull request as any change they describe, generalizing
  the existing README rule.

## Capabilities

### New Capabilities

- `about-page`: the public `/about` feature tour.

## Impact

- No cross-repo dependency — every screenshot uses data already
  available client-side.
- `public/screenshots/` gains venues, heatmap, and overview captures
  (light/dark).
