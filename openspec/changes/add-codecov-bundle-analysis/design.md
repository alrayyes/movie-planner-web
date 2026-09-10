## Context

See proposal.md - Why. `astro build` runs in more than one place: this
repo's own CI "test" job (via Playwright's `webServer`, the same static
build Cloudflare's own deploy runs — see `ci.yml`'s existing comment on
that), and Cloudflare's own separate Workers Build integration, configured
outside any workflow this repo controls. Only the former has a Codecov
token available to it.

## Goals / Non-Goals

**Goals:** a size-delta comment on a PR that changes the bundle, without
risking either the real Cloudflare deploy or a plain local build.

**Non-Goals:** instrumenting Cloudflare's own Workers Build pipeline — no
token is configured there, and that pipeline isn't reachable from anything
this repo's own configuration controls.

## Decisions

- The plugin is only added to `integrations` when `process.env.CODECOV_TOKEN`
  is actually set. Cloudflare's Workers Build runs `astro build` too, with
  no token configured there; a local `astro build`/`astro dev` has neither a
  token nor anything to compare against. Confirmed live: a build with the
  token set attempts an upload and fails gracefully on a bad token rather
  than crashing the build; a build with no token skips the plugin entirely
  — identical output and build time to before this change.
- The published package's own README shows `import { codecovAstroPlugin }
from "@codecov/astro-plugin"` (a named export). The actual 2.0.1 build
  only exports it as `default` — confirmed by reading
  `node_modules/@codecov/astro-plugin/dist/index.mjs` directly, and by the
  named import genuinely failing at config-load time ("does not provide an
  export named 'codecovAstroPlugin'"). Imported via the default export
  instead, aliased to the same name the docs use everywhere else.
- `@codecov/astro-plugin`'s declared peer dependency range is `astro: "4.x
|| 5.x"`; this repo runs Astro 7.3.1 — a real mismatch, not a false
  warning. Confirmed live anyway: `astro build` completes successfully with
  the plugin active, both with a real-shaped token and with none, so it's
  functionally compatible for this basic bundle-stats-and-upload use
  despite the declared range. Worth re-checking whenever Astro's own major
  version next moves.
- `CODECOV_TOKEN` is exposed as a plain env var on the CI "test" job's own
  "playwright test" step (in addition to the existing upload actions'
  `with: token:` input) — that's the step whose child process (`astro
build`, spawned by Playwright's `webServer`) is the one that actually
  needs to read it from `process.env`.

## Open Questions

None outstanding from implementation — confirmed via local build runs, both
with and without the token set. The acceptance criterion "a PR that changes
the bundle shows a size-delta comment from Codecov" needs a real
bundle-changing PR against the live Codecov integration to check, which
isn't verifiable from this session; see tasks.md.
