---
title: Venues
description: Every venue you've logged a viewing at, or added to your saved list, with a count.
---

The "Venues" page lists every venue you've ever logged a viewing at,
along with any venue you've saved but not watched anything at yet, each
with a count of logged viewings there. Clicking a venue name takes you
to the calendar overview, filtered to that exact venue.

A From/To date range narrows the counts to that window; clearing it
goes back to your whole history.

## Where the list comes from

A venue shows up here two ways: from a calendar entry that has it as
its venue, or from typing a new venue into the log or edit form's Venue
field (autocomplete offers venues you've used before, but a new one
still works — it's just not offered as a suggestion until this list
picks it up). The two are merged, so a venue you've saved but haven't
watched anything at yet still shows here with a count of zero.

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
table — see [the map page](/docs/map/) for where those coordinates
come from and the same privacy note about third-party tile requests.
