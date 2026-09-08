import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { Loader } from "astro/loaders";
import { parseChangelog } from "./parse";

// #369: a custom Content Layer loader, same pattern this repo already
// uses for docs (content.config.ts's docsLoader) — the idiomatic Astro
// way to expose a derived, external data source as a typed, cached
// collection, rather than a raw `?raw` import parsed inline in a page's
// frontmatter. Reads via `config.root`, not a relative `import.meta.url`
// path — a loader's own module can end up bundled same as any other
// server code, and a relative path resolved against the wrong base
// silently 404s once bundled (see parse.ts's own git history for the
// page-level version of this exact mistake).
export function changelogLoader(): Loader {
  return {
    name: "changelog-loader",
    load: async ({ store, config, parseData, logger }) => {
      const changelogPath = fileURLToPath(new URL("CHANGELOG.md", config.root));
      const markdown = readFileSync(changelogPath, "utf-8");
      const releases = parseChangelog(markdown);

      store.clear();
      for (const release of releases) {
        // ChangelogRelease has no index signature, so it isn't
        // structurally a Record<string, unknown> on its own — parseData
        // re-validates it against the collection's own Zod schema
        // regardless, same as any other loader's raw input.
        const data = await parseData({
          id: release.version,
          data: release as unknown as Record<string, unknown>,
        });
        store.set({ id: release.version, data });
      }
      logger.info(`Loaded ${releases.length} user-relevant release(s) from CHANGELOG.md`);
    },
  };
}
