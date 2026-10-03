# 3. Venue and medium lists live in a sidecar VJOURNAL

Status: accepted

## Context

The log form offers a list of known venues and media. With the calendar as the
only data store ([ADR 1](0001-caldav-is-the-only-data-store.md)), that list has
to live there too, or it would vanish with the browser's storage.

## Decision

The lists are stored in one `VJOURNAL` in the visitor's calendar, with the
fixed identifier `movie-planner-web-config` and the data in a plain
`DESCRIPTION`. The app fetches it with a targeted request, not by walking the
collection. A missing journal means empty lists, and the first "add a venue" or
"add a medium" creates it.

## Consequences

- The calendar must accept `VJOURNAL`. On Baikal that is the "Notes" checkbox in
  the calendar's settings. With it off, connecting and logging still work, but
  nothing added to a list survives a reload, and no error shows. The README says
  how to check.
- Venue entries later gained structured fields (city, country, coordinates). The
  parser still reads the older name-only form.
- Lists are small and fetched live. The viewings cache
  ([ADR 6](0006-viewings-are-cached-in-the-browser.md)) deliberately doesn't
  include them.

Source: `openspec/changes/archive/2026-09-04-add-movie-planner-web-app/design.md`
(Decisions).
