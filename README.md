# movie-planner-web

[![CI](https://github.com/alrayyes/movie-planner-web/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/alrayyes/movie-planner-web/actions/workflows/ci.yml)
[![release](https://img.shields.io/github/v/release/alrayyes/movie-planner-web?sort=semver)](https://github.com/alrayyes/movie-planner-web/releases/latest)
[![licence](https://img.shields.io/badge/licence-GPL--3.0--or--later-blue.svg)](LICENSE)

A public web client for
[movie-planner](https://github.com/alrayyes/movie-planner) (the CLI that
logs the movies you've watched and syncs them to a CalDAV calendar). Point
it at your own CalDAV server and browse, log, and edit your watch history
from any browser — no install, no account with this service. It's a fully
static site: your browser talks straight to your CalDAV server, with
nothing in between. There's no shared database and no server, of any
kind, that ever sees your credentials — not even in transit. Only tested
against [Baikal](https://sabre.io/baikal/) so far — other CalDAV servers
may or may not work.

**Status:** credentials, the calendar overview, logging (manual and Pathé
email parsing), editing, and bulk CSV/JSON import are built. Location
management (media/venue picklists) is still planned — see
[`openspec/changes/add-movie-planner-web-app/`](openspec/changes/add-movie-planner-web-app/)
for the full design and what's left.

## Requirements

- **[bun](https://bun.sh) 1.3 or newer.** It's the package manager, the
  runner for every script below, and the [lefthook](https://lefthook.dev)
  that runs the git hooks.
- A **Cloudflare account**, only for deploying — `bun run dev`/`build`/
  `check`/`test` need nothing external. Cloudflare's own GitHub
  integration builds and deploys this repo directly (preview builds per
  pull request, production on `main`); there's no deploy step to run by
  hand or configure here.
- Your own **CalDAV calendar** (Baikal or otherwise) to point the app at —
  this project doesn't provision one. **It has to send CORS headers
  permitting this app's origin**, since your browser talks to it directly:

  ```text
  Access-Control-Allow-Origin: *
  Access-Control-Allow-Methods: GET, PUT, DELETE, REPORT, PROPFIND, OPTIONS
  Access-Control-Allow-Headers: Authorization, Content-Type, Depth
  ```

  Baikal (and sabre/dav generally) doesn't send these by default — add them
  at whatever sits in front of it (a reverse proxy like Caddy or nginx). A
  request without `Authorization` in the allowed headers, or without a
  preflight `OPTIONS` response answered _before_ it reaches your CalDAV
  server (which would otherwise reject the credential-less preflight
  request with a 401), fails before your credentials are ever checked.
  `test/integration/Caddyfile` in this repo is a complete, tested Caddy
  example fronting a real Baikal instance. For nginx:

  ```nginx
  location / {
      if ($request_method = OPTIONS) {
          add_header Access-Control-Allow-Origin "https://your-movie-planner-web-origin" always;
          add_header Access-Control-Allow-Methods "GET, PUT, DELETE, REPORT, PROPFIND, OPTIONS" always;
          add_header Access-Control-Allow-Headers "Authorization, Content-Type, Depth" always;
          add_header Access-Control-Max-Age 3600 always;
          add_header Content-Length 0;
          return 204;
      }

      add_header Access-Control-Allow-Origin "https://your-movie-planner-web-origin" always;
      add_header Access-Control-Allow-Methods "GET, PUT, DELETE, REPORT, PROPFIND, OPTIONS" always;
      add_header Access-Control-Allow-Headers "Authorization, Content-Type, Depth" always;

      proxy_pass http://your-baikal-backend;
  }
  ```

  Two nginx-specific gotchas, confirmed against a real deployment: without
  the `if ($request_method = OPTIONS) { return 204; }` block, nginx
  proxies the preflight straight through to sabre/dav, which rejects it
  (browsers never send credentials on a preflight) — the request fails
  before your credentials are ever checked, and the browser reports it as
  a plain CORS failure with no further detail. And `add_header` only
  attaches to 2xx/3xx responses without `always`, so an actual request
  that comes back as anything else (like an unreachable-origin 5xx) still
  fails CORS on top of whatever else was wrong.

  If Baikal runs in Docker behind **Traefik** (common with an image like
  `ckulka/baikal`, which bundles its own internal nginx you don't
  otherwise edit), attach a CORS middleware to the router instead of
  touching any nginx configuration directly:

  ```yaml
  labels:
    - "traefik.http.middlewares.baikal-cors.headers.accessControlAllowMethods=GET,PUT,DELETE,REPORT,PROPFIND,OPTIONS"
    - "traefik.http.middlewares.baikal-cors.headers.accessControlAllowHeaders=Authorization,Content-Type,Depth"
    - "traefik.http.middlewares.baikal-cors.headers.accessControlAllowOriginList=https://your-movie-planner-web-origin"
    - "traefik.http.middlewares.baikal-cors.headers.accessControlMaxAge=3600"
    - "traefik.http.middlewares.baikal-cors.headers.addVaryHeader=true"
    - "traefik.http.routers.<your-baikal-router>.middlewares=baikal-cors"
  ```

  Once `accessControlAllowOriginList`/`accessControlAllowMethods` are set
  on a router's middleware, Traefik answers the preflight `OPTIONS`
  request itself and never forwards it to the backend — the same
  short-circuit the preceding nginx `if` block does by hand, without adding a
  second reverse proxy in front of the one already there.

## Installation

```sh
git clone https://github.com/alrayyes/movie-planner-web.git
cd movie-planner-web
bun install
```

## Usage

```sh
bun run dev       # dev server with hot reload, at localhost:4321
bun run build     # writes the static build to dist/
bun run preview   # serves the build through wrangler — what the real deploy runs
bun run check     # astro check — type-checks .astro and .ts files together
bun run test      # unit tests, then Playwright against a build served through wrangler
```

Deploying isn't a local command or part of this repo's own CI — Cloudflare's
GitHub integration builds and deploys on every push, independent of the
[release job](.github/workflows/release.yml), which only tags versions.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for the toolchain, the hooks, and how
a change gets reviewed and released.

## Licence

[GPL-3.0-or-later](LICENSE).
