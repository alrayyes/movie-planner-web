---
title: Logging a viewing
description: Log a viewing manually, or by pasting a Pathé booking email.
---

The "Log a viewing" page offers two ways in.

## Manually

Fill in the title, when you watched it, the medium (cinema, Netflix,
Blu-ray — whatever you want to call it), and optionally the venue. With
an OMDb key set, the app looks up the title on save and fills in the
poster, director, actors, genre, and ratings automatically.

## From a Pathé booking email

If you book cinema tickets through Pathé, paste the confirmation email's
text directly into the "Log from a Pathé booking email" box (or upload
the `.eml` file itself) and click parse. The app reads the film title,
showtime, and cinema out of the email and shows you what it found before
saving anything — nothing is written until you confirm.

## Editing and deleting

Once logged, a viewing can be edited or deleted from its own details
page (click the title from the overview) — not from the overview row
itself, which stays focused on browsing rather than doubling as an edit
form.

## Refreshing metadata

If a viewing was logged without OMDb enrichment (no key set at the time,
or no confident match found), use "Refresh" on its details page, or
"Refresh all metadata" on the overview to catch up every unmatched entry
on the current page at once. If OMDb can't confidently match a title —
usually because of a typo, an alternate title, or too little to go on —
you'll see a picker with OMDb's own search candidates (poster and year
included) to choose the right one from, or you can continue without
metadata and try again later.

## Fixing a wrong match

"Refresh" only runs when a viewing has no metadata yet. If OMDb matched
the wrong film entirely — a remake, a same-titled short, a typo that
still happened to resolve to something — use "Search OMDb" on the
details page instead. It's available any time, defaults the search to
the viewing's current title, and lets you pick a different result from
the same poster-and-year picker. Choosing one overwrites every
OMDb-derived field (poster, director, actors, genre, ratings, synopsis),
but never the viewing's own logged title, venue, or watch time.
