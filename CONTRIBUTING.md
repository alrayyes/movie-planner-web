# Contributing

This file is for whoever changes this codebase. The [README](README.md) is
for whoever runs it.

## Getting set up

- **[bun](https://bun.sh) 1.3 or newer.** Runtime, test runner, package
  manager for the linter, and the [lefthook](https://lefthook.dev) that
  runs the git hooks — bun is the only thing to install.
- **[Vale](https://vale.sh)** on your `PATH`, for the style tier of the
  prose lint:

  ```sh
  go install github.com/errata-ai/vale/v3/cmd/vale@latest
  ```

  `ltex-cli-plus` needs nothing installed: the hook fetches and caches it
  on first use.

- **[Docker](https://docs.docker.com/get-docker/)**, only for integration
  tests (`bun run test:integration:up`) — everything else needs nothing
  beyond bun.

One command installs the linter, the git hooks, and their dependencies:

```sh
bun install
```

An uninstalled hook silently does nothing, which is worse than not having
one, so the `prepare` script runs `lefthook install` for you. You find out
at the pipeline otherwise, not at the commit.

`lefthook install` failing (no `.git` directory, no network) doesn't fail
`bun install` itself — Cloudflare's own build runs `bun install` too, and
a hook-installation failure there has no business blocking a deploy. Real
contributors always have a `.git` checkout, so this never bites locally.

## Everyday commands

Every one of these is what a hook or CI runs — see `lefthook.yml` and
`.github/workflows/*.yml` for exactly which.

```sh
bun run dev
bun run build
bun run check                # astro check, type-checks .astro and .ts together
bun run test                 # test:unit then test:e2e
bun run test:unit            # bun test, against a mocked fetch
bun run test:e2e             # playwright, against a build served through wrangler

bun run lint                 # biome check ., the check-only form
bun run format                # biome check --write ., the fixer

bun run format:check         # prettier --check (md/yml/astro), add --write to fix
bun run lint:md
bun run lint:prose           # vale
bun run lint:mechanics       # ltex-cli-plus
```

## Integration tests

`bun run test:unit` mocks every outbound CalDAV call; it proves the client
code is internally consistent, not that it actually speaks CalDAV
correctly to a real server. `test/integration/` closes that gap — real
Baikal and a Caddy TLS terminator, in containers:

```sh
bun run test:integration:up     # docker compose up, then runs Baikal's install wizard
bun run test:integration        # the actual tests, against that real instance
bun run test:integration:down   # tear down
```

Not part of `bun run test` or the default pre-push hook — it needs Docker,
which the rest of the suite doesn't, and CI runs it as its own `integration`
job. See `test/integration/compose.yaml`'s header comment for why
this layer exists at all, and `provision-baikal.sh`'s comment for why
provisioning is a scripted form-post replay rather than an API call —
Baikal has no non-interactive install path.

`cli-import.integration.test.ts` is the cross-tool half of this layer: a
real `movie-planner` CLI container (`ghcr.io/alrayyes/movie-planner:latest`,
a public image — no registry auth needed) importing a file shaped like
this app's own "Export as JSON", against the same Baikal instance. Needs
nothing beyond what's already documented above — `bun run test:integration`
pulls the image itself the first time it runs.

## How it fits together

There's no server-side application code — `astro.config.mjs` builds a
fully static site. `src/lib/caldav/client.ts` and `src/lib/omdb/client.ts`
run in the browser and call the visitor's own CalDAV/OMDb servers
directly, using whatever credentials the visitor entered (held only in
their own browser's IndexedDB, per `src/lib/credentials/`). This means any
CalDAV server a visitor points the app at has to send CORS headers
permitting this app's origin — README.md documents the exact headers, and
`test/integration/Caddyfile` is a real, tested example. See
`openspec/specs/` for the capability specs this app was built against
(`openspec/changes/archive/` holds the completed change that shipped
them).

Biome only lints a `.astro` file's frontmatter script, not the template
below it — a frontmatter import or prop used only in the template reads
as unused unless that line carries a `// biome-ignore` comment (see any
page under `src/pages/`, or `src/layouts/Layout.astro`). `public/` is
scoped off Biome entirely — Prettier (with `prettier-plugin-astro`)
formats `.astro` files, and `astro check` is what actually type-checks
them, template included. `tests/smoke.spec.ts` demonstrates the
Playwright pattern against the built output rather than the dev server —
see `playwright.config.ts`'s comment for why `wrangler dev` serves it
instead of `astro preview`.

## Keeping docs and the about page current

`src/content/docs/docs/*.md` (the `/docs/*` site) and `src/pages/about.astro`
both describe specific, current app behaviour — a new page, a changed
workflow, a UI feature worth a screenshot. Update whichever of them your
change actually affects in the same pull request, the same rule as the
README: a docs page or the about page that's gone stale costs the next
visitor (or agent) more than the two extra lines would have.

## Commit messages

[Conventional Commits](https://www.conventionalcommits.org/):
`type(scope): description`, types `feat`/`fix`/`docs`/`style`/`refactor`/
`perf`/`test`/`build`/`ci`/`chore`/`revert`. Subject under 50 characters,
lowercase, no trailing full stop. commitlint enforces the shape at
commit-msg and again in CI; the length and case rules are tighter than what
it checks, so hold to them anyway.

## Branching, review, and release

Every change goes through a pull request — nothing is pushed straight to
`main`, including the bootstrapping that built this repo. The default
branch is protected, so a direct push is rejected, not just discouraged.

The pull request **title** has to be a valid Conventional Commit too —
`pr-title.yml` checks it. commitlint only ever reads commit objects, and a
squash merge defaults its commit message to the pull request title, so this
is the only check standing between a badly titled pull request and a bad
message on `main`.

Once a pull request's checks are green, squash-merge it and delete the
branch. [release-please](https://github.com/googleapis/release-please)
reads the Conventional Commits on `main` and keeps a release pull request
open with the next version and changelog entry; merging that one tags the
release. Nobody picks a version by hand.

Deploys are separate from all of this: Cloudflare's own GitHub integration
watches the repo and builds/deploys on every push (preview per pull
request, production on `main`), configured on the Cloudflare dashboard,
not in this repo's workflows.
