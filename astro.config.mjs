// @ts-check
import svelte from "@astrojs/svelte";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "astro/config";

// Fully static — the CalDAV and OMDb clients run in the browser and call
// the visitor's own servers directly (see design.md's "Decisions": no
// server-side proxy, so no visitor's credentials ever transit a server
// this project runs, and no `src/pages/api/*` needing a Worker to execute
// it). No adapter needed; Cloudflare serves the static `dist/` output
// directly as Worker assets (`wrangler.jsonc`).
// https://astro.build/config
export default defineConfig({
  output: "static",
  // #102: an Astro island for new components going forward (not a
  // rewrite of the existing vanilla Web Components, which coexist with
  // Svelte islands fine on the same page) — state changes drive the
  // template directly instead of a manual `this.render()` call after
  // every mutation.
  integrations: [svelte()],
  vite: {
    plugins: [tailwindcss()],
  },
});
