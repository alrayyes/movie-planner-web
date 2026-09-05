---
title: Import and export
description: Move your watch history in and out as CSV or JSON.
---

## Exporting

"Export as JSON" is reachable from the top of every page once you're
connected — not just the overview. It downloads your whole watch history
(every OMDb-derived field included: poster, ratings, everything), not
just whatever's currently filtered or shown on the page you're on. The
file follows movie-planner's own canonical field names, documented as a
[JSON Schema](https://github.com/alrayyes/movie-planner-web/blob/main/public/schemas/movie-viewings.schema.json)
— a file this app exports is readable by the CLI, and vice versa.

## Importing

The Import page accepts a CSV or JSON file of viewings. Before writing
anything, it checks each row against both your existing calendar and the
other rows already in the file, and flags likely duplicates (same title,
close enough date) rather than importing them silently. A flagged row
starts unchecked — you decide whether "Import anyway" is right for it —
while every other row starts checked and ready to go.

## Managing venues and media

The Venues page lists every venue you've logged a viewing at, with a
count of viewings for each, and lets you add or rename entries in your
saved venue picklist — the same list this app's own log form and filter
autocomplete draw suggestions from, even for a venue that was only ever
logged through the CLI and never typed into this app.
