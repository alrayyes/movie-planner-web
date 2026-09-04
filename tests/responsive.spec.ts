import { expect, type Page, test } from "@playwright/test";
import { mockCaldavServer } from "./support/mock-caldav";

const CREDENTIALS = {
  "caldav-url": "https://caldav.example.com/calendars/me/movies/",
  "caldav-username": "me",
  "caldav-password": "secret",
};

const VIEWPORTS = [
  { name: "mobile", width: 375, height: 812 },
  { name: "desktop", width: 1280, height: 800 },
];

async function assertNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => {
    return document.documentElement.scrollWidth - document.documentElement.clientWidth;
  });
  expect(overflow).toBeLessThanOrEqual(1);
}

// Relative to `now`, not a fixed calendar date — the mock CalDAV server
// filters by the requested time-range like a real one would, and
// calendar-overview's default range is only the last 3 months.
const ONE_MONTH_AGO = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

async function connect(page: Page) {
  mockCaldavServer(page, CREDENTIALS["caldav-url"], [
    {
      uid: "dune-uid",
      title: "Dune",
      start: ONE_MONTH_AGO.toISOString(),
      end: new Date(ONE_MONTH_AGO.getTime() + 2.5 * 60 * 60 * 1000).toISOString(),
      medium: "cinema",
      venue: "Grand Vista Cinema",
      director: "Denis Villeneuve",
      actors: "Timothée Chalamet, Zendaya",
      ratingImdb: "8.0",
      ratingRottenTomatoes: "83%",
      ratingMetacritic: "74",
    },
  ]);
  await page.goto("/");
  await page.locator("#caldav-url").fill(CREDENTIALS["caldav-url"]);
  await page.locator("#caldav-username").fill(CREDENTIALS["caldav-username"]);
  await page.locator("#caldav-password").fill(CREDENTIALS["caldav-password"]);
  await page.getByRole("button", { name: "Connect" }).click();
  await expect(page.getByRole("link", { name: "Settings" })).toBeVisible();
}

for (const viewport of VIEWPORTS) {
  test.describe(`${viewport.name} layout`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } });

    test("credentials form has no horizontal overflow", async ({ page }) => {
      await page.goto("/");
      await assertNoHorizontalOverflow(page);
    });

    test("calendar overview (with a full-metadata row and edit mode) has no horizontal overflow", async ({
      page,
    }) => {
      await connect(page);
      await assertNoHorizontalOverflow(page);

      await page.getByRole("button", { name: "Edit" }).click();
      await assertNoHorizontalOverflow(page);
    });

    test("log form has no horizontal overflow", async ({ page }) => {
      await connect(page);
      await page.getByRole("link", { name: "Log a viewing" }).click();
      await assertNoHorizontalOverflow(page);
    });

    test("import page has no horizontal overflow", async ({ page }) => {
      await connect(page);
      await page.getByRole("link", { name: "Import" }).click();
      await assertNoHorizontalOverflow(page);
    });

    test("settings page has no horizontal overflow", async ({ page }) => {
      await connect(page);
      await page.goto("/settings");
      await assertNoHorizontalOverflow(page);
    });
  });
}
