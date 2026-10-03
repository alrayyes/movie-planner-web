# 1. CalDAV is the only data store

Status: accepted

## Context

The app is public and multi-tenant. Each visitor points it at their own CalDAV
server, and the operator must never hold anyone's credentials at rest. The
`movie-planner` command-line tool already keeps a watch history on a CalDAV
calendar, so the web client has to read and write the same data, not a copy.

## Decision

The visitor's CalDAV calendar is the sole store. There is no shared database
and no per-visitor state on any server this project runs. The browser holds
only credentials, preferences and caches.

The app sticks to standard CalDAV (RFC 4791, RFC 4918, RFC 5545) instead of
leaning on a server's extensions.

## Consequences

- No accounts, sessions or backups to run. The command-line tool and the web
  app see each other's changes because they share the calendar, and edits made
  elsewhere show up in the local activity record.
- No offline mode and no write queue. A write either reaches the server or
  fails visibly.
- Only Baikal is tested. Other servers may or may not work, and most can't be
  reached from a browser at all without CORS headers
  ([ADR 2](0002-fully-static-with-browser-side-clients.md)).
- Most pages need the whole history, because the filters run on custom
  properties and CalDAV servers differ on filtering by those, so each page
  downloads everything
  ([ADR 6](0006-viewings-are-cached-in-the-browser.md)).
- The calendar must accept `VJOURNAL` components
  ([ADR 3](0003-picklists-live-in-a-sidecar-vjournal.md)).

Source: `openspec/changes/archive/2026-09-04-add-movie-planner-web-app/design.md`
(Context and Goals).
