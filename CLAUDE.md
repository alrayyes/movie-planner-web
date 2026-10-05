# movie-planner-web

- Bootstrapped from `alrayyes/scaffold-astro-site`, then adapted.
- CalDAV is the app's sole data store. The full design is in
  `openspec/changes/archive/2026-09-04-add-movie-planner-web-app/`.
- Fully static: the CalDAV, OMDb and TMDb clients run in the browser and call
  the visitor's own servers directly. There's no server-side app code, only
  static assets served by a Cloudflare Worker (`wrangler.jsonc`).
- Any CalDAV server a visitor points the app at must send CORS headers
  permitting this app's origin. The exact headers are in README.md's
  requirements section.

## Commands

```sh
bun install
bun run dev
bun run build
bun run check                # astro check
bun run test                 # unit tests, then Playwright
bun run lint                 # biome check .
```

- `bun run format` fixes what `lint` finds. `format:check`, `lint:md`,
  `lint:prose`, `lint:mechanics`, `lint:tailwind` and `lint:claude` are the rest
  of what the hooks run.
- Full list and what each one does: [CONTRIBUTING.md](CONTRIBUTING.md).

## Gotchas

- **`astro preview` backgrounds itself immediately** rather than staying in
  the foreground — confirmed against the real binary, not assumed. That
  breaks Playwright's `webServer`, which needs a process it can manage the
  lifecycle of. `wrangler dev` is used instead everywhere a local server is
  needed (`playwright.config.ts`, `bun run preview`) — it's also the more
  representative choice, since it serves the same static build Cloudflare's
  own deploy does.
- **TypeScript is pinned to 6.0.3, not latest.** `astro check`'s compiler
  API isn't exposed by TypeScript 7's native compiler yet — confirmed by
  actually running `astro check` under 7.0.2 and reading the error, not
  guessed. Check <https://github.com/withastro/roadmap/discussions/1321>
  before bumping past 6.x.
- **Biome only lints a `.astro` file's frontmatter script, not the
  template below it** — confirmed live, not assumed: a frontmatter
  import/prop used only in the template reads as unused
  (`noUnusedImports`/`noUnusedVariables`) unless the specific line carries
  a `// biome-ignore` comment, which every page's `Layout` import and
  `Layout.astro`'s own `title` prop need. `public/` is scoped out of
  Biome entirely (static assets, not source). Prettier
  (`prettier-plugin-astro`) formats `.astro` files; `astro check`
  type-checks them, template included.
- **Renovate can't reach this repo.** It's GitHub-primary; Dependabot
  (`.github/dependabot.yml`) is what raises dependency pull requests here.
- **CI's `security` job (Semgrep) isn't in the pre-push hook.** A change the
  hook passes can still fail it, as `bunfig.toml` did in #734.
  - Run it before pushing, in the image pinned in
    `.github/workflows/ci.yml`:

    ```sh
    docker run --rm -v "$PWD":/src -w /src <that image> \
      semgrep scan --config auto --error
    ```

- **`bun run test:e2e` runs in a network namespace that has only loopback.**
  - Chromium aborts in-flight script requests with
    `net::ERR_NETWORK_CHANGED` whenever the host's interfaces change, such as
    Docker starting a container. A page never hydrated and a test timed out
    waiting for `#caldav-url`. Loading `/` 120 times during Docker network
    churn failed 116 pages on the host and none in the namespace (#640).
  - `scripts/in-private-network.sh` does it with `unshare -Urn`. CI, a machine
    without user namespaces and `E2E_HOST_NETWORK=1` run on the host network
    instead. A headed run needs `E2E_HOST_NETWORK=1`, because the X server's
    socket lives in the host namespace.
  - It also gives each run its own port 4321, so two checkouts no longer share
    a server.
  - One flake is left, about 1% on "removes the event once confirmed", with
    a different cause (#747). A test that fails with `Viewing not found.` and
    passes alone is that one.
- **Stryker runs on Node, and only its test children run on bun** (#728).
  - `stryker.config.mjs` builds `bun.testFiles` from `src/lib/**/*.test.ts`. The
    runner takes an explicit list and with none it discovers every test in the
    repo, including the Baikal integration tests. A glob string is passed
    through literally and matches nothing.
  - `bun.inspectorTimeout` is 20 seconds. The default 5 failed the dry run here
    with `Timeout waiting for inspector URL`.
  - The CI job mutates only changed lines, because a full run takes about nine
    minutes and scores 50 (#749 tracks the backlog).
  - `package.json`'s `overrides.qs` is 6.16.0 because Stryker's
    `typed-rest-client` pins `qs` to exactly 6.15.1, which `bun audit` flags
    (three moderate advisories, patched in 6.16.0). Drop the override once
    Stryker's own dependency moves past 6.15.3, and re-run `bun audit`.
- **`package.json`'s `overrides.js-yaml` pins a version Astro's own build
  needs.**
  - Cause: `markdownlint-cli2` depends on `js-yaml@5` (pure ESM, no default
    export). Astro core and `@astrojs/starlight` still depend on `js-yaml@^4`
    (CJS, `import yaml from "js-yaml"`). Without the override, bun hoists
    whichever version's range is narrower to the project root.
  - Symptom, confirmed live and identical under real Node: `bun run build`
    fails in Astro's prerender step with `The requested module 'js-yaml' does
not provide an export named 'default'`. The failing code is a bundled `.mjs`
    under `dist/.prerender/` with no `node_modules` of its own, so its bare
    `import "js-yaml"` resolves against whatever is hoisted at the root, not
    the nested copy under `astro/node_modules/js-yaml`.
  - Fix: pin the override to `4.3.2`. It leaves `markdownlint-cli2` working
    (confirmed via `bun run lint:md`), because bun still nests that tool's own
    dependents at `4.3.2` and nothing in `js-yaml@4`'s public API broke
    `markdownlint`'s usage.
  - Bump only after re-testing both `bun run build` and `bun run lint:md`.
