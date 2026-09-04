// @ts-check
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
  vite: {
    plugins: [tailwindcss()],
  },
});
