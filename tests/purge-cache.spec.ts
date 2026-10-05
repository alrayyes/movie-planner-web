import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import type { LoggedViewing } from "../src/lib/caldav/types";
import { mockCaldavServer } from "./support/mock-caldav";

// #765: Settings has a button that clears this browser's local copy of the
// server's data (the viewings cache and the service worker's cache), for a
// device that shows stale or missing viewings. The server's answer is held back
// by hand, as in viewings-cache.spec.ts, so "the page showed the cached list" and
// "the page had nothing cached" are facts about ordering, not about timing.

const CALDAV_URL = "https://caldav.example.com/calendars/me/movies/";
const CREDENTIALS = {
  "caldav-url": CALDAV_URL,
  "caldav-username": "me",
  "caldav-password": "secret-password-value",
};
const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

const viewing = (uid: string, title: string): LoggedViewing => ({
  uid,
  title,
  start: "2026-09-20T17:30:00Z",
  end: "2026-09-20T19:45:00Z",
  medium: "cinema",
});
const DUNE = viewing("dune-uid", "Dune");
const ANORA = viewing("anora-uid", "Anora");

test.use({ timezoneId: "UTC" });

async function connect(page: Page) {
  await page.goto("/");
  await page.locator("#caldav-url").fill(CREDENTIALS["caldav-url"]);
  await page.locator("#caldav-username").fill(CREDENTIALS["caldav-username"]);
  await page.locator("#caldav-password").fill(CREDENTIALS["caldav-password"]);
  await page.getByRole("button", { name: "Connect" }).click();
  await expect(page.getByRole("button", { name: "Log a viewing" })).toBeVisible();
}

// Holds every REPORT (the viewings list) until `release()`.
function holdReports(page: Page) {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  page.route(`${new URL(CALDAV_URL).origin}/**`, async (route) => {
    if (route.request().method() === "REPORT") await gate;
    await route.fallback();
  });
  return release;
}

// How many records an object store holds, or -1 when the database or the store
// isn't there. Never opens a database that doesn't exist: that would create it
// empty, and the app's own first open would then find it already at its version
// and never build the stores. Read through the page, because that's where the
// browser's databases are.
function recordCount(page: Page, database: string, store: string) {
  return page.evaluate(
    async ([db, name]) => {
      const known = await indexedDB.databases();
      if (!known.some((entry) => entry.name === db)) return -1;
      return new Promise<number>((resolve, reject) => {
        const open = indexedDB.open(db);
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const handle = open.result;
          if (!handle.objectStoreNames.contains(name)) {
            handle.close();
            resolve(-1);
            return;
          }
          const count = handle.transaction(name).objectStore(name).count();
          count.onerror = () => reject(count.error);
          count.onsuccess = () => {
            handle.close();
            resolve(count.result);
          };
        };
      });
    },
    [database, store] as const,
  );
}

const VIEWINGS_CACHE = "movie-planner-web-viewings-cache";

test.describe("clearing the local cache from Settings", () => {
  test("drops the cached viewings, so the overview waits for the server instead of showing a stale list", async ({
    page,
  }) => {
    mockCaldavServer(page, CALDAV_URL, [DUNE, ANORA]);
    await connect(page);
    await expect(page.locator("tbody tr")).toHaveCount(2);
    await expect.poll(() => recordCount(page, VIEWINGS_CACHE, "viewings")).toBe(2);

    // With the server held, a reload shows what's cached: the list the button
    // is for.
    const release = holdReports(page);
    await page.reload();
    await expect(page.locator("tbody tr")).toHaveCount(2);

    await page.goto("/settings");
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "Clear local cache" }).click();
    await expect(page.locator("purge-cache-button").getByRole("status")).toContainText("cleared");
    expect(await recordCount(page, VIEWINGS_CACHE, "viewings")).toBe(0);

    // Nothing is cached now, so with the server still held there's nothing to show.
    await page.goto("/");
    await expect(page.locator("tbody tr")).toHaveCount(0);
    release();
    await expect(page.locator("tbody tr")).toHaveCount(2);
  });

  test("leaves the credentials and the activity log alone", async ({ page }) => {
    mockCaldavServer(page, CALDAV_URL, [DUNE]);
    await connect(page);
    await expect(page.locator("tbody tr")).toHaveCount(1);
    // One entry of the kind the app writes itself, so there's something to lose.
    // The activity log's database is created on first use, so build it the way
    // the app does (same name, version and store) if it isn't there yet.
    await page.evaluate(
      () =>
        new Promise<void>((resolve, reject) => {
          const open = indexedDB.open("movie-planner-web-activity-log", 1);
          open.onupgradeneeded = () => {
            if (!open.result.objectStoreNames.contains("entries")) {
              open.result.createObjectStore("entries", { keyPath: "id", autoIncrement: true });
            }
          };
          open.onerror = () => reject(open.error);
          open.onsuccess = () => {
            const tx = open.result.transaction("entries", "readwrite");
            tx.objectStore("entries").add({
              at: new Date().toISOString(),
              action: "created",
              uid: "seeded",
              title: "Seeded Entry",
              actor: "web",
            });
            tx.oncomplete = () => {
              open.result.close();
              resolve();
            };
            tx.onerror = () => reject(tx.error);
          };
        }),
    );
    const before = {
      credentials: await recordCount(page, "movie-planner-web", "credentials"),
      activity: await recordCount(page, "movie-planner-web-activity-log", "entries"),
    };
    expect(before.activity).toBeGreaterThan(0);

    await page.goto("/settings");
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "Clear local cache" }).click();
    await expect(page.locator("purge-cache-button").getByRole("status")).toContainText("cleared");

    expect(await recordCount(page, "movie-planner-web-activity-log", "entries")).toBe(
      before.activity,
    );
    // Still connected: the overview opens without asking for credentials again.
    await page.goto("/");
    await expect(page.getByRole("button", { name: "Log a viewing" })).toBeVisible();
    await page.goto("/activity");
    await expect(page.getByText("Seeded Entry")).toBeVisible();
  });

  test("does nothing when the visitor cancels the confirmation", async ({ page }) => {
    mockCaldavServer(page, CALDAV_URL, [DUNE]);
    await connect(page);
    await expect(page.locator("tbody tr")).toHaveCount(1);
    await expect.poll(() => recordCount(page, VIEWINGS_CACHE, "viewings")).toBe(1);

    await page.goto("/settings");
    page.once("dialog", (dialog) => dialog.dismiss());
    await page.getByRole("button", { name: "Clear local cache" }).click();

    expect(await recordCount(page, VIEWINGS_CACHE, "viewings")).toBe(1);
    await expect(page.locator("purge-cache-button").getByRole("status")).toHaveCount(0);
  });

  test("passes the axe-core scan, with and without a message", async ({ page }) => {
    mockCaldavServer(page, CALDAV_URL, [DUNE]);
    await connect(page);
    await page.goto("/settings");
    await expect(page.getByRole("button", { name: "Clear local cache" })).toBeVisible();
    expect((await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze()).violations).toEqual([]);

    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "Clear local cache" }).click();
    await expect(page.locator("purge-cache-button").getByRole("status")).toContainText("cleared");
    expect((await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze()).violations).toEqual([]);
  });
});
