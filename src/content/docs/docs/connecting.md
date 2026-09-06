---
title: Connecting your CalDAV server
description: Point the app at your own CalDAV server and, optionally, an OMDb key.
---

:::caution
**Use at your own risk.** This is beta software, not yet fully tested.
It reads, writes, and deletes events directly on the CalDAV server you
point it at — set up a calendar dedicated to your movie viewings
rather than pointing it at one you also use for anything else, so a
bug here can't touch anything that matters. See the disclaimer page
(linked in the footer) for the full terms.
:::

The first time you open the app, it asks for three things: your CalDAV
server's URL, your username, and your password. These are stored only in
your own browser (IndexedDB) — never sent anywhere except straight to
the CalDAV URL you give it.

![The first-load connect form, in light mode](/screenshots/connect-form-light.png)
![The first-load connect form, in dark mode](/screenshots/connect-form-dark.png)

Your CalDAV server has to allow requests from this app's origin (CORS).
If you're setting one up yourself, the
[README's requirements section](https://github.com/alrayyes/movie-planner-web#readme)
has the exact headers and working examples for Caddy, nginx, and Traefik.
If connecting fails, that's the first thing to check — a CORS failure
usually shows as a generic network error with no further detail from the
browser.

## OMDb key (optional)

Adding an [OMDb API key](https://www.omdbapi.com/apikey.aspx) on the
connect form or the settings page enables posters, ratings, and
cross-links to IMDb, Rotten Tomatoes, and Letterboxd when you log a
viewing. Without one, logging and editing still work — you just get
plain entries with no artwork or metadata.

OMDb's free tier caps you at 1,000 requests a day. If you're importing or
logging a large batch, tick "Pause OMDb lookups" (also on the settings
page) to skip every OMDb call without losing the stored key, then use
"Refresh metadata" on individual entries (or "Refresh all" on the
overview) once you're ready to fetch it.

## Switching accounts or servers

There's no separate "log out" — editing the URL, username, or password on
the settings page and saving just points the app at a different calendar.
Nothing is retained from the previous connection beyond what your browser
already cached.
