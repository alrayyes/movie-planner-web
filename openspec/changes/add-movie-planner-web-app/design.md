## Context

See proposal.md - Why/What Changes for motivation and scope. Key
constraints that shape this design:

- The app is public and multi-tenant: any visitor supplies their own
  CalDAV server, so the operator must never hold anyone's credentials at
  rest, and the app must not become an open relay for requests to
  arbitrary internal hosts.
- CalDAV is the sole data store - no shared database, no server-side
  per-visitor state beyond what the visitor's own browser holds.
- Only Baikal is tested; the design should stay standard CalDAV rather
  than lean on server-specific extensions, since other servers are
  explicitly "may or may not work."
- Deploys to Cloudflare Workers, matching washy-washy-web.

## Goals / Non-Goals

**Goals:**

- A single Astro app, deployable as a Cloudflare Worker, that is both the
  static frontend and the CalDAV proxy (an Astro API route running as a
  Worker function), so there's one deploy target rather than two.
- Keep the proxy CalDAV aware (structured JSON operations in/out) rather
  than a raw request relay, so CalDAV/iCal parsing lives in one place and
  the set of requests it can make is fixed and auditable.
- Every operation validated and portable against plain CalDAV/WebDAV
  (RFC 4791/RFC 4918/RFC 5545), not a feature specific to Baikal or its
  sabre/dav backend.

**Non-Goals:**

- No server-side user accounts, sessions, or credential storage.
- No offline support or write queue - `sync retry`/`sync refresh` have no
  web equivalent (see proposal.md).
- No support for CalDAV servers reachable only over plain HTTP - see
  Risks/Trade-offs.

## Decisions

**One Astro app, frontend + proxy together, deployed as a Cloudflare
Worker.** Astro's server endpoints (`src/pages/api/*`) run as Worker
functions in this deploy mode, so the "stateless proxy function" from the
proposal is just those endpoints - no second service to build, deploy, or
version separately. Alternative considered: a fully static site (like
washy-washy-web) with a separate standalone Worker for the proxy - rejected
as unneeded operational complexity for no benefit here, since (unlike
washy-washy-web) this app has no case where it can run with zero backend.

**The proxy is CalDAV aware, not a generic URL relay.** Each API route
takes a small, fixed set of structured parameters (e.g. "list events between
these dates," "create event," "get/update the sidecar picklist") plus the
visitor's `{ baseUrl, username, password }`, and itself makes the
underlying WebDAV `PROPFIND`/`REPORT`/`GET`/`PUT`/`DELETE` calls and
parses the iCalendar response server-side, returning JSON. Alternative
considered: a thin pass-through relay (browser sends method + path +
headers, proxy forwards verbatim) - rejected because it maximizes the
attack surface (an open fetch-anything-under-this-host relay) for no real
benefit, and pushes WebDAV/iCal parsing into the browser bundle instead of
one server-side place.

**`baseUrl` must be `https://`.** Rejecting `http://` outright removes an
entire class of downgrade/interception risk for credentials that
transit the proxy, and is the safer default for a public tool whose
visitors' server choice we don't control. Trade-off and mitigation are in
Risks/Trade-offs below.

**SSRF defence in depth despite the Workers platform-level block.**
Outbound `fetch()` from a Cloudflare Worker to a raw/private IP target is
already blocked at Cloudflare's edge (confirmed via current community
reports of Workers returning an immediate 403 for such targets), which
handles the core SSRF case for free. The proxy still validates `baseUrl`
is `https://` and well-formed before use, and applies a request timeout
and a response size cap, as defence in depth against platform behaviour
changing or a validation gap, and against a slow/oversized response from
a malicious or misbehaving target tying up the function.

**Media/venue picklist: sidecar `VJOURNAL`, plain `DESCRIPTION` field.**
Already decided in proposal.md; the design detail is the UID -
`movie-planner-web-config` (a fixed, well-known UID within the visitor's
calendar collection), fetched with a targeted `GET`/`REPORT` rather than
walking the whole collection. Missing sidecar = empty picklists, created
on first "add a venue/medium" rather than provisioned up front.

**OMDb calls happen from the proxy, not the browser.** The visitor's
OMDb key never needs to be exposed to third-party network requests
initiated from their browser (avoiding a key-leak surface via browser
extensions/network inspection beyond what's already necessary), and it
keeps "does this entry have a key set" logic server-side alongside the
best-effort match logic. The key still lives only in the browser's own
storage and is sent to the proxy per-request, same as CalDAV credentials.

## Risks / Trade-offs

- **Self-hosted CalDAV servers reachable only over plain HTTP won't
  work** → mitigated by documenting this clearly (README/onboarding
  copy) and suggesting a TLS-terminating reverse proxy (Caddy,
  Let's Encrypt) in front of a home-hosted server; not solved in-app.
- **A visitor's CalDAV/OMDb credentials pass through the proxy on every
  request** → mitigated by never persisting or logging them server-side
  (request-scoped only), and by documenting this plainly for visitors
  who want to verify the claim themselves (open source, public repo).
- **Sidecar `VJOURNAL` could theoretically collide with a real journal
  entry a visitor already has** at the same fixed UID → mitigated by the
  UID living under its own namespace (`movie-planner-web-*`) and unlikely
  to collide in practice; not a security issue, at worst a picklist that
  fails to parse, handled by falling back to an empty list rather than
  raising an error.
- **Cloudflare's platform-level SSRF block is Cloudflare's behaviour, not
  a contract** → mitigated by the explicit `https://`-only validation and
  timeout/size caps in the proxy itself, so the app doesn't rely solely
  on undocumented platform behaviour.

## Migration Plan

N/A - new app, no prior version or data to migrate. Cloudflare project
setup (preview builds per PR, production on `main`) is tracked in a
separate forge issue outside this change's tasks, per proposal.md -
Impact.
