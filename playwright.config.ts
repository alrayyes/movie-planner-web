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
  //
  // #640: 3 workers is still too many specifically on CI's own
  // `ubuntu-24.04` runner (2 vCPUs) — a different failure mode from the
  // crash above, and a genuinely separate finding, not the same bug
  // re-described. Confirmed directly: a computed-style check
  // (`assertInputFontSizeAtLeast16px`, tests/responsive.spec.ts) that
  // finds zero small-font inputs in 100% of isolated local runs failed
  // deterministically across two full CI runs in a row, every time on
  // the exact same test (all three viewports) — but never once across
  // several full local runs on this dev machine's own, much higher core
  // count. That shape (reliable alone, unreliable only under full-suite
  // parallel load, and only on the more CPU-constrained runner) is CPU
  // contention slowing a fresh element's style application past the
  // moment a getComputedStyle() check reads it — not a real product bug
  // and not the crash-under-load case above. 2 workers on CI (still 3
  // locally, where the extra core headroom means this doesn't reproduce)
  // trades some CI wall-clock time for actually matching what CI can
  // reliably run in parallel.
  workers: process.env.CI ? 2 : 3,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  // #526: a dead webServer (workerd/wrangler crashing mid-suite) doesn't
  // fail fast — every queued test just fails its own retries against a
  // server that's never coming back, and that can burn through CI's
  // entire job timeout before this whole `playwright test` process ever
  // exits. The job's own `|| retry` wrapper (#502) restarts the server on
  // a second invocation, but only gets a chance to run once the first
  // invocation actually returns — so it needs a hard ceiling well under
  // the job's own timeout, not the job timeout itself. Bumped alongside
  // #640's own 2-workers-on-CI change above: a real attempt was already
  // taking 2.9-3.2 minutes at 3 workers per CI's own logs, leaving little
  // headroom against the old 5-minute ceiling once 2 workers make each
  // attempt slower still.
  globalTimeout: process.env.CI ? 7 * 60 * 1000 : undefined,
  // #573: a second, machine-readable reporter alongside the human-readable
  // one — Codecov Test Analytics needs JUnit XML to show per-test
  // failure/flake detail on a PR, not just a coverage delta. CI-only: a
  // local run has no Codecov upload step to feed it.
  reporter: process.env.CI
    ? [["list"], ["junit", { outputFile: "playwright-report/junit.xml" }]]
    : "list",
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
