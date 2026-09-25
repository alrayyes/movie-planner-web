---
title: WebMCP tools
description: Letting a compatible in-browser agent log, edit, search, and (later) import/export your watch history on your behalf.
---

[WebMCP](https://github.com/webmachinelearning/webmcp) is a draft browser
API — still a nascent W3C incubation, not a ratified standard — that
lets a web page declare tools an in-browser AI agent can discover and call,
the way this app's own UI already lets you log, edit, delete, and search
your watch history by hand. As of this writing only Chrome has an
experimental, flag-gated implementation, so this is progressive
enhancement: nothing changes for anyone whose browser or agent doesn't
support it.

## Turn it on

These tools are **off by default**. Turn them on from
[Settings](/settings), next to your other stored credentials: "Let a
compatible in-browser agent act on your behalf (WebMCP)". They're off by
default deliberately — one of the tools below permanently deletes a
viewing, and WebMCP's own `consequentialHint` (a hint that asks an agent's
UI to confirm before calling a tool marked this way) is a request to the
agent, not something this app can enforce. Treat turning this on the same
way you'd treat handing someone else the keys to your own calendar app.

## What runs, and where

Exactly the same client-side CalDAV client this app's own UI already
uses (`src/lib/caldav/client.ts`) — no new server, no new credential
store, nothing that leaves your browser. A WebMCP tool's handler runs in
this page's own JavaScript, the same trust boundary as everything else
here: see the [README](https://github.com/alrayyes/movie-planner-web#readme)'s
"nothing in between" guarantee for the full claim.

## The tools

- **`log_viewing`** — logs a manually watched title (title, when, medium,
  and the optional fields the manual log form itself offers).
- **`edit_viewing`** — changes fields on an already-logged viewing by its
  uid, leaving anything not mentioned untouched.
- **`delete_viewing`** — permanently removes a logged viewing. An agent
  should confirm with you before calling this — it cannot be undone.
- **`search_viewings`** — filters your watch history by the same fields
  the [calendar overview](/docs/overview/)'s own filters use (title,
  medium, venue, director, actor, genre, city, the movie's own
  country/language, rated, and released year/month), capped to a default
  of 50 matches per call so a large history doesn't flood the agent's own
  context.

Import and export aren't covered yet — see
[alrayyes/movie-planner-web#667](https://github.com/alrayyes/movie-planner-web/issues/667)
for that follow-up.
