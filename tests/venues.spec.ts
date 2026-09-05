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
  await expect(page.getByRole("link", { name: "Venues" })).toBeVisible();
}

test.describe("venues overview", () => {
  test("lists every known venue with a count of logged viewings, including zero", async ({
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
          medium: "cinema",
          venue: "Grand Vista Cinema",
        },
        {
          uid: "paddington-uid",
          title: "Paddington",
          start: TWO_MONTHS_AGO.toISOString(),
          end: new Date(TWO_MONTHS_AGO.getTime() + 60 * 60 * 1000).toISOString(),
          medium: "cinema",
          venue: "Grand Vista Cinema",
        },
      ],
      { media: ["cinema"], venues: ["Grand Vista Cinema", "Regal Union Square"] },
    );
    await connect(page);
    await page.getByRole("link", { name: "Venues" }).click();

    await expect(page.getByRole("heading", { name: "Venues" })).toBeVisible();
    const rows = page.locator("tbody tr");
    await expect(rows).toHaveCount(2);
    // Sorted by count descending — Grand Vista Cinema (2) before Regal
    // Union Square (0, still listed rather than omitted).
    await expect(rows.nth(0)).toContainText("Grand Vista Cinema");
    await expect(rows.nth(0)).toContainText("2");
    await expect(rows.nth(1)).toContainText("Regal Union Square");
    await expect(rows.nth(1)).toContainText("0");

    const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
    expect(results.violations).toEqual([]);
  });

  // #116: a CLI-logged entry's venue was never typed into this app's own
  // log form, so it's never in the location-management picklist — but
  // it's still real LOCATION text on the calendar entry, and the page
  // used to drop it silently instead of showing it.
  test("shows a venue that only exists on a calendar entry, never added to the picklist", async ({
    page,
  }) => {
    mockCaldavServer(
      page,
      CREDENTIALS["caldav-url"],
      [
        {
          uid: "cli-logged-uid",
          title: "Paddington",
          start: ONE_MONTH_AGO.toISOString(),
          end: new Date(ONE_MONTH_AGO.getTime() + 60 * 60 * 1000).toISOString(),
          medium: "cinema",
          venue: "A CLI-Logged Cinema",
        },
      ],
      // The picklist knows nothing about this venue at all.
      { media: ["cinema"], venues: [] },
    );
    await connect(page);
    await page.getByRole("link", { name: "Venues" }).click();

    await expect(page.getByRole("heading", { name: "Venues" })).toBeVisible();
    const rows = page.locator("tbody tr");
    await expect(rows).toHaveCount(1);
    await expect(rows.nth(0)).toContainText("A CLI-Logged Cinema");
    await expect(rows.nth(0)).toContainText("1");
  });

  test("the same venue on both the picklist and a calendar entry appears once, with its real count", async ({
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
          medium: "cinema",
          venue: "Grand Vista Cinema",
        },
      ],
      { media: ["cinema"], venues: ["Grand Vista Cinema"] },
    );
    await connect(page);
    await page.getByRole("link", { name: "Venues" }).click();

    const rows = page.locator("tbody tr");
    await expect(rows).toHaveCount(1);
    await expect(rows.nth(0)).toContainText("Grand Vista Cinema");
    await expect(rows.nth(0)).toContainText("1");
  });

  // #123
  test("a date-range filter narrows the counts, and clearing it returns to the whole-history default", async ({
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
          medium: "cinema",
          venue: "Grand Vista Cinema",
        },
        {
          uid: "paddington-uid",
          title: "Paddington",
          start: TWO_MONTHS_AGO.toISOString(),
          end: new Date(TWO_MONTHS_AGO.getTime() + 60 * 60 * 1000).toISOString(),
          medium: "cinema",
          venue: "Grand Vista Cinema",
        },
      ],
      { media: ["cinema"], venues: ["Grand Vista Cinema"] },
    );
    await connect(page);
    await page.getByRole("link", { name: "Venues" }).click();
    await expect(page.locator("tbody tr")).toContainText(["2"]);

    // Narrow to a window covering only the one-month-ago viewing.
    const from = new Date(ONE_MONTH_AGO.getTime() - 3 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);
    const to = new Date(ONE_MONTH_AGO.getTime() + 3 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);
    await page.locator("#venues-from").fill(from);
    await page.locator("#venues-to").fill(to);
    await page.getByRole("button", { name: "Filter", exact: true }).click();

    await expect(page.locator("tbody tr")).toContainText(["1"]);
    // The entered values stay visible — not reset after filtering.
    await expect(page.locator("#venues-from")).toHaveValue(from);
    await expect(page.locator("#venues-to")).toHaveValue(to);

    await page.getByRole("button", { name: "Clear filter" }).click();
    await expect(page.locator("tbody tr")).toContainText(["2"]);
    await expect(page.locator("#venues-from")).toHaveValue("");
    await expect(page.locator("#venues-to")).toHaveValue("");
  });

  test("queries a wide enough range to cover the visitor's whole history, not just the overview's default window", async ({
    page,
  }) => {
    const fiveYearsAgo = new Date(Date.now() - 5 * 365 * 24 * 60 * 60 * 1000);
    const server = mockCaldavServer(
      page,
      CREDENTIALS["caldav-url"],
      [
        {
          uid: "old-uid",
          title: "An Old Favourite",
          start: fiveYearsAgo.toISOString(),
          end: new Date(fiveYearsAgo.getTime() + 60 * 60 * 1000).toISOString(),
          medium: "cinema",
          venue: "Grand Vista Cinema",
        },
      ],
      { media: ["cinema"], venues: ["Grand Vista Cinema"] },
    );
    await connect(page);
    await page.getByRole("link", { name: "Venues" }).click();

    await expect(page.locator("tbody tr")).toContainText(["1"]);
    // The home page's own overview already made one (default, ~3-month)
    // request before this navigation — the venues page's own wide-range
    // request is the last one, not the first.
    const range = server.listRequests.at(-1);
    expect(range?.from.getTime()).toBeLessThan(fiveYearsAgo.getTime());
  });
});
