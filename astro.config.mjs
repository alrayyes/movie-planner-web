// @ts-check
import cloudflare from "@astrojs/cloudflare";
import { defineConfig } from "astro/config";

// The CalDAV proxy needs real server-side request handlers (src/pages/api/*),
// not a static build — output: "server" plus the Cloudflare adapter runs the
// whole app, page routes and API routes alike, as one Worker.
// https://astro.build/config
export default defineConfig({
  output: "server",
  adapter: cloudflare(),
});
