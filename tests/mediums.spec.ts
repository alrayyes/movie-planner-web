import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import { mockCaldavServer } from "./support/mock-caldav";

const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

const CREDENTIALS = {
  "caldav-url": "https://caldav.example.com/calendars/me/movies/",
  "caldav-username": "me",
  "caldav-password": "secret",
};

const ONE_MONTH_AGO = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
const TWO_MONTHS_AGO = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);

async function connect(page: Page) {
  await page.goto("/");
  await page.locator("#caldav-url").fill(CREDENTIALS["caldav-url"]);
  await page.locator("#caldav-username").fill(CREDENTIALS["caldav-username"]);
  await page.locator("#caldav-password").fill(CREDENTIALS["caldav-password"]);
  await page.getByRole("button", { name: "Connect" }).click();
  await expect(page.getByRole("link", { name: "Settings" })).toBeVisible();
}

// #602: mirrors venues.spec.ts's own coverage, minus the map/city-
// country grouping medium has no use for — a flat list, Cinema always
// included (#600's own always-available baseline), sorted by count.
test.describe("mediums overview", () => {
  test("lists every known medium with a count of logged viewings, Cinema always included", async ({
    page,
  }) => {
    mockCaldavServer(
      page,
      CREDENTIALS["caldav-url"],
      [
        {
          uid: "dune-uid",
          title: "Dune",
          start: ONE_MONTH_AGO.toISOString(),
          end: new Date(ONE_MONTH_AGO.getTime() + 60 * 60 * 1000).toISOString(),
          medium: "Netflix",
        },
        {
          uid: "paddington-uid",
          title: "Paddington",
          start: TWO_MONTHS_AGO.toISOString(),
          end: new Date(TWO_MONTHS_AGO.getTime() + 60 * 60 * 1000).toISOString(),
          medium: "Netflix",
        },
      ],
      { media: ["Netflix"], venues: [] },
    );
    await connect(page);
    await page.goto("/mediums");

    await expect(page.getByRole("heading", { name: "Mediums" })).toBeVisible();
    const rows = page.locator("tbody tr");
    await expect(rows).toHaveCount(2);
    // Sorted by count descending — Netflix (2) before Cinema (0, still
    // listed as the always-available baseline, never omitted).
    await expect(rows.nth(0)).toContainText("Netflix");
    await expect(rows.nth(0)).toContainText("2");
    await expect(rows.nth(1)).toContainText("Cinema");
    await expect(rows.nth(1)).toContainText("0");

    const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
    expect(results.violations).toEqual([]);
  });

  // #600: the CLI never writes a medium property to CalDAV at all — a
  // CLI-logged viewing's own medium is genuinely blank, and counts
  // toward Cinema (mediumDisplay's own rule), the same way it displays.
  test("a viewing with no stored medium counts toward Cinema", async ({ page }) => {
    mockCaldavServer(
      page,
      CREDENTIALS["caldav-url"],
      [
        {
          uid: "dune-uid",
          title: "Dune",
          start: ONE_MONTH_AGO.toISOString(),
          end: new Date(ONE_MONTH_AGO.getTime() + 60 * 60 * 1000).toISOString(),
          medium: "",
        },
      ],
      { media: [], venues: [] },
    );
    await connect(page);
    await page.goto("/mediums");

    const rows = page.locator("tbody tr");
    await expect(rows).toHaveCount(1);
    await expect(rows.nth(0)).toContainText("Cinema");
    await expect(rows.nth(0)).toContainText("1");
  });

  // #116's own venue precedent, applied to medium: a CLI-logged entry's
  // medium was never typed into this app's own log form, so it's never
  // in the picklist — but it's still a real medium value.
  test("shows a medium that only exists on a calendar entry, never added to the picklist", async ({
    page,
  }) => {
    mockCaldavServer(
      page,
      CREDENTIALS["caldav-url"],
      [
        {
          uid: "dune-uid",
          title: "Dune",
          start: ONE_MONTH_AGO.toISOString(),
          end: new Date(ONE_MONTH_AGO.getTime() + 60 * 60 * 1000).toISOString(),
          medium: "Blu-ray",
        },
      ],
      { media: [], venues: [] },
    );
    await connect(page);
    await page.goto("/mediums");

    await expect(page.locator("tbody tr", { hasText: "Blu-ray" })).toBeVisible();
  });

  test("clicking a medium goes to its own dedicated page, showing only that medium's viewings", async ({
    page,
  }) => {
    mockCaldavServer(
      page,
      CREDENTIALS["caldav-url"],
      [
        {
          uid: "dune-uid",
          title: "Dune",
          start: ONE_MONTH_AGO.toISOString(),
          end: new Date(ONE_MONTH_AGO.getTime() + 60 * 60 * 1000).toISOString(),
          medium: "Netflix",
        },
      ],
      { media: ["Netflix"], venues: [] },
    );
    await connect(page);
    await page.goto("/mediums");

    await page.getByRole("link", { name: "Netflix" }).click();
    await expect(page).toHaveURL(/\/medium\/?\?medium=Netflix/);
    await expect(page.getByRole("heading", { name: "Netflix" })).toBeVisible();
  });

  // #223: same bfcache-restore gap as the venues overview's own test.
  test("a bfcache restore refreshes counts that changed while this page was cached", async ({
    page,
  }) => {
    const server = mockCaldavServer(
      page,
      CREDENTIALS["caldav-url"],
      [
        {
          uid: "dune-uid",
          title: "Dune",
          start: ONE_MONTH_AGO.toISOString(),
          end: new Date(ONE_MONTH_AGO.getTime() + 60 * 60 * 1000).toISOString(),
          medium: "Netflix",
        },
      ],
      { media: ["Netflix"], venues: [] },
    );
    await connect(page);
    await page.goto("/mediums");
    await expect(page.locator("tbody tr", { hasText: "Netflix" })).toContainText("1");

    server.viewings.delete("dune-uid");
    await page.evaluate(() => {
      window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true }));
    });

    await expect(page.locator("tbody tr", { hasText: "Netflix" })).toContainText("0");
  });

  test("reachable from the Settings hub's More list", async ({ page }) => {
    mockCaldavServer(page, CREDENTIALS["caldav-url"], []);
    await connect(page);
    await page.getByRole("link", { name: "Settings" }).click();

    await page.getByRole("link", { name: "Mediums" }).click();
    await expect(page.getByRole("heading", { name: "Mediums" })).toBeVisible();
  });
});
