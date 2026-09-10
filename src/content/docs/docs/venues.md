---
title: Venues
description: Every venue you've logged a viewing at, or added to your saved list, with a count.
---

The "Venues" page lists every venue you've ever logged a viewing at,
along with any venue you've saved but not watched anything at yet, each
with a count of logged viewings there. Clicking a venue name takes you
to a dedicated page for that venue alone — its own results, pagination,
and map, with no filter controls.

A From/To date range narrows the counts to that window; clearing it
goes back to your whole history.

## Where the list comes from

A venue shows up here two ways: from a calendar entry that has it as
its venue, or from adding it through the log or edit form's "Add
venue" button — a small form of its own (name, street address, postal
code, city, country) rather than free text, so a venue's data is
structured from the moment it's created. The venue field itself is
always a select, offering only venues you've already added or logged
at; a genuinely new one always goes through "Add venue" first, and
becomes selectable immediately after. The two sources are merged, so a
venue you've saved but haven't watched anything at yet still shows
here with a count of zero.

## Grouped by country and city

A venue the CLI recognizes from its own hardcoded chain table shows up
grouped under its country and city, each with a map above its own
table pinning just that city's venues. A venue the CLI doesn't
recognize — anything typed in free-form, or not yet backfilled with a
city/country — falls into a single "Other locations" section instead
of being dropped. If nothing on your calendar has a known city/country
yet, the page shows one flat table, same as before this grouping
existed.

## The map

Any venue with known coordinates gets a pin on the map above its
table. Click a pin for its name and an "Open in Maps" link to the
exact location on OpenStreetMap's own site, for more precision than
the map itself gives.

Venue coordinates aren't typed in here — a venue's saved entry is the
source of truth for its own location. They can come from
[movie-planner](https://github.com/alrayyes/movie-planner) (the CLI),
or from this app's own "Add venue" form, which offers an optional
address-search field (powered by [Nominatim](https://nominatim.org/),
OpenStreetMap's free geocoder) to attach them right there when you add
a new venue — skippable, and never run automatically. Once a venue has
coordinates (and city/country/street address), selecting it on the log
or edit form attaches all of it to that viewing automatically, no
re-entry needed.

Loading any of this page's maps loads real map tiles from
OpenStreetMap, which does mean an automatic request to a third party
whenever a map with pins is on screen — see the [privacy
page](/privacy) for the full picture, including what OpenStreetMap and
Nominatim do and don't see. Your CalDAV and OMDb credentials are never
part of either request. A viewing's own details page shows the same
kind of map too, already centred on that one venue.
