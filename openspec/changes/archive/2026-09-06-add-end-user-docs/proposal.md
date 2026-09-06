## Why

The `/docs` site only ever covered connecting, logging, the overview,
import/export, and keyboard shortcuts — it never grew to cover the
heatmap, venues, or map pages added since. A first-time visitor also
lands straight on a bare credential form with no explanation of what
the app is or what it does with the fields they're about to type into.
The user asked directly for end-user documentation with screenshots and
a first-load introduction on the connect form.

## What Changes

- Add `/docs/heatmap/`, `/docs/venues/`, `/docs/map/` pages, and link
  all three from the docs index and the Starlight sidebar.
- Add a plain-language introduction above the connect form on first
  load, explaining what the app is and linking to `/docs/connecting/`
  and `/privacy`.
- Fix `/docs/connecting/`'s stale claim that credentials are stored in
  `localStorage` — they're in IndexedDB.
- Add connect-form and map screenshots (light and dark mode): the
  connect-form pair via the permanent Playwright suite, the map pair as
  a one-off manual capture (real OSM tile requests, kept out of the
  permanent suite per OSM's usage policy).

## Capabilities

### Modified Capabilities

- `docs`: covers three more topics (heatmap, venues, map) and the
  connect form's new first-load introduction.

## Impact

- No cross-repo dependency — every screenshot and every page uses data
  already available client-side.
- `public/screenshots/` gains connect-form and map captures (light/dark).
