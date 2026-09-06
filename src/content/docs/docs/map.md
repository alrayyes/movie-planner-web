---
title: The map
description: Every located viewing on one map, and a single venue's own map on its details page.
---

The "Map" page pins every logged viewing whose venue has known
coordinates onto one map. A viewing whose venue has no coordinates on
record is simply left off — not an error, just nothing to plot yet.

![The map page, zoomed to a pin in Amsterdam, in light mode](/screenshots/map-light.png)
![The map page, zoomed to a pin in Amsterdam, in dark mode](/screenshots/map-dark.png)

Click a pin for its title (linking straight to that viewing's own
details page) and an "Open in Maps" link to the exact location on
OpenStreetMap's own site, for more precision than the map itself gives.

A single viewing's own details page shows the same kind of map too,
already centred on that one venue, next to its other fields.

## Where coordinates come from

Venue coordinates aren't typed in here — they come from
[movie-planner](https://github.com/alrayyes/movie-planner) (the CLI),
which is the source of truth for everything on your calendar, this
field included. When you log or edit a viewing at a venue with no
coordinates on record yet, both forms offer an optional address-search
field (powered by [Nominatim](https://nominatim.org/), OpenStreetMap's
free geocoder) to attach them right there — skippable, and never run
automatically. Logging again at a venue that already has coordinates
reuses them without asking.

## A note on privacy

Opening either map loads real map tiles from OpenStreetMap, which does
mean an automatic request to a third party whenever a map with pins is
on screen — see the [privacy page](/privacy) for the full picture,
including what OpenStreetMap and Nominatim do and don't see. Your
CalDAV and OMDb credentials are never part of either request.
