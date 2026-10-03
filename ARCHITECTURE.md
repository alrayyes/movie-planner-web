# Architecture

How movie-planner-web fits together today. The reasons behind each choice are
in the decision records under [`docs/adr/`](docs/adr/); contributor setup is in
[CONTRIBUTING.md](CONTRIBUTING.md).

## Shape

- A fully static Astro site, with Svelte islands and a few Web Components for
  the interactive parts. Cloudflare serves the built assets and nothing else
  (`wrangler.jsonc`).
- The browser talks straight to the visitor's own CalDAV server, and to OMDb and
  TMDb for movie metadata. No server this project runs sees a credential.
- The visitor's CalDAV calendar is the only data store. The browser keeps
  credentials, preferences, an activity log and a cached copy of the viewings.

## Where things live

- `src/lib/caldav/`: the CalDAV client, the iCalendar parser and writer, and
  the viewings cache that pages read from.
- `src/lib/omdb/` and `src/lib/tmdb/`: the metadata clients.
- `src/lib/credentials/`: credentials in the browser's IndexedDB.
- `src/lib/activity-log/`: a local record of what the app did, and the diff
  that spots changes made elsewhere.
- `src/components/` and `src/pages/`: the UI. Each page mounts one component.
- `src/content/docs/`: the user guide, built into the site under `/docs`.
- `test/integration/`: a real Baikal behind Caddy for the client tests. `tests/`
  holds the Playwright journeys.
- `docs/calendar-schema.md`: every iCalendar property the app reads and writes.

## Reading a viewing

- A page asks `src/lib/caldav/viewings-source.ts` for the whole history.
- It gets the browser's copy at once and a background request refreshes it. The
  page redraws only if the server's list differs.
- Writes go to the server, then update the copy.

## Decisions

- [1. CalDAV is the only data store](docs/adr/0001-caldav-is-the-only-data-store.md)
- [2. Fully static, with browser-side clients](docs/adr/0002-fully-static-with-browser-side-clients.md)
- [3. Venue and medium lists live in a sidecar VJOURNAL](docs/adr/0003-picklists-live-in-a-sidecar-vjournal.md)
- [4. Svelte islands alongside Web Components](docs/adr/0004-svelte-islands-alongside-web-components.md)
- [5. No build-provenance attestation](docs/adr/0005-no-build-provenance-attestation.md)
- [6. Viewings are cached in the browser and refreshed in the background](docs/adr/0006-viewings-are-cached-in-the-browser.md)

New decisions get the next number. A decision that changes gets a new record
that supersedes the old one, and the old one's text stays as it was.

The working papers for each shipped change are archived under
`openspec/changes/archive/`, and the capability specs are in `openspec/specs/`.
