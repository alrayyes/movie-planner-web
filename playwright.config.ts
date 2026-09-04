import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  // The default (one worker per core) crashes the shared `wrangler dev`
  // instance under concurrent load — confirmed by hand: reproducible
  // workerd "Network connection lost" crashes at 8 workers (roughly 1 run
  // in 3), none at 3 workers across 8 repeated runs. A wrangler/workerd
  // local-dev stability limit, not an application bug. Once it crashes,
  // every subsequent test fails with connection-refused, retries included,
  // since the webServer isn't restarted between them — so CI's own
  // retries: 2 below can't recover from it either.
  workers: 3,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: "list",
  use: {
    baseURL: "http://localhost:4321",
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  // Playwright builds and serves the Worker through wrangler, not
  // `astro preview` — Astro's own preview server backgrounds itself instead
  // of staying in the foreground Playwright's webServer expects, and
  // wrangler is the more representative server anyway: it's what the
  // Cloudflare Worker deploy actually runs on.
  webServer: {
    command: "bun run build && bun run preview",
    url: "http://localhost:4321",
    reuseExistingServer: !process.env.CI,
  },
});
