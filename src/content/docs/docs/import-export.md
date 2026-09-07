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

## Importing through the CLI instead

The [movie-planner CLI](https://github.com/alrayyes/movie-planner) reads
and writes the same calendar, so a large or pre-existing watch history
doesn't have to go through this app's Import page at all:

```sh
uv run movie-planner import movies.csv --force
```

`import` accepts the same CSV/JSON shape as this app's own export. For a
historical import spanning years, `--no-metadata` skips the OMDb lookup
so it doesn't run into OMDb's daily request limit — see the CLI's own
[README](https://github.com/alrayyes/movie-planner#readme) for backfilling
ratings afterward with `sync refresh`.

The CLI never reads the calendar back on its own except through one
command: `sync pull` reconciles its local store against the calendar,
showing each new, changed, or removed entry for approval. Run it after
using this app to create, edit, or delete a viewing directly on the
calendar, so the CLI's own copy catches up.

## Managing venues and media

The Venues page lists every venue you've logged a viewing at, with a
count of viewings for each, and lets you add or rename entries in your
saved venue picklist — the same list this app's own log form and filter
autocomplete draw suggestions from, even for a venue that was only ever
logged through the CLI and never typed into this app.
