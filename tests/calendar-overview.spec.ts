import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import { mockCaldavServer } from "./support/mock-caldav";

const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

const CREDENTIALS = {
  "caldav-url": "https://caldav.example.com/calendars/me/movies/",
  "caldav-username": "me",
  "caldav-password": "secret",
};

// Relative to `now` rather than fixed calendar dates, so the fixtures stay
// inside the component's own "last 3 months" default window regardless of
// when the suite runs — DUNE ~1 month back, PADDINGTON ~2 months back, both
// inside the default; a cutoff ~45 days back (below) separates them for
// the explicit-range tests. Plain day-based arithmetic, not setMonth —
// setMonth's fractional-month handling is unreliable, and calendar months
// vary in length anyway.
function daysAgo(n: number): Date {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000);
}
const ONE_MONTH_AGO = daysAgo(30);
const TWO_MONTHS_AGO = daysAgo(60);
const CUTOFF = daysAgo(45);

const DUNE = {
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
};

const PADDINGTON = {
  uid: "paddington-uid",
  title: "Paddington",
  start: TWO_MONTHS_AGO.toISOString(),
  end: new Date(TWO_MONTHS_AGO.getTime() + 1.5 * 60 * 60 * 1000).toISOString(),
  medium: "netflix",
};

function toDateInputValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

async function connect(page: Page) {
  await page.goto("/");
  await page.locator("#caldav-url").fill(CREDENTIALS["caldav-url"]);
  await page.locator("#caldav-username").fill(CREDENTIALS["caldav-username"]);
  await page.locator("#caldav-password").fill(CREDENTIALS["caldav-password"]);
  await page.getByRole("button", { name: "Connect" }).click();
}

test.describe("calendar overview", () => {
  test("renders full metadata for a logged viewing", async ({ page }) => {
    mockCaldavServer(page, CREDENTIALS["caldav-url"], [DUNE]);
    await connect(page);

    const row = page.locator("tbody tr");
    await expect(row).toContainText("Dune");
    await expect(row).toContainText("Grand Vista Cinema");
    await expect(row).toContainText("Denis Villeneuve");
    await expect(row).toContainText("Timothée Chalamet, Zendaya");
    await expect(row).toContainText("IMDb 8.0");
    await expect(row).toContainText("cinema");

    const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
    expect(results.violations).toEqual([]);
  });

  test("filters to a date range by re-querying the CalDAV server", async ({ page }) => {
    mockCaldavServer(page, CREDENTIALS["caldav-url"], [DUNE, PADDINGTON]);
    await connect(page);

    await expect(page.locator("tbody tr")).toHaveCount(2);

    await page.locator("#overview-from").fill(toDateInputValue(CUTOFF));
    await page.locator("#overview-to").fill(toDateInputValue(new Date()));
    await page.getByRole("button", { name: "Filter", exact: true }).click();

    await expect(page.locator("tbody tr")).toHaveCount(1);
    await expect(page.locator("tbody tr")).toContainText("Dune");
  });

  test("filters by medium client-side, over whatever the date range already returned", async ({
    page,
  }) => {
    const server = mockCaldavServer(page, CREDENTIALS["caldav-url"], [DUNE, PADDINGTON]);
    await connect(page);
    await expect(page.locator("tbody tr")).toHaveCount(2);

    await page.locator("#overview-medium").fill("cinema");
    await page.getByRole("button", { name: "Filter", exact: true }).click();

    await expect(page.locator("tbody tr")).toHaveCount(1);
    await expect(page.locator("tbody tr")).toContainText("Dune");
    // Medium isn't part of the CalDAV query — both requests carry the same
    // (unchanged, to-the-day) default date range, confirming the medium
    // filter is applied to the response rather than sent to the server.
    expect(server.listRequests).toHaveLength(2);
    expect(server.listRequests[0]?.from.toDateString()).toBe(
      server.listRequests[1]?.from.toDateString(),
    );
    expect(server.listRequests[0]?.to.toDateString()).toBe(
      server.listRequests[1]?.to.toDateString(),
    );
  });

  test("sends the visitor's own stored credentials, not anyone else's", async ({ page }) => {
    const server = mockCaldavServer(page, CREDENTIALS["caldav-url"], [DUNE]);
    await connect(page);
    await expect(page.locator("tbody tr")).toHaveCount(1);

    expect(server.authHeaders[0]).toBe(
      `Basic ${Buffer.from(`${CREDENTIALS["caldav-username"]}:${CREDENTIALS["caldav-password"]}`).toString("base64")}`,
    );
  });

  test("defaults to roughly the last 3 months", async ({ page }) => {
    const server = mockCaldavServer(page, CREDENTIALS["caldav-url"], []);
    await connect(page);
    await expect(page.getByRole("status").first()).toHaveText("0 logged viewings.");

    const from = server.listRequests[0]?.from as Date;
    const now = new Date();
    const expectedFrom = new Date(now);
    expectedFrom.setMonth(now.getMonth() - 3);

    // Within a day of "3 months back" — allows for the test run's own clock
    // drift against the fixed default computed inside the component.
    expect(Math.abs(from.getTime() - expectedFrom.getTime())).toBeLessThan(24 * 60 * 60 * 1000);
  });

  test("clear filter resets the date range and medium, and reloads", async ({ page }) => {
    const server = mockCaldavServer(page, CREDENTIALS["caldav-url"], [DUNE, PADDINGTON]);
    await connect(page);
    await expect(page.locator("tbody tr")).toHaveCount(2);

    await page.locator("#overview-from").fill(toDateInputValue(CUTOFF));
    await page.locator("#overview-to").fill(toDateInputValue(new Date()));
    await page.locator("#overview-medium").fill("cinema");
    await page.getByRole("button", { name: "Filter", exact: true }).click();
    await expect(page.locator("tbody tr")).toHaveCount(1);

    await page.getByRole("button", { name: "Clear filter" }).click();

    await expect(page.locator("#overview-from")).toHaveValue("");
    await expect(page.locator("#overview-to")).toHaveValue("");
    await expect(page.locator("#overview-medium")).toHaveValue("");
    await expect(page.locator("tbody tr")).toHaveCount(2);

    const lastRequest = server.listRequests.at(-1);
    expect(lastRequest?.from.toDateString()).not.toBe(CUTOFF.toDateString());
  });
});
