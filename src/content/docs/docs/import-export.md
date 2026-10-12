---
title: Import and export
description: Move your watch history in and out as CSV or JSON.
---

## Exporting

"Export viewings" lives on the [Settings](/settings/) page, under Data.
It downloads your whole watch history (every OMDb-derived field
included: poster, ratings, everything), not just whatever's currently
filtered or shown on the overview. The file follows movie-planner's own
canonical field names, documented as a
[JSON Schema](https://github.com/alrayyes/movie-planner-web/blob/main/public/schemas/movie-viewings.schema.json)
— a file this app exports is readable by the command-line tool, and
vice versa.

## Importing

The Import page accepts a CSV or JSON file of viewings, up to 25 MB, chosen
or dropped onto the box on the page. It names the calendar it will write to
(or, with none connected, points you to the connect form), and links a sample
CSV to start from. Before writing
anything, it checks each row against both your existing calendar and the
other rows already in the file, and flags likely duplicates (same title,
close enough date) rather than importing them silently. A flagged row
starts unchecked — you decide whether "Import anyway" is right for it —
while every other row starts checked and ready to go.

Rows are written one at a time, with a progress bar that reads "Importing 12
of 148". If your calendar server answers that it's busy (a 423 or 429), the
import waits and tries that row again, up to three more times, before it
counts the row as failed. It waits as long as the server asks only if the
server sends `Access-Control-Expose-Headers: Retry-After`; otherwise it backs
off for 1, 2, then 4 seconds.

### Moving over from Letterboxd

Export your data from Letterboxd (Settings, Data, Export Your Data), unzip it,
and import its `diary.csv` here. The page spots it from its columns and asks
for a medium, because a diary doesn't say where you watched. Each entry becomes
a viewing on the date you watched it. The year, the rating, the tags (as a
note) and the Letterboxd link come along too. There's no time of day in a
diary, so viewings start at midnight. Only the diary file works; `ratings.csv`
has no watched date.

## Importing through the command-line tool instead

The [movie-planner command-line tool](https://github.com/alrayyes/movie-planner)
reads and writes the same calendar, so a large or pre-existing watch history
doesn't have to go through this app's Import page at all:

```sh
uv run movie-planner import movies.csv --force
```

`import` accepts the same CSV/JSON shape as this app's own export. For a
historical import spanning years, `--no-metadata` skips the OMDb lookup
so it doesn't run into OMDb's daily request limit — see the
command-line tool's own
[README](https://github.com/alrayyes/movie-planner#readme) for
backfilling ratings afterward with `sync refresh`.

The command-line tool never reads the calendar back on its own except
through one command: `sync pull` reconciles its local store against the
calendar, showing each new, changed, or removed entry for approval. Run
it after using this app to create, edit, or delete a viewing directly on
the calendar, so the command-line tool's own copy catches up.

## Managing venues and media

The Venues page lists every venue you've logged a viewing at, with a
count of viewings for each, and lets you add or rename entries in your
saved venue picklist — the same list this app's own log form and filter
autocomplete draw suggestions from, even for a venue that was only ever
logged through the command-line tool and never typed into this app.
