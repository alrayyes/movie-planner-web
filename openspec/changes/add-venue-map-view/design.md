## Context

See proposal.md for motivation. The load-bearing constraint here is that
the coordinates this whole feature maps **do not exist yet** anywhere —
`movie-planner-c9` (the peer session working the CLI repo) confirmed
2026-09-05 that a `GEO:lat;long` iCalendar property on the venue's own
`VEVENT` was only ever floated in conversation, never turned into a
ticket, spec, or code, and is now queued behind that repo's in-flight
Pathé import milestone. This design proceeds on that assumption because
it's the only mechanism described so far, but it is explicitly
provisional — see Open Questions.

`LoggedViewing` (`src/lib/caldav/types.ts`) currently has no location
field beyond the free-text `venue?: string` (mapped from the `VEVENT`'s
`LOCATION`). The `location-management` capability's venue picklist (a
sidecar `VJOURNAL`, see its own spec) is a flat list of venue names with
no per-entry structured data — not a place coordinates could attach to
without a separate, unrequested change to that sidecar's own format.

## Goals / Non-Goals

**Goals:**

- Ship a map view that works entirely from data already reachable
  through the existing CalDAV client, once the CLI side provides it.
- Never make an automatic third-party network call just from viewing a
  page — matches this app's existing "nothing but your own CalDAV/OMDb
  servers" stance for the OMDb key's own opt-in framing.

**Non-Goals:**

- Changing the `location-management` venue picklist's own stored format.
  Coordinates live per-viewing (`GEO` on the `VEVENT`), not on a venue
  picklist entry — "reusing a venue's known coordinates" (movie-log/movie-editing
  deltas) means scanning already-loaded viewings for a matching venue
  name with a `geo` value, not a new picklist field.
- A toggle or embedded view on the existing `calendar-overview` page —
  the global map is a separate `/map` page (proposal.md's own reasoning:
  avoids reconciling the overview's own filter state with the map).
- Geocoding accuracy/validation beyond what Nominatim itself returns.
  This app doesn't verify a chosen address is actually correct — same
  trust level as OMDb's own best-effort title matching elsewhere in this
  app.

## Decisions

**Coordinates as an optional `geo` field on `LoggedViewing`, parsed from
`VEVENT`'s `GEO` property.** Matches the CLI's own floated design
(`GEO:lat;long`, alongside `LOCATION`) rather than a custom `X-` property
this app would invent unilaterally. `iCalendar`'s `GEO` property is
`lat;lon` (semicolon-separated, not comma) per RFC 5545 §3.8.1.6 —
worth getting right now since a wrong separator silently produces
`NaN` coordinates rather than a parse error.

**Reuse-lookup scans already-loaded viewings, not a dedicated index.**
When a visitor types a venue name into the address-search field, check
whether any viewing already loaded in the current session (the log
form's own recent-viewings context, or a dedicated lightweight query if
the log form doesn't already have one loaded) has that exact venue name
with a `geo` value set, and reuse it. Alternative considered: a
dedicated `venue -> geo` lookup table maintained client-side — rejected
as an unrequested new piece of client-side state to keep in sync with
what CalDAV actually holds, when a scan over data already being fetched
answers the same question.

**Nominatim for address search, called only from the log/edit forms —
never automatically.** Free, no API key, but has a real ~1 request/second
usage policy and requires a descriptive `User-Agent` identifying the
application (not a browser's own default `User-Agent`, which Nominatim's
policy explicitly calls out as insufficient). A fully static, browser-only
app has no server to centralize or rate-limit this through — each
visitor's own browser calls Nominatim directly, same trust/architecture
model as this app's own OMDb calls. The address-search field debounces
input (waits for the visitor to stop typing) before firing a lookup,
both for a decent UX and to stay well under the rate limit from a single
visitor's own typing.

**Leaflet with a bundled local asset, not a tile provider.** `leaflet`
supplies pan/zoom/marker interaction; the "map" itself is either
`L.imageOverlay` over a bundled raster image or `L.geoJSON` rendering a
bundled vector outline (a low-detail world/country boundary set,
shipped as a static asset in this repo) — never `L.tileLayer` pointed at
a live XYZ tile URL. Alternative considered: no interactivity at all (a
flat static image with plotted dots, no library) — rejected because
Leaflet's own marker/popup/zoom affordances are worth keeping for a
multi-pin global map, and configuring it against local data costs
nothing extra once the library is already a dependency.

**"Open in Maps" is a plain `https://www.openstreetmap.org/?mlat=<lat>&mlon=<lon>`
(or equivalent) link, not a native app deep-link scheme.** Works
identically across desktop and mobile browsers without platform
detection; a visitor's browser/OS already handles routing a maps URL to
whatever app they prefer, the same way this app's existing IMDb/Rotten
Tomatoes/Letterboxd links work.

## Risks / Trade-offs

- **[Coordinates might never materialize, or land in a different shape
  than assumed]** → This proposal, and its specs, are written now
  because the design conversation already happened and shouldn't be
  lost — but `tasks.md` should not be started until the CLI's own
  ticket/proposal actually exists and confirms the `GEO`-on-`VEVENT`
  shape. If it lands differently (e.g., coordinates on the picklist
  instead), the `movie-log`/`movie-editing` deltas and the reuse-lookup
  decision above need revisiting before implementation, not after.
- **[Nominatim's rate limit and usage policy, enforced per-visitor's-own-IP
  from a fully static app]** → A visitor who's genuinely fast at editing
  many new venues in a row could exceed 1 req/sec on their own. Debounce
  the input field generously (a few hundred ms of no typing) rather than
  firing on every keystroke, and treat a Nominatim error the same
  no-fuss way OMDb lookup failures are already handled elsewhere (fail
  soft, let the visitor continue without coordinates).
- **[A bundled low-detail world outline can't show street-level
  position]** → Deliberate trade-off for zero-network privacy (see
  proposal.md). The "Open in Maps" link exists specifically to cover
  the case where a visitor wants real precision.

## Open Questions

- The bundled outline asset's exact source and detail level (a specific
  public-domain/CC0 world-boundaries dataset, simplified how far) is an
  implementation detail that doesn't change the specs or approach above
  — safe to pick during implementation.
- Whether `/map` gets a top-nav link or is reached via the Venues page
  is explicitly left open per proposal.md — a UI-placement detail, not a
  behaviour the specs above depend on.
