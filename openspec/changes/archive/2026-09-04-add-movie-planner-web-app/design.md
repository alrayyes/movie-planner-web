## Context

See proposal.md - Why/What Changes for motivation and scope. Key
constraints that shape this design:

- The app is public and multi-tenant: any visitor supplies their own
  CalDAV server, so the operator must never hold anyone's credentials at
  rest — and, per the decision below, never see them in transit either.
- CalDAV is the sole data store - no shared database, no server-side
  per-visitor state beyond what the visitor's own browser holds.
- Only Baikal is tested; the design should stay standard CalDAV rather
  than lean on server-specific extensions, since other servers are
  explicitly "may or may not work."
- Fully static, deployed to Cloudflare as static assets with no
  application-level Worker code — CORS, not a server-side proxy, is what
  makes the cross-origin calls to a visitor's CalDAV server work; see
  Decisions.

## Goals / Non-Goals

**Goals:**

- A single Astro app, built fully static, so there's one deploy target
  and no application-level server code to operate at all.
- The CalDAV/OMDb clients (`src/lib/caldav/client.ts`,
  `src/lib/omdb/client.ts`) live in one place each, structured (typed
  functions in, typed results out) rather than ad-hoc `fetch()` calls
  scattered across components — same reason the earlier proxy design kept
  CalDAV parsing in one place, just running in the browser now instead of
  on a server.
- Every operation validated and portable against plain CalDAV/WebDAV
  (RFC 4791/RFC 4918/RFC 5545), not a feature specific to Baikal or its
  sabre/dav backend.

**Non-Goals:**

- No server-side user accounts, sessions, or credential storage — and, per
  the decision below, no server-side handling of credentials at all, not
  even transiently.
- No offline support or write queue - `sync retry`/`sync refresh` have no
  web equivalent (see proposal.md).
- No support for CalDAV servers reachable only over plain HTTP - see
  Risks/Trade-offs.

## Decisions

**No frontend framework — vanilla TypeScript and Web Components.**
Interactive UI (the credentials form, later the filterable calendar
overview and edit/log/delete flows) is built with plain `<script>`
modules and custom elements in `.astro` files, not a reactive framework.
Keeps the dependency footprint matching the project's minimal style so
far (no React/Preact/Solid/Svelte in `package.json`), at the cost of more
handwritten DOM wiring once the calendar overview's filtering and forms
arrive. Alternative considered: Preact islands (Astro's own recommended
lightweight choice, ~3kb, less hand-wiring for lists/forms) - rejected in
favour of the smaller dependency surface; revisit if hand-wiring the
overview's filtering turns out to be genuinely painful.

**Fully static — the browser calls the visitor's CalDAV/OMDb servers
directly, no server-side proxy.** Reverses this design's original
decision (kept below, struck through, for the reasoning trail — this is
exactly the kind of call worth being able to see was reconsidered and
why). The original proxy was stateless and logged nothing, but it still
held a visitor's plaintext credentials in memory for the duration of
every request, since server-side code needs them in the clear to build
the outbound Basic Auth header. That's a real exposure surface distinct
from "at rest" storage — the operator's own infrastructure (Cloudflare's
compute layer, in the original design) sees every credential on every
call. Moving the CalDAV/OMDb clients into the browser closes that
entirely: nothing this project runs ever receives a visitor's
credentials, in any form, at any point. The cost is real too — any CalDAV
server a visitor points the app at now needs CORS headers permitting this
app's origin, which most CalDAV servers (Baikal included) don't send by
default. Accepted because it's a one-time, visitor-controlled
configuration change (documented in README.md, proven against a real
Baikal+Caddy stack in `test/integration/`) versus a standing trust
requirement in the operator's infrastructure that the visitor can't
verify or opt out of.

~~**One Astro app, frontend + proxy together, deployed as a Cloudflare
Worker.** Astro's server endpoints (`src/pages/api/*`) run as Worker
functions in this deploy mode, so the "stateless proxy function" from the
proposal is just those endpoints - no second service to build, deploy, or
version separately. Alternative considered: a fully static site (like
washy-washy-web) with a separate standalone Worker for the proxy -
rejected as unneeded operational complexity for no benefit here, since
(unlike washy-washy-web) this app has no case where it can run with zero
backend.~~ Superseded by the decision above — it turned out there is a
case for zero backend: not needing one at all, once CORS covers what the
proxy existed for.

~~**The proxy is CalDAV aware, not a generic URL relay.** Each API route
takes a small, fixed set of structured parameters (e.g. "list events
between these dates," "create event," "get/update the sidecar picklist")
plus the visitor's `{ baseUrl, username, password }`, and itself makes
the underlying WebDAV `PROPFIND`/`REPORT`/`GET`/`PUT`/`DELETE` calls and
parses the iCalendar response server-side, returning JSON.~~ Superseded —
there's no proxy left to be aware of CalDAV or not. The same structuring
principle carries over to where the client code now lives: see Goals.

**`baseUrl` must be `https://`.** Originally framed as removing a
downgrade/interception risk for credentials transiting the proxy; still
true and still enforced (`validateCaldavConfig`), now for a second reason
too — a page served over HTTPS can't `fetch()` a plain `http://` target
at all (mixed-content blocking is a browser platform rule, not something
this app configures), so this validation now also turns an opaque browser
block into a readable error message before the browser even tries.

~~**SSRF defence in depth despite the Workers platform-level block.**~~
No longer applicable — SSRF is a risk to a server making requests on an
attacker's behalf; there's no server making these requests any more, only
the visitor's own browser, on their own behalf, same as any other site
they use. The request timeout and response size cap in
`bounded-fetch.ts` stay, but now purely as UX robustness (don't hang the
tab, don't stream an unbounded response into memory), not as a security
control.

**OMDb calls also move to the browser, same reasoning.** Originally kept
server-side specifically to avoid exposing the visitor's OMDb key to
"third-party network requests initiated from their browser" — but OMDb
(`omdbapi.com`) already sends `Access-Control-Allow-Origin: *` (confirmed
live), so it was always reachable directly, and keeping it server-side
while removing the CalDAV proxy would have left one credential (OMDb)
transiting the operator's infrastructure while the other (CalDAV) didn't
— an inconsistent story for no remaining benefit.

**Media/venue picklist: sidecar `VJOURNAL`, plain `DESCRIPTION` field.**
Already decided in proposal.md; the design detail is the UID -
`movie-planner-web-config` (a fixed, well-known UID within the visitor's
calendar collection), fetched with a targeted `GET`/`REPORT` rather than
walking the whole collection. Missing sidecar = empty picklists, created
on first "add a venue/medium" rather than provisioned up front.

~~**OMDb calls happen from the proxy, not the browser.** The visitor's
OMDb key never needs to be exposed to third-party network requests
initiated from their browser (avoiding a key-leak surface via browser
extensions/network inspection beyond what's already necessary), and it
keeps "does this entry have a key set" logic server-side alongside the
best-effort match logic. The key still lives only in the browser's own
storage and is sent to the proxy per-request, same as CalDAV
credentials.~~ Superseded — see "OMDb calls also move to the browser"
above.

## Risks / Trade-offs

- **Self-hosted CalDAV servers reachable only over plain HTTP won't
  work** → mitigated by documenting this clearly (README/onboarding
  copy) and suggesting a TLS-terminating reverse proxy (Caddy,
  Let's Encrypt) in front of a home-hosted server; not solved in-app. Now
  doubly true — a page served over HTTPS can't `fetch()` `http://` at all
  (browser mixed-content blocking), not just "the proxy rejects it."
- **Any CalDAV server a visitor points the app at must send CORS headers
  permitting this app's origin** → mitigated by documenting the exact
  headers and a tested reverse-proxy example (README.md,
  `test/integration/Caddyfile`); not solved in-app, since the app has no
  way to configure a visitor's own server. This is the trade-off accepted
  in exchange for zero credential exposure to the operator's
  infrastructure — see the "Fully static" decision above.
- **Sidecar `VJOURNAL` could theoretically collide with a real journal
  entry a visitor already has** at the same fixed UID → mitigated by the
  UID living under its own namespace (`movie-planner-web-*`) and unlikely
  to collide in practice; not a security issue, at worst a picklist that
  fails to parse, handled by falling back to an empty list rather than
  raising an error.

## Migration Plan

No visitor data to migrate - CalDAV is the only store and this change
doesn't touch its format. One operational step for the already-configured
Cloudflare project: the build output directory moves from `dist/client`
(the SSR adapter's split layout) to `dist` (this app's own static build)

- update that in the Cloudflare dashboard's build settings alongside
  merging this change, or the next deploy serves a stale/empty build.
