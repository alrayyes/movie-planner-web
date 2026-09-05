// @ts-check
import starlight from "@astrojs/starlight";
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
  integrations: [
    svelte(),
    // #71: content lives one level deeper than Starlight's own default
    // (src/content/docs/docs/, not src/content/docs/) specifically so
    // its pages land under /docs/... instead of taking over the site's
    // root — same approach washy-washy-web uses for the same reason.
    // No `locales`/i18n config, unlike that sibling project — this app
    // has none. Starlight's own chrome (header/sidebar/theme toggle) is
    // used as-is rather than reskinned into this app's own — a much
    // smaller surface than washy-washy-web's marketing site, so a
    // visitor landing on /docs from a search engine loses little by not
    // seeing this app's own nav there too.
    starlight({
      title: "Movie Planner docs",
      description:
        "How to use movie-planner-web: connecting your own CalDAV server, logging viewings, the calendar overview, CSV/JSON import/export, and keyboard shortcuts.",
      social: [
        {
          icon: "github",
          label: "GitHub",
          href: "https://github.com/alrayyes/movie-planner-web",
        },
      ],
      editLink: {
        baseUrl: "https://github.com/alrayyes/movie-planner-web/edit/main/",
      },
      customCss: ["./src/styles/global.css"],
      // No search trigger — skips building a pagefind index over a
      // handful of pages nothing queries yet.
      pagefind: false,
      sidebar: [
        { label: "Overview", link: "/docs/" },
        { label: "Connecting your CalDAV server", link: "/docs/connecting/" },
        { label: "Logging a viewing", link: "/docs/logging/" },
        { label: "The calendar overview", link: "/docs/overview/" },
        { label: "Import and export", link: "/docs/import-export/" },
        { label: "Keyboard shortcuts", link: "/docs/keyboard-shortcuts/" },
      ],
    }),
  ],
  vite: {
    plugins: [tailwindcss()],
  },
});
