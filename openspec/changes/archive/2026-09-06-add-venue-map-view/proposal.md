## Why

A visitor's watch history is currently only browsable as a list (the
calendar overview) or aggregated by venue name (the Venues page).
Neither shows _where_ any of it happened. Issue #8 asks for two map
views — one pin for a single viewing's venue on its details page, and
one map pinning every located viewing — so a visitor can see their
cinema-going geographically, not just as text.

This has sat as an unscoped placeholder since v1 (`add-movie-planner-web-app`)
because venues had no location data to map. That data question is now
answered well enough to write a real proposal against, even though the
data itself doesn't exist yet (see Impact).

## What Changes

- Add a new `/map` page: every logged viewing whose venue has known
  coordinates appears as a pin on one map. A viewing whose venue has no
  coordinates is simply omitted, not an error.
- Add a small map to the movie-details page, next to the existing Venue
  field, showing that one viewing's venue location when it has
  coordinates. No map renders when it doesn't.
- Both maps render with **no live third-party network call**: a bundled
  local static asset (a simplified world/country outline, image or
  GeoJSON) as the map surface, with Leaflet supplying pan/zoom/pin
  interaction on top of it — not `L.tileLayer` pointed at a tile
  provider. This is a deliberate privacy choice: viewing either map
  never leaks the visitor's IP to a third party the way a live
  slippy-map tile fetch would.
- Add a plain "Open in Maps" external link next to a pin, for a visitor
  who wants the real, precise, detailed view a coarse local outline
  can't give them. A click-through, not automatic — costs nothing
  privacy-wise.
- When logging or editing a viewing and its venue has no coordinates
  yet, offer an optional, skippable address-search lookup (Nominatim —
  OpenStreetMap's free geocoding, no API key) to fill them in. If the
  venue already has coordinates from an earlier viewing, reuse them
  instead of re-geocoding.

## Capabilities

### New Capabilities

- `venue-map`: the `/map` page, the per-venue map on the movie-details
  page, the "Open in Maps" link, and the zero-network rendering
  approach shared by both.

### Modified Capabilities

- `movie-log`: logging a viewing gains an optional coordinate-entry step
  (Nominatim address search, or automatic reuse) when the venue has no
  known coordinates yet.
- `movie-editing`: editing a viewing's venue gains the same
  coordinate-entry step as logging.

## Impact

- **Blocked on a cross-repo dependency that doesn't exist yet.** The
  coordinates this whole proposal maps come from the `movie-planner` CLI
  repo, which does not currently store venue coordinates anywhere.
  `movie-planner-c9` (the peer session working that repo) confirmed
  2026-09-05 that a `GEO:lat;long` iCalendar property on the venue's
  `VEVENT` — alongside the existing `LOCATION` text field — was floated
  in an internal design conversation but never turned into a ticket or
  OpenSpec change, and carries two of its own unresolved questions
  (precedence against an existing hardcoded chain/city/country lookup
  table, and the fact that there is no venue-update mechanism on that
  side at all today). It's queued behind that repo's in-flight
  Pathé import milestone (#140-142 there), not started.
- **This proposal assumes GEO lives per-`VEVENT` (per logged viewing),
  not on a venue picklist entry** — because that's the only mechanism
  actually described so far, and this app's own venue picklist (the
  `location-management` capability's sidecar `VJOURNAL`) is a flat list
  of names with no per-entry structured data today. If the CLI's actual
  ticket lands on a different shape (say, coordinates attached to the
  picklist instead), this proposal's design and delta specs need
  revisiting before implementation — flagged explicitly in design.md.
- New dependency: Leaflet (`leaflet`), plus whatever bundled static
  outline asset backs the zero-network map surface.
- New dependency: Nominatim usage means honouring its usage policy (a
  descriptive `User-Agent`, and its ~1 request/second rate limit) from
  a fully static, browser-only app with no server to centralize that
  through — a real implementation constraint, detailed in design.md.
- Touches `src/lib/caldav/types.ts` (a new optional `geo` field on
  `LoggedViewing`), `src/lib/caldav/client.ts` (parsing/writing the
  `GEO` property), the log form, the edit form on movie-details, and two
  new pages/components for the maps themselves.
- No change to the `calendar-overview` capability — the global map is a
  separate page rather than a toggle there, so the overview's own
  filtering/sorting is untouched.
