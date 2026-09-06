## 1. Docs site catch-up

- [x] 1.1 Add `/docs/heatmap/`, `/docs/venues/`, `/docs/map/`, link them from the docs index and the Starlight sidebar
- [x] 1.2 Fix `connecting.md`'s stale `localStorage` claim to say IndexedDB

## 2. First-load introduction

- [x] 2.1 Add a plain-language intro above the connect form, linking to `/docs/connecting/` and `/privacy`, and verify a Playwright test asserts the text and both links
- [x] 2.2 Generate connect-form screenshots (light/dark) via the permanent Playwright suite, referenced from `connecting.md`

## 3. Map screenshots

- [x] 3.1 Manually capture map screenshots (light/dark) via a temporary, one-off Playwright test (real OSM tile requests — kept out of the permanent suite per OSM's usage policy), referenced from `map.md`

## 4. Finishing checks

- [x] 4.1 Run `bun run check`, `bun run lint`, `bun run format:check`, `bun run lint:md`, `bun run lint:prose`, `bun run lint:mechanics`, `bun run test` and confirm all green
- [x] 4.2 File tracking issue (#269) and confirm `openspec/specs/docs/spec.md` is ready for archive
