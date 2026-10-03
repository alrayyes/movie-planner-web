# 6. Viewings are cached in the browser and refreshed in the background

Status: accepted

## Context

About a dozen pages each downloaded the whole 15-year history before rendering,
with nothing kept between pages or reloads. Viewings rarely change, so almost
every download returned what the browser already had, and a large calendar timed
out (#533). Asking each page for less doesn't work: genre, director, venue and
medium filters run in the browser on custom properties, and CalDAV servers
differ on filtering by those.

## Decision

A copy of the viewings lives in the browser's IndexedDB, in a database of its
own. Pages show it at once and refresh from the server in the background, and
redraw only if the list differs (stale-while-revalidate, RFC 5861). With no copy
yet, a page waits for the server as before.

- The copy is keyed by a hash of the CalDAV URL and username and never holds the
  password. Saving credentials for another calendar drops the old copy.
- This app's own writes update the copy.
- A call joins only a request that started after it did, and only the newest
  request writes the cache or redraws a page, so a slow older answer can't bring
  back a row a newer one already removed.
- Export, import's duplicate check, the WebMCP search and the activity-log sync
  read the server, never the copy.

## Consequences

- A second store of viewings exists in the browser. It is separate from the
  activity log's snapshot store, which is the baseline for detecting changes made
  elsewhere, and serving pages from that baseline would blind the detection.
- A page can briefly show a list that is a moment out of date.
- Incremental refresh with `sync-collection` (RFC 6578) would shrink the
  background request, and isn't built.

Source: issues #715 and #533, and `src/lib/caldav/viewings-source.ts`.
