---
title: Movie Planner docs
description: Point movie-planner-web at your own CalDAV server and browse, log, and edit your watch history from any browser.
---

Movie Planner is a public web client for
[movie-planner](https://github.com/alrayyes/movie-planner), the CLI that
logs movies you've watched and syncs them to a CalDAV calendar. It's
fully static: your browser talks straight to your own CalDAV server, and
your credentials never pass through a server this project runs.

These pages cover using the app itself. If you're setting up a CalDAV
server or deploying your own copy, start with the
[README](https://github.com/alrayyes/movie-planner-web#readme) instead —
it covers the requirements (CORS headers your CalDAV server needs, an
optional OMDb key) and the developer setup.

- **[Connecting your CalDAV server](/docs/connecting/)** — pointing the
  app at your calendar for the first time.
- **[Logging a viewing](/docs/logging/)** — manually, or by pasting a
  Pathé booking email.
- **[The calendar overview](/docs/overview/)** — filtering, sorting, and
  the actions available on each row.
- **[The viewing heatmap](/docs/heatmap/)** — a GitHub-contribution-style
  view of your own viewing density.
- **[Venues](/docs/venues/)** — every venue you've logged a viewing at,
  with a count.
- **[The map](/docs/map/)** — every located viewing pinned on one map.
- **[Import and export](/docs/import-export/)** — moving your watch
  history in and out as CSV or JSON.
- **[Keyboard shortcuts](/docs/keyboard-shortcuts/)** — vim-style
  navigation on the overview.
