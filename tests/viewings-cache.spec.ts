import { expect, type Page, test } from "@playwright/test";
import type { LoggedViewing } from "../src/lib/caldav/types";
import { mockCaldavServer } from "./support/mock-caldav";

// #715: pages render from a browser-side copy of the viewings, and refresh
// from the server behind it. The server's answer is held back by hand so
// "the page showed the cached list first" is a fact about ordering, not
// about timing.

const CALDAV_URL = "https://caldav.example.com/calendars/me/movies/";
const CREDENTIALS = {
  "caldav-url": CALDAV_URL,
  "caldav-username": "me",
  "caldav-password": "secret-password-value",
};

const viewing = (uid: string, title: string, genre: string): LoggedViewing => ({
  uid,
  title,
  start: "2026-09-20T17:30:00Z",
  end: "2026-09-20T19:45:00Z",
  medium: "cinema",
  genre,
});
const DUNE = viewing("dune-uid", "Dune", "Drama");
const ANORA = viewing("anora-uid", "Anora", "Thriller");

test.use({ timezoneId: "UTC" });

async function connect(page: Page, username = CREDENTIALS["caldav-username"]) {
  await page.goto("/");
  await page.locator("#caldav-url").fill(CREDENTIALS["caldav-url"]);
  await page.locator("#caldav-username").fill(username);
  await page.locator("#caldav-password").fill(CREDENTIALS["caldav-password"]);
  await page.getByRole("button", { name: "Connect" }).click();
  await expect(page.getByRole("button", { name: "Log a viewing" })).toBeVisible();
}

// Holds every REPORT (the viewings list) until `release()`. Registered after
// mockCaldavServer, so it sees each request first and hands it on afterwards.
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

test.describe("cached viewings, refreshed in the background", () => {
  test("a reload shows the cached list before a slow server answers, then updates when it differs", async ({
    page,
  }) => {
    const server = mockCaldavServer(page, CALDAV_URL, [DUNE]);
    await connect(page);
    await expect(page.locator("tbody tr")).toHaveCount(1);

    server.viewings.set(ANORA.uid, ANORA); // changed elsewhere
    const release = holdReports(page);
    await page.reload();

    // Cached, with the server still silent: the old list, no spinner-only page.
    await expect(page.locator("tbody tr")).toHaveCount(1);
    await expect(page.getByRole("link", { name: "Dune" }).first()).toBeVisible();

    release();
    await expect(page.locator("tbody tr")).toHaveCount(2);
    await expect(page.getByRole("link", { name: "Anora" }).first()).toBeVisible();
  });

  test("another page (genres) does the same, from the same cached copy", async ({ page }) => {
    const server = mockCaldavServer(page, CALDAV_URL, [DUNE]);
    await connect(page);
    await page.goto("/genres");
    await expect(page.locator("tbody tr")).toHaveCount(1);

    server.viewings.set(ANORA.uid, ANORA);
    const release = holdReports(page);
    await page.goto("/genres");

    await expect(page.locator("tbody tr")).toHaveCount(1);
    release();
    await expect(page.locator("tbody tr")).toHaveCount(2);
  });

  test("a cold visit still waits for the server, as before", async ({ page }) => {
    mockCaldavServer(page, CALDAV_URL, [DUNE]);
    const release = holdReports(page);
    await page.goto("/");
    await page.locator("#caldav-url").fill(CREDENTIALS["caldav-url"]);
    await page.locator("#caldav-username").fill(CREDENTIALS["caldav-username"]);
    await page.locator("#caldav-password").fill(CREDENTIALS["caldav-password"]);
    await page.getByRole("button", { name: "Connect" }).click();

    await expect(page.getByText("Loading…")).toBeVisible();
    await expect(page.locator("tbody tr")).toHaveCount(0);
    release();
    await expect(page.locator("tbody tr")).toHaveCount(1);
  });

  test("a delete shows on the next page at once, with no stale row from the cache", async ({
    page,
  }) => {
    mockCaldavServer(page, CALDAV_URL, [DUNE, ANORA]);
    await connect(page);
    await expect(page.locator("tbody tr")).toHaveCount(2);
    await page.getByRole("link", { name: "Dune" }).first().click();
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "Delete", exact: true }).click();
    await expect(page.locator("#movie-status")).toHaveText("Deleted.", { timeout: 15000 });

    const release = holdReports(page);
    await page.goto("/");

    // Server still silent: this is the cache alone.
    await expect(page.getByRole("link", { name: "Anora" }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: "Dune" })).toHaveCount(0);
    release();
    await expect(page.locator("tbody tr")).toHaveCount(1);
  });

  test("pointing the app at another account drops the cached list", async ({ page }) => {
    mockCaldavServer(page, CALDAV_URL, [DUNE]);
    await connect(page);
    await expect(page.getByRole("link", { name: "Dune" }).first()).toBeVisible();

    await page.goto("/settings");
    await page.locator("#caldav-username").fill("someone-else");
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByRole("status")).toHaveText("Saved.");

    const release = holdReports(page);
    await page.goto("/");
    await expect(page.getByText("Loading…")).toBeVisible();
    await expect(page.getByRole("link", { name: "Dune" })).toHaveCount(0);
    release();
  });

  test("keeps the viewings, and never the password, in the cache", async ({ page }) => {
    mockCaldavServer(page, CALDAV_URL, [DUNE]);
    await connect(page);
    await expect(page.locator("tbody tr")).toHaveCount(1);

    const stored = await page.evaluate(
      () =>
        new Promise<string>((resolve, reject) => {
          const open = indexedDB.open("movie-planner-web-viewings-cache");
          open.onerror = () => reject(open.error);
          open.onsuccess = () => {
            const db = open.result;
            const tx = db.transaction(["viewings", "meta"], "readonly");
            const all: unknown[] = [];
            let pending = 2;
            for (const name of ["viewings", "meta"]) {
              const req = tx.objectStore(name).getAll();
              req.onsuccess = () => {
                all.push(...req.result);
                if (--pending === 0) resolve(JSON.stringify(all));
              };
              req.onerror = () => reject(req.error);
            }
          };
        }),
    );

    expect(stored).toContain("dune-uid");
    expect(stored).not.toContain(CREDENTIALS["caldav-password"]);
  });
});
