import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
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
