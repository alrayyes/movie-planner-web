## Why

[movie-planner](https://github.com/alrayyes/movie-planner) is a CLI, so
logging or browsing a watch history means being at a terminal with the
CLI installed and the local config in place. There's no way to check the
log or add a viewing from a phone, and no way for anyone other than the
CLI's owner to use the tool at all. movie-planner-web makes the same
functionality available from any browser, to any visitor, using their own
CalDAV calendar as the data store — no install, no account with this
service.

## What Changes

- New Astro web app, in the same technical vein as
  [washy-washy-web](https://github.com/alrayyes/washy-washy-web) (Astro,
  Cloudflare Workers deploy, Bun/Biome/Playwright+axe/Lighthouse/Vale
  toolchain), without localization.
- First-load screen captures CalDAV server URL, username, password, and
  an optional OMDb API key; stored in the visitor's own browser
  (IndexedDB), never on a server. A `/settings` screen edits these after
  the first visit.
- Fully static — the browser calls the visitor's own CalDAV (and, when
  set, OMDb) server directly, with no server-side relay of any kind.
  **BREAKING** (of an earlier revision of this same proposal, not a
  released API): an earlier version routed these calls through a
  stateless serverless proxy to work around CORS; that's reversed here
  because even a stateless, nothing-logged relay still sees a visitor's
  plaintext credentials in memory for each request, and the goal is zero
  credential exposure to any server this project runs, not just zero
  persistence. The trade-off: any CalDAV server a visitor points the app
  at now has to send CORS headers permitting this app's origin — see
  design.md's Risks/Trade-offs.
- CalDAV is the sole source of truth for the web app: every read and
  write goes straight to the visitor's calendar. No shared database, no
  dependency on the CLI's local SQLite store.
- Calendar overview: browse and filter every logged viewing with full
  metadata (start/end time, cinema/venue, director, actors, ratings).
- Log a viewing, from a form or by parsing a pasted/uploaded Pathé
  booking confirmation email, with best-effort OMDb ratings enrichment
  (auto-picks the closest match, no disambiguation prompt — the visitor
  corrects it via edit if it guessed wrong).
- Update and delete existing entries.
- Bulk import from CSV/JSON.
- Manage the media/venue picklists used when logging a viewing, stored as
  a sidecar `VJOURNAL` calendar object (plain-text `DESCRIPTION` field)
  in the same CalDAV collection, so it stays portable across CalDAV
  servers rather than relying on a server-specific WebDAV extension.
- No web equivalent for the CLI's `sync retry`/`sync refresh` — those
  exist to reconcile the CLI's local SQLite against CalDAV; the web app
  writes straight to CalDAV, so there's nothing to reconcile.
- Documentation states this has only been tested against Baikal; other
  CalDAV servers may or may not work.

## Capabilities

### New Capabilities

- `credentials`: first-load CalDAV/OMDb credential capture, browser-only
  storage, and the `/settings` screen for editing them later.
- `caldav-client`: the browser-side module that speaks CalDAV/WebDAV
  directly to the visitor's own server — no server-side relay, so any
  CalDAV server a visitor uses has to send CORS headers permitting this
  app's origin.
- `calendar-overview`: the main screen — browsing and filtering logged
  viewings with full metadata.
- `movie-log`: logging a viewing, via form or Pathé email parsing, with
  best-effort OMDb enrichment.
- `movie-editing`: updating and deleting existing logged viewings.
- `bulk-import`: CSV/JSON import of viewings.
- `location-management`: managing the media/venue picklists via the
  sidecar CalDAV `VJOURNAL`.

### Modified Capabilities

(none — this is a new repo with no existing specs)

## Impact

- New repo (`movie-planner-web`), currently empty — this change is its
  first implementation.
- Deploys to Cloudflare (preview builds per pull request, and production
  on `main`) as a static site served by a Worker with no application
  logic (`wrangler.jsonc`'s `assets` config, no `main` script);
  Cloudflare project setup is tracked separately in a forge issue, not
  part of this change's tasks.
- No changes to the `movie-planner` CLI or its repo — the two share no
  code, only the CalDAV data they both read/write.
- A visitor's CalDAV and OMDb credentials never leave their own browser
  except to reach their own CalDAV/OMDb server directly; no server this
  project runs ever receives or sees them, not even transiently.
