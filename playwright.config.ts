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
  // #640: even 2 workers is too many specifically on CI's own
  // `ubuntu-24.04` runner (2 vCPUs) — a different failure mode from the
  // crash above, and a genuinely separate finding, not the same bug
  // re-described. A computed-style check (`assertInputFontSizeAtLeast16px`,
  // tests/responsive.spec.ts) that finds zero small-font inputs in 100% of
  // isolated local runs, and that a from-scratch expect.poll() rewrite
  // still couldn't recover within a 5s window, failed on four consecutive
  // full CI runs in a row — the last two already at 2 workers, one with
  // real workerd "Broken pipe"/"Connection reset by peer" server-side
  // errors logged mid-run (non-fatal individually, other tests kept
  // passing around them, but real evidence of connection-level stress
  // under concurrent load). Local simulation at 2 workers only reproduced
  // this roughly 1 run in 3, well below CI's 4-for-4 — CI's own hardware
  // has less headroom than any local simulation of "2 workers" can
  // capture. 1 worker (fully serial — no concurrent requests to the
  // shared wrangler dev server at all) is the only setting left that
  // removes this class of contention outright, still 3 locally where
  // none of this reproduces.
  workers: process.env.CI ? 1 : 3,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  // #526: a dead webServer (workerd/wrangler crashing mid-suite) doesn't
  // fail fast — every queued test just fails its own retries against a
  // server that's never coming back, and that can burn through CI's
  // entire job timeout before this whole `playwright test` process ever
  // exits. The job's own `|| retry` wrapper (#502) restarts the server on
  // a second invocation, but only gets a chance to run once the first
  // invocation actually returns — so it needs a hard ceiling well under
  // the job's own timeout, not the job timeout itself. Bumped again
  // alongside #640's own 1-worker-on-CI change above: a serial run takes
  // meaningfully longer wall-clock than either parallel setting did.
  globalTimeout: process.env.CI ? 10 * 60 * 1000 : undefined,
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
