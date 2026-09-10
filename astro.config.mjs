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
    // has none.
    //
    // #451: this reverses an earlier decision to use Starlight's own
    // chrome as-is. `components` below swaps in this app's own
    // header/footer (src/components/starlight/{Header,Footer}.astro —
    // Starlight's documented override mechanism) so docs feels like a
    // first-class part of the site rather than a separate mini-site,
    // matching washy-washy-web's own `/docs/` pattern. Starlight's own
    // sidebar (docs-internal navigation) is untouched. The "Docs" link
    // itself lives on the Settings hub (settings.astro), not the top
    // nav — #436 deliberately shrank the top nav to 5 items to fit one
    // row on mobile, and a 6th item would undo that.
    starlight({
      title: "Movie Planner docs",
      description:
        "How to use movie-planner-web: connecting your own CalDAV server, logging viewings, the calendar overview, venues and their maps, CSV/JSON import/export, and keyboard shortcuts.",
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
      // #451: this app's own header/footer, in place of Starlight's own.
      components: {
        Header: "./src/components/starlight/Header.astro",
        Footer: "./src/components/starlight/Footer.astro",
      },
      // No search trigger — skips building a pagefind index over a
      // handful of pages nothing queries yet.
      pagefind: false,
      // #392: Starlight manages its own theme entirely independently —
      // its own ThemeProvider.astro reads/writes localStorage's
      // "starlight-theme" and sets <html data-theme>, while this app's
      // own toggle (Layout.astro/theme-toggle.ts, also mounted on docs
      // pages as of #451 via SiteHeader.astro) reads/writes a completely
      // different "movie-planner-web-theme" key and sets a .dark class
      // instead — so a preference set on the main app never reached the
      // docs. `head` entries render before Starlight's own ThemeProvider
      // (confirmed by reading Page.astro: <Head/>, which renders this
      // array, comes first) — this copies the app's own explicit choice
      // into Starlight's key before ThemeProvider reads it, so it always
      // wins; a visitor who never explicitly chose on the main app still
      // gets Starlight's own system-preference default, unchanged.
      //
      // #451: also applies the `.dark` class itself, mirroring
      // Layout.astro's own inline script — Starlight's sidebar/content
      // styling reacts to its own `data-theme` attribute above, but this
      // app's own header/footer (now shared onto docs pages) are styled
      // with Tailwind's `dark:` variant, which only reacts to `.dark` on
      // <html> (global.css's `@custom-variant dark`). Without this,
      // those two pieces of chrome would disagree on first paint.
      head: [
        {
          tag: "script",
          content: `(function(){try{var t=localStorage.getItem("movie-planner-web-theme");var dark=t==="dark"||(t!=="light"&&matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.classList.toggle("dark",dark);if(t==="dark"||t==="light"){localStorage.setItem("starlight-theme",t);}}catch(e){}})();`,
        },
      ],
      sidebar: [
        { label: "Overview", link: "/docs/" },
        { label: "Connecting your CalDAV server", link: "/docs/connecting/" },
        { label: "Logging a viewing", link: "/docs/logging/" },
        { label: "The calendar overview", link: "/docs/overview/" },
        { label: "The viewing heatmap", link: "/docs/heatmap/" },
        { label: "Venues", link: "/docs/venues/" },
        { label: "Import and export", link: "/docs/import-export/" },
        { label: "The activity log", link: "/docs/activity/" },
        { label: "Keyboard shortcuts", link: "/docs/keyboard-shortcuts/" },
      ],
    }),
  ],
  vite: {
    plugins: [tailwindcss()],
  },
});
