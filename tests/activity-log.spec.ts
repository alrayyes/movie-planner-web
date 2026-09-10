import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import { mockCaldavServer } from "./support/mock-caldav";

const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

const CREDENTIALS = {
  "caldav-url": "https://caldav.example.com/calendars/me/movies/",
  "caldav-username": "me",
  "caldav-password": "secret",
};

const DUNE = {
  uid: "dune-uid",
  title: "Dune",
  start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
  end: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000 + 2.5 * 60 * 60 * 1000).toISOString(),
  medium: "cinema",
};

async function connect(page: Page) {
  await page.goto("/");
  await page.locator("#caldav-url").fill(CREDENTIALS["caldav-url"]);
  await page.locator("#caldav-username").fill(CREDENTIALS["caldav-username"]);
  await page.locator("#caldav-password").fill(CREDENTIALS["caldav-password"]);
  await page.getByRole("button", { name: "Connect" }).click();
  // #435: was `getByRole("status").first()` — that's the overview's
  // count line, which no longer holds text once loading finishes, so
  // it's no longer a safe signal that the connect actually landed.
  await expect(page.getByRole("link", { name: "Log a viewing" })).toBeVisible();
}

test.describe("activity log", () => {
  test("says nothing recorded yet, with a clean a11y scan, before any action", async ({ page }) => {
    mockCaldavServer(page, CREDENTIALS["caldav-url"], []);
    await connect(page);

    await page.goto("/activity");
    await expect(page.getByText("Nothing recorded yet")).toBeVisible();

    const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
    expect(results.violations).toEqual([]);
  });

  test("records logging a new viewing", async ({ page }) => {
    mockCaldavServer(page, CREDENTIALS["caldav-url"], []);
    await connect(page);
    await page.getByRole("link", { name: "Log a viewing" }).click();

    await page.locator("#log-title").fill("Paddington");
    await page.locator("#log-date").fill("2026-02-01");
    await page.locator("#log-start-time").fill("18:00");
    await page.locator("#log-end-time").fill("19:40");
    await page.locator("#log-medium").fill("netflix");
    await page.getByRole("button", { name: "Log viewing" }).click();
    await expect(page.getByRole("status")).toHaveText("Logged.");

    await page.goto("/activity");
    await expect(page.getByText("1 entry")).toBeVisible();
    const row = page.locator("tbody tr");
    await expect(row).toContainText("Created");
    await expect(row).toContainText("Paddington");
  });

  test("records an edit with the field-level before/after values, and a delete", async ({
    page,
  }) => {
    mockCaldavServer(page, CREDENTIALS["caldav-url"], [DUNE], {
      media: [],
      venues: [{ name: "Grand Vista Cinema" }],
    });
    await connect(page);
    await page.getByRole("link", { name: "Dune", exact: true }).click();

    await page.getByRole("button", { name: "Edit" }).click();
    await page.locator("#details-venue").selectOption("Grand Vista Cinema");
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByRole("status")).toHaveText("Saved.");

    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "Delete" }).click();
    await expect(page.getByRole("status")).toHaveText("Deleted.");

    await page.goto("/activity");
    await expect(page.getByText("2 entries")).toBeVisible();
    const rows = page.locator("tbody tr");
    // Most recent first: the delete, then the edit.
    await expect(rows.nth(0)).toContainText("Deleted");
    await expect(rows.nth(0)).toContainText("Dune");
    await expect(rows.nth(1)).toContainText("Updated");
    await expect(rows.nth(1)).toContainText("venue");
    await expect(rows.nth(1)).toContainText("Grand Vista Cinema");
  });

  // #436: moved from a top-level nav item to a Settings hub link.
  test("the Activity link is reachable from the Settings hub once connected", async ({ page }) => {
    mockCaldavServer(page, CREDENTIALS["caldav-url"], []);
    await connect(page);
    await page.goto("/settings");
    await expect(page.getByRole("link", { name: "Activity" })).toHaveAttribute("href", "/activity");
  });

  // #442: this store read had no failure path at all before — a
  // rejected list() left the page blank forever, worse than blending an
  // error into routine status text. It now gets the same distinct,
  // assertively announced error toast every other component uses.
  test("a broken activity-log store shows a distinct error toast instead of a blank page", async ({
    page,
  }) => {
    mockCaldavServer(page, CREDENTIALS["caldav-url"], []);
    await connect(page);

    // Simulates IndexedDB being unavailable, scoped to just this
    // store's own database name (private browsing, a broken profile) —
    // indexedDB.open's request errors only for
    // "movie-planner-web-activity-log", which indexeddb-store.ts's
    // openDatabase() turns into a rejected promise. Credentials'
    // own IndexedDB store (a different database name) is left alone —
    // proxying rather than replacing `indexedDB` outright is what keeps
    // this scoped to the one store under test.
    await page.addInitScript(() => {
      const real = window.indexedDB;
      const proxy = new Proxy(real, {
        get(target, prop, receiver) {
          if (prop === "open") {
            // biome-ignore lint/suspicious/noExplicitAny: matching IDBFactory#open's own loose signature
            return (name: string, ...rest: any[]) => {
              if (name === "movie-planner-web-activity-log") {
                const request: {
                  onerror: (() => void) | null;
                  onsuccess: (() => void) | null;
                  onupgradeneeded: (() => void) | null;
                  error: Error;
                } = {
                  onerror: null,
                  onsuccess: null,
                  onupgradeneeded: null,
                  error: new Error("Simulated IndexedDB failure"),
                };
                setTimeout(() => request.onerror?.(), 0);
                return request;
              }
              return target.open(name, ...rest);
            };
          }
          const value = Reflect.get(target, prop, receiver);
          return typeof value === "function" ? value.bind(target) : value;
        },
      });
      Object.defineProperty(window, "indexedDB", { configurable: true, value: proxy });
    });

    await page.goto("/activity");

    const toast = page.getByRole("alert");
    await expect(toast).toBeVisible();
    await expect(toast).toContainText(/Simulated IndexedDB failure/);
    await expect(page.getByText("Nothing recorded yet")).toHaveCount(0);

    const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
    expect(results.violations).toEqual([]);

    await page.getByRole("button", { name: "Dismiss error" }).click();
    await expect(toast).toHaveCount(0);
  });
});

// #432: diffs a full CalDAV fetch against a local snapshot on every sync
// to surface changes this app didn't make itself. `syncCaldavActivityLog`
// runs fire-and-forget from CalendarOverview.svelte's own mount, so every
// test here waits for the network to go quiet before either mutating the
// mock server's state or reading the activity log back — otherwise a
// navigation could cut the background sync off mid-flight.
test.describe("diff-derived activity from CalDAV (#432)", () => {
  test("a fresh browser's first sync logs nothing for its pre-existing history", async ({
    page,
  }) => {
    mockCaldavServer(page, CREDENTIALS["caldav-url"], [DUNE]);
    await connect(page);
    await page.waitForLoadState("networkidle");

    await page.goto("/activity");
    await expect(page.getByText("Nothing recorded yet")).toBeVisible();
  });

  test("a change made outside this browser appears on the next sync, attributed to the CLI", async ({
    page,
  }) => {
    const server = mockCaldavServer(page, CREDENTIALS["caldav-url"], [DUNE]);
    await connect(page);
    await page.waitForLoadState("networkidle"); // first sync: bootstrap only

    // Simulates the movie-planner CLI editing this same viewing while
    // this browser wasn't looking, and attributing its own write —
    // exactly what #432's design expects the CLI to start doing.
    server.viewings.set(DUNE.uid, {
      ...DUNE,
      venue: "Pathé De Munt",
      lastModifiedBy: "cli",
    });

    await page.reload(); // this app's next sync
    await page.waitForLoadState("networkidle");

    await page.goto("/activity");
    await expect(page.getByText("1 entry")).toBeVisible();
    const row = page.locator("tbody tr");
    await expect(row).toContainText("Updated");
    await expect(row).toContainText("CLI");
    await expect(row).toContainText("Dune");
    await expect(row).toContainText("venue");
    await expect(row).toContainText("Pathé De Munt");
  });

  test("a change deleted outside this browser is logged from the last-known snapshot", async ({
    page,
  }) => {
    const server = mockCaldavServer(page, CREDENTIALS["caldav-url"], [DUNE]);
    await connect(page);
    await page.waitForLoadState("networkidle");

    server.viewings.delete(DUNE.uid);

    await page.reload();
    await page.waitForLoadState("networkidle");

    await page.goto("/activity");
    await expect(page.getByText("1 entry")).toBeVisible();
    const row = page.locator("tbody tr");
    await expect(row).toContainText("Deleted");
    await expect(row).toContainText("Dune");
    await expect(row).toContainText("Unknown");
  });

  // #432 dedup: an edit this browser makes itself is logged once by
  // client.ts's write-time path — the diff pass, run again on the very
  // next sync, must not log the exact same change a second time just
  // because it also shows up in the fresh fetch.
  test("a self-made edit is logged exactly once, not doubled by the next sync's diff pass", async ({
    page,
  }) => {
    mockCaldavServer(page, CREDENTIALS["caldav-url"], [DUNE], {
      media: [],
      venues: [{ name: "Grand Vista Cinema" }],
    });
    await connect(page);
    await page.waitForLoadState("networkidle"); // bootstrap

    await page.getByRole("link", { name: "Dune", exact: true }).click();
    await page.getByRole("button", { name: "Edit" }).click();
    await page.locator("#details-venue").selectOption("Grand Vista Cinema");
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByRole("status")).toHaveText("Saved.");

    await page.goto("/"); // this app's next sync
    await page.waitForLoadState("networkidle");

    await page.goto("/activity");
    await expect(page.getByText("1 entry")).toBeVisible();
    const row = page.locator("tbody tr");
    await expect(row).toContainText("Updated");
    await expect(row).toContainText("This app");
    await expect(row).toContainText("Grand Vista Cinema");
  });

  // design.md's own risk/trade-off: the diff pass always fetches this
  // app's full, unfiltered calendar (importCheckRange), independent of
  // the overview's own From/To filter — a filtered fetch would
  // misread anything outside the filter as deleted.
  test("narrowing the overview's own filter doesn't misread an out-of-filter viewing as deleted", async ({
    page,
  }) => {
    const paddington = {
      uid: "paddington-uid",
      title: "Paddington",
      start: new Date(Date.now() - 200 * 24 * 60 * 60 * 1000).toISOString(),
      end: new Date(Date.now() - 200 * 24 * 60 * 60 * 1000 + 100 * 60 * 1000).toISOString(),
      medium: "netflix",
    };
    mockCaldavServer(page, CREDENTIALS["caldav-url"], [DUNE, paddington]);
    await connect(page);
    await page.waitForLoadState("networkidle"); // bootstrap: seeds both

    // Narrows the visible table to a range covering only Dune —
    // Paddington still exists on the server, just outside this filter.
    await page.getByText("Filters", { exact: true }).click();
    const from = new Date(Date.now() - 35 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const to = new Date(Date.now() - 25 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    await page.locator("#overview-from").fill(from);
    await page.locator("#overview-to").fill(to);
    await page.getByRole("button", { name: "Filter", exact: true }).click();
    await expect(page.locator("tbody tr")).toHaveCount(1);

    await page.reload(); // this app's next sync, filter persisted via sessionStorage
    await page.waitForLoadState("networkidle");
    await expect(page.locator("tbody tr")).toHaveCount(1);

    await page.goto("/activity");
    await expect(page.getByText("Nothing recorded yet")).toBeVisible();
  });

  test("this app attributes its own writes with X-LAST-MODIFIED-BY: web", async ({ page }) => {
    const server = mockCaldavServer(page, CREDENTIALS["caldav-url"], []);
    await connect(page);
    await page.getByRole("link", { name: "Log a viewing" }).click();

    await page.locator("#log-title").fill("Paddington");
    await page.locator("#log-date").fill("2026-02-01");
    await page.locator("#log-start-time").fill("18:00");
    await page.locator("#log-end-time").fill("19:40");
    await page.locator("#log-medium").fill("netflix");
    await page.getByRole("button", { name: "Log viewing" }).click();
    await expect(page.getByRole("status")).toHaveText("Logged.");

    expect(server.creates).toHaveLength(1);
    expect(server.creates[0]?.lastModifiedBy).toBe("web");
  });
});
