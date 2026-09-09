---
title: The calendar overview
description: Filtering, sorting, and the actions available on each row.
---

The overview is the home page — every logged viewing, most recently
watched first by default.

## Filtering

Filters and the "Refresh all metadata" action sit inside their own
bordered card, set apart from the results below. Expanding Filters
shows the everyday fields right away: From, To, Title, Medium, and
Venue. Everything else — Director, Actor, Genre, City, Movie country,
Movie language, Rated, Released year, and Released month — sits behind
a nested "More filters" toggle, so the common case doesn't mean scanning
past a dozen fields you rarely touch. A chip link that carries one of
those advanced filters (from a details page, Venues, or elsewhere)
expands "More filters" automatically, so the active value is never
hidden.

From and To date fields default to your own actual first and last logged
viewing, so they always show what's actually being applied rather than
looking blank while a narrower default silently filters underneath.
Medium, City, Movie country, Movie language, Rated, and Released year
are dropdowns listing only the values actually present in your own
history (plus an "Any" option) — there's nothing to type that could ever
match otherwise. Title, Venue, Director, Actor, and Genre stay free text
with autocomplete, since they're open-ended. City is the venue's own
location, when known; movie country and movie language are the film's
own OMDb-derived fields, a different thing from where you watched it —
there's no separate Country field for the venue's own location, since
two distinct cities sharing a name in different countries is a
negligible risk for a personal log. Director, actor, genre, movie
country, and movie language all match one exact value, not a
substring — a genre filter for "Action" won't also catch "Live Action
Adaptation", and a movie country filter for "United States" still
catches a co-production credited as "Australia, United States, China".

You can also filter by release year or month, matched independently of
each other — there's no exact-release-day filter; that's too granular
to be worth its own field.

Clicking a director, actor, or genre chip, a Rated/Language row, or the
month/year of the Released date, on a viewing's own details page takes
you straight to the overview pre-filtered to that exact value/
granularity. Clicking a city heading on the [Venues page](/docs/venues/)
does the same for every viewing at a venue in that city. When exactly
one such filter is active, the browser tab's title reflects it — for
example "Christopher Nolan (director) — Movie Planner" — so several
filtered tabs stay easy to tell apart. A long cast on a details page
shows only the first several actor chips, with a "+N more" toggle to
reveal the rest.

## Sorting and pagination

Click a column header (Title, When, Venue) to sort by it; click it again
to reverse direction. Results beyond the first page worth are paginated
rather than all rendered at once, and changing any filter resets you back
to the first page.

## Per-row actions

Each row shows a poster thumbnail, the title (linking to its details
page), when it was watched, and the venue — with a small location pin
next to it when that venue has known coordinates, linking straight to
the viewing's own details page and its real map. Edit, Delete, and a
refresh control for OMDb metadata sit at the end of the row as their
own icon buttons; Edit opens the details page with its edit form
already open, Delete asks for confirmation first.

## Map

Below the results table and pagination, the overview also shows a map
of whatever's currently filtered, one pin per viewing with a known
location — the same map [the map page](/docs/map/) and
[Venues](/docs/venues/) use, just scoped to the current filter instead
of your whole history. It sits after the table rather than before it,
so the primary list is reachable without scrolling (or tabbing) past a
secondary visualization. No filter, or nothing located yet, means no
map shows at all rather than an empty one.

## Sharing a single viewing

"Share" on a viewing's own details page generates a link to just that
one viewing, and shows it as a plain, selectable text field with a Copy
button next to it. On a browser that supports it, sharing tries the
native share sheet first; either way, the link itself is always shown,
since clipboard and native sharing can both fail depending on
browser/permission quirks a visitor has no control over. Anyone who
opens the link sees that one viewing read-only, with nothing to edit and
no CalDAV or OMDb credentials of yours anywhere in it — the link itself
carries the display data, frozen at the moment you shared it, so it
never updates and never asks the recipient to connect to anything.
Sharing your whole (or a filtered) history is what
[Export viewings](/docs/import-export/) is for instead.

## Cross-links

A viewing with a matched IMDb ID links out to its IMDb page; Rotten
Tomatoes and Letterboxd links are always shown but are constructed
searches rather than a guaranteed exact match, since OMDb doesn't expose
a stable ID for either. Each shows as its service's own brand mark rather
than a text label.
