---
title: The activity log
description: A local record of what this app, and anything else touching your calendar, has done.
---

The Activity page is a local, per-browser record of every create, edit,
delete, refresh, or OMDb match this app makes to your calendar — a
point of reference when something looks wrong and you want to know
what actually changed, rather than guessing.

It isn't synced anywhere — clearing your browser's storage clears it
too. It's a debugging aid, not a permanent record, and the oldest
entries drop off once it gets large.

Each entry shows when it happened, what kind of action it was, who made
it, the viewing's title (linking straight to its details page), and
for an edit or refresh, exactly which fields changed with their old and
new values.

## Changes made outside this browser

This app also notices a change made anywhere else that writes to the
same calendar — the [movie-planner CLI](/docs/import-export/), another
device, another browser. Every time this app opens, it compares your
full calendar against what it last saw and logs anything that changed
since, attributed to whoever made it (shown as "CLI", or "Unknown" when
it can't tell).

A few things follow from how that works:

- **It only catches the net change since your last visit here.** Two
  edits made elsewhere between two of your visits collapse into one
  logged change, not two.
- **A deleted viewing still shows up as deleted**, even though the
  underlying calendar entry is gone — the log entry is built from what
  this app last saw locally, not from the vanished entry itself.
- **A brand-new browser's first visit logs nothing.** It has no prior
  state to compare against yet, so it quietly remembers what's there
  now rather than reporting your entire existing history as newly
  created.
- **Each browser only knows what changed since _that browser's_ own
  last visit.** Two browsers used unevenly build different, incomplete
  pictures of "what changed" — the same per-browser, not-synced-anywhere
  nature the rest of this log already has.
- **Attribution needs the CLI to write it too.** This app always tags
  its own writes so a change you make here is never logged twice —
  once when you make it, and again the next time this app notices it
  itself. A CLI version that doesn't yet write that same tag still gets
  logged here; it just shows up as "Unknown" rather than "CLI".
