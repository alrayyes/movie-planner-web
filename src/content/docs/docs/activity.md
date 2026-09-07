---
title: The activity log
description: A local record of what this app itself has done to your calendar.
---

The Activity page is a local, per-browser record of every create, edit,
delete, refresh, or OMDb match this app itself makes — a point of
reference when something looks wrong and you want to know what actually
changed, rather than guessing.

It only ever covers what this browser did through this app: it doesn't
see anything the [movie-planner CLI](/docs/import-export/) does on its
own, and it isn't synced anywhere — clearing your browser's storage
clears it too. It's a debugging aid, not a permanent record, and the
oldest entries drop off once it gets large.

Each entry shows when it happened, what kind of action it was, the
viewing's title (linking straight to its details page), and for an edit
or refresh, exactly which fields changed with their old and new values.
