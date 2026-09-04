# movie-planner-web

[![CI](https://github.com/alrayyes/movie-planner-web/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/alrayyes/movie-planner-web/actions/workflows/ci.yml)
[![release](https://img.shields.io/github/v/release/alrayyes/movie-planner-web?sort=semver)](https://github.com/alrayyes/movie-planner-web/releases/latest)
[![licence](https://img.shields.io/badge/licence-GPL--3.0--or--later-blue.svg)](LICENSE)

A public web client for
[movie-planner](https://github.com/alrayyes/movie-planner) (the CLI that
logs the movies you've watched and syncs them to a CalDAV calendar). Point
it at your own CalDAV server and browse, log, and edit your watch history
from any browser — no install, no account with this service. CalDAV is the
only data store; there's no shared database and no server-side credential
storage. Only tested against [Baikal](https://sabre.io/baikal/) so far —
other CalDAV servers may or may not work.

**Status:** early scaffold. The full design — credentials, the CalDAV
proxy, the calendar overview, logging, editing, import, and location
management — is planned in
[`openspec/changes/add-movie-planner-web-app/`](openspec/changes/add-movie-planner-web-app/);
most of it isn't built yet.

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
  this project doesn't provision one.

## Installation

```sh
git clone https://github.com/alrayyes/movie-planner-web.git
cd movie-planner-web
bun install
```

## Usage

```sh
bun run dev       # dev server with hot reload, at localhost:4321
bun run build     # writes the Worker build to dist/
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
