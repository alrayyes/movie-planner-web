# 2. Fully static, with browser-side clients

Status: accepted

## Context

The first design ran a stateless proxy as a Cloudflare Worker. It logged
nothing, but it still held every visitor's credentials, in the clear, in memory
for the length of each request, because server code needs them in the clear to build
the Basic Auth header. That is a real exposure surface, and the visitor can't
verify or opt out of it.

## Decision

The site is fully static. The CalDAV, OMDb and TMDb clients run in the browser
and call the visitor's own servers directly. Nothing this project runs ever
receives a credential. Cloudflare serves static assets only, with no
application code (`wrangler.jsonc`).

`baseUrl` must be `https://`. The check is `validateCaldavConfig`, and it also
turns the browser's opaque mixed-content block into a readable message.

## Consequences

- Any CalDAV server a visitor uses must send CORS headers permitting this app's
  origin. Most don't by default, Baikal included. The README gives the headers,
  and `test/integration/` proves them against a real Baikal behind Caddy.
- A server that can't send them can't work. The user guide lists which have been
  tried.
- No server-side request forgery risk, because no server makes the requests.
  The timeout and size cap in `bounded-fetch.ts` stay as protection for the tab,
  not as a security control.
- OMDb moved to the browser too. It already allows any origin, and leaving it on
  a server would have kept one credential on the operator's infrastructure while
  CalDAV's stayed off it.

This reverses the original proxy decision, which the archived design keeps
struck through. Source:
`openspec/changes/archive/2026-09-04-add-movie-planner-web-app/design.md`
(Decisions).
