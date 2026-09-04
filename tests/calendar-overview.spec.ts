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
  genre: "Action, Adventure, Drama",
  year: "2021",
  posterUrl: "https://example.com/dune-poster.jpg",
  imdbId: "tt1160419",
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
  test("defaults to most-recently-watched first", async ({ page }) => {
    // PADDINGTON (2 months back) is older than DUNE (1 month back) —
    // seeded in that order so the assertion actually proves sorting
    // happened rather than just preserving fixture/response order.
    mockCaldavServer(page, CREDENTIALS["caldav-url"], [PADDINGTON, DUNE]);
    await connect(page);

    const rows = page.locator("tbody tr");
    await expect(rows).toHaveCount(2);
    await expect(rows.nth(0)).toContainText("Dune");
    await expect(rows.nth(1)).toContainText("Paddington");
  });

  test("renders its own columns for a logged viewing, and leaves the rest to the details page", async ({
    page,
  }) => {
    mockCaldavServer(page, CREDENTIALS["caldav-url"], [DUNE]);
    await connect(page);

    const row = page.locator("tbody tr");
    await expect(row).toContainText("Dune (2021)");
    await expect(row).toContainText("Grand Vista Cinema");
    await expect(row).toContainText("cinema");
    await expect(row.locator("img")).toHaveAttribute("src", DUNE.posterUrl);
    // #38: director/actors/genre/ratings live on the details page (one
    // click away via the title link), not as their own overview columns
    // — that's what keeps this table's column count fixed and narrow
    // enough to fit a phone screen without horizontal scroll.
    await expect(row).not.toContainText("Denis Villeneuve");
    await expect(row).not.toContainText("Action, Adventure, Drama");

    const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
    expect(results.violations).toEqual([]);
  });

  test("cross-links the title out to IMDb, Rotten Tomatoes and Letterboxd", async ({ page }) => {
    mockCaldavServer(page, CREDENTIALS["caldav-url"], [DUNE]);
    await connect(page);

    const row = page.locator("tbody tr");
    await expect(row.getByRole("link", { name: "IMDb" })).toHaveAttribute(
      "href",
      "https://www.imdb.com/title/tt1160419/",
    );
    await expect(row.getByRole("link", { name: "RT" })).toHaveAttribute(
      "href",
      "https://www.rottentomatoes.com/search?search=Dune",
    );
    await expect(row.getByRole("link", { name: "Letterboxd" })).toHaveAttribute(
      "href",
      "https://letterboxd.com/search/Dune/",
    );
  });

  test("omits the IMDb link (but still shows the search links) without an imdbId", async ({
    page,
  }) => {
    mockCaldavServer(page, CREDENTIALS["caldav-url"], [PADDINGTON]);
    await connect(page);

    const row = page.locator("tbody tr");
    await expect(row.getByRole("link", { name: "IMDb" })).toHaveCount(0);
    await expect(row.getByRole("link", { name: "RT" })).toBeVisible();
    await expect(row.getByRole("link", { name: "Letterboxd" })).toBeVisible();
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
