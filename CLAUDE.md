# movie-planner-web

Bootstrapped from `alrayyes/scaffold-astro-site`, then adapted: CalDAV is
the app's sole data store (see `openspec/changes/add-movie-planner-web-app/`
for the full design). Fully static — the CalDAV and OMDb clients run in
the browser and call the visitor's own servers directly, so there's no
server-side application code at all, only static assets served by a
Cloudflare Worker (`wrangler.jsonc`). This means any CalDAV server a
visitor points the app at must send CORS headers permitting this app's
origin — see README.md's requirements section for the exact headers.

## Commands

```sh
bun install
bun run dev
bun run build
bun run check                # astro check
bun run test                 # playwright
bun run lint                 # biome check ., bun run format to fix
bun run format:check         # bun run lint:md, lint:prose, lint:mechanics too
```

Full list and what each one does: [CONTRIBUTING.md](CONTRIBUTING.md).

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
