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

// #262/#277: a real, live tile provider — OSM's own usage policy asks
// for no automated bulk requests, so a test suite never hits it for
// real. Same 1x1 blank-PNG stand-in tests/map.spec.ts already uses.
const BLANK_TILE_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
  "base64",
);

async function mockTiles(page: Page) {
  await page.route("https://*.tile.openstreetmap.org/**", async (route) => {
    await route.fulfill({ status: 200, contentType: "image/png", body: BLANK_TILE_PNG });
  });
}

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

  // #223: same bfcache-restore gap as the calendar overview's own test —
  // a viewing deleted elsewhere while this page sat in the browser's
  // back/forward cache should be reflected once it's restored.
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
          medium: "cinema",
          venue: "Grand Vista Cinema",
        },
      ],
      { media: ["cinema"], venues: ["Grand Vista Cinema"] },
    );
    await connect(page);
    await page.getByRole("link", { name: "Venues" }).click();
    await expect(page.locator("tbody tr")).toContainText("1");

    server.viewings.delete("dune-uid");
    await page.evaluate(() => {
      window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true }));
    });

    await expect(page.locator("tbody tr")).toContainText("0");
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

  // Same fix, same reasoning as CalendarOverview's own "a reload
  // triggered while the previous one is still in flight" test — load()
  // now aborts its own stale in-flight request rather than letting a
  // slow, superseded one clobber a fresher result.
  test("a filter submitted while the initial load is still in flight isn't clobbered by the stale one", async ({
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
    // Connect first, on the overview — that page's own initial reload()
    // is a different component entirely and shouldn't be part of this
    // race. Only gate REPORT requests made *after* navigating to
    // Venues, so the first one caught here is genuinely this page's own
    // mount-time load(), not the overview's.
    await connect(page);
    let reportCount = 0;
    let releaseFirst: (() => void) | undefined;
    const firstReleased = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    await page.route(`${new URL(CREDENTIALS["caldav-url"]).origin}/**`, async (route) => {
      if (route.request().method() === "REPORT") {
        reportCount += 1;
        if (reportCount === 1) await firstReleased;
      }
      await route.fallback();
    });

    await page.getByRole("link", { name: "Venues" }).click();
    await expect(page.getByRole("heading", { name: "Venues" })).toBeVisible();
    // The page's own initial load() (the wide default range, matching
    // both viewings) is now the stalled first REPORT above. Narrow to a
    // window matching only the one-month-ago viewing before the second
    // (superseding) load resolves.
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

    releaseFirst?.();
    await page.waitForTimeout(200);

    await expect(page.locator("tbody tr")).toContainText(["1"]);
    expect(server.listRequests.length).toBeGreaterThanOrEqual(2);
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

  // #131
  test("clicking a venue name goes to the overview, filtered to just that venue", async ({
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
          medium: "netflix",
        },
      ],
      { media: ["cinema", "netflix"], venues: ["Grand Vista Cinema"] },
    );
    await connect(page);
    await page.getByRole("link", { name: "Venues" }).click();

    await page.getByRole("link", { name: "Grand Vista Cinema" }).click();

    await expect(page).toHaveURL(/\/\?venue=Grand(\+|%20)Vista(\+|%20)Cinema/);
    await expect(page.locator("#overview-venue")).toHaveValue("Grand Vista Cinema");
    await expect(page.locator("tbody tr")).toHaveCount(1);
    await expect(page.locator("tbody tr")).toContainText("Dune");
  });

  // #146: the venues page counts over its own wide (15-years-back)
  // default window, but the overview it links to defaults to a much
  // narrower ~3-months-back window — a viewing older than that used to
  // vanish the moment a visitor clicked through, even though the count
  // right next to the venue name said it should be there.
  test("clicking a venue carries the same date range that produced its count", async ({ page }) => {
    const fiveYearsAgo = new Date(Date.now() - 5 * 365 * 24 * 60 * 60 * 1000);
    mockCaldavServer(
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

    await page.getByRole("link", { name: "Grand Vista Cinema" }).click();

    await expect(page.locator("tbody tr")).toHaveCount(1);
    await expect(page.locator("tbody tr")).toContainText("An Old Favourite");
  });

  test("shows a map pinning every venue with known coordinates, omitting the rest", async ({
    page,
  }) => {
    await mockTiles(page);
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
          venue: "Tuschinski, Amsterdam, Netherlands",
          geo: { lat: 52.3665062, lon: 4.8947073 },
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
      { media: ["cinema"], venues: ["Tuschinski, Amsterdam, Netherlands", "Grand Vista Cinema"] },
    );
    await connect(page);
    await page.getByRole("link", { name: "Venues" }).click();

    const map = page.getByRole("region", { name: "Map showing 1 location" });
    await expect(map).toBeVisible();

    await page.locator(".leaflet-marker-icon").click();
    const popupLink = map.getByRole("link", { name: "Tuschinski, Amsterdam, Netherlands" });
    await expect(popupLink).toBeVisible();
    await popupLink.click();

    await expect(page).toHaveURL(/\/\?venue=Tuschinski/);
    await expect(page.locator("#overview-venue")).toHaveValue("Tuschinski, Amsterdam, Netherlands");
  });

  test("the venues map introduces no accessibility violations", async ({ page }) => {
    await mockTiles(page);
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
          venue: "Tuschinski, Amsterdam, Netherlands",
          geo: { lat: 52.3665062, lon: 4.8947073 },
        },
      ],
      { media: ["cinema"], venues: ["Tuschinski, Amsterdam, Netherlands"] },
    );
    await connect(page);
    await page.getByRole("link", { name: "Venues" }).click();
    await expect(page.getByRole("region", { name: "Map showing 1 location" })).toBeVisible();

    const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
    expect(results.violations).toEqual([]);
  });

  test("no map at all when no venue has known coordinates", async ({ page }) => {
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
    await expect(page.getByRole("heading", { name: "Venues" })).toBeVisible();

    await expect(page.getByRole("region", { name: /^Map/ })).toHaveCount(0);
  });

  // #267
  test("groups venues by country then city, with a map above each city's own table", async ({
    page,
  }) => {
    await mockTiles(page);
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
          venue: "Tuschinski",
          city: "Amsterdam",
          country: "Netherlands",
          geo: { lat: 52.3665062, lon: 4.8947073 },
        },
        {
          uid: "another-amsterdam-uid",
          title: "Paddington",
          start: TWO_MONTHS_AGO.toISOString(),
          end: new Date(TWO_MONTHS_AGO.getTime() + 60 * 60 * 1000).toISOString(),
          medium: "cinema",
          venue: "The Movies",
          city: "Amsterdam",
          country: "Netherlands",
        },
        {
          uid: "us-uid",
          title: "An Old Favourite",
          start: TWO_MONTHS_AGO.toISOString(),
          end: new Date(TWO_MONTHS_AGO.getTime() + 60 * 60 * 1000).toISOString(),
          medium: "cinema",
          venue: "AMC Empire 25",
          city: "New York",
          country: "USA",
        },
        {
          uid: "unlocated-uid",
          title: "Something at Home",
          start: ONE_MONTH_AGO.toISOString(),
          end: new Date(ONE_MONTH_AGO.getTime() + 60 * 60 * 1000).toISOString(),
          medium: "netflix",
          venue: "Netflix",
        },
      ],
      {
        media: ["cinema", "netflix"],
        venues: ["Tuschinski", "The Movies", "AMC Empire 25", "Netflix"],
      },
    );
    await connect(page);
    await page.getByRole("link", { name: "Venues" }).click();

    // Countries and cities each as their own heading, alphabetically.
    const netherlands = page.getByRole("heading", { name: "Netherlands" });
    const usa = page.getByRole("heading", { name: "USA" });
    await expect(netherlands).toBeVisible();
    await expect(usa).toBeVisible();
    const headings = page.getByRole("heading");
    const netherlandsIndex = await netherlands.evaluate((el) =>
      Array.from(document.querySelectorAll("h2, h3")).indexOf(el),
    );
    const usaIndex = await usa.evaluate((el) =>
      Array.from(document.querySelectorAll("h2, h3")).indexOf(el),
    );
    expect(netherlandsIndex).toBeLessThan(usaIndex);
    await expect(headings.filter({ hasText: "Amsterdam" })).toBeVisible();
    await expect(headings.filter({ hasText: "New York" })).toBeVisible();

    // Amsterdam has a venue with known coordinates — its own map, pinned
    // just to that city's venue(s), not every venue in the whole page.
    const amsterdamMap = page.getByRole("region", { name: "Map showing 1 location" });
    await expect(amsterdamMap).toBeVisible();

    // Every located venue still shows in its own city's table.
    await expect(page.getByRole("link", { name: "Tuschinski" })).toBeVisible();
    await expect(page.getByRole("link", { name: "The Movies" })).toBeVisible();
    await expect(page.getByRole("link", { name: "AMC Empire 25" })).toBeVisible();

    // A venue with no city/country falls into its own "Other locations"
    // section rather than being silently dropped.
    await expect(page.getByRole("heading", { name: "Other locations" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Netflix" })).toBeVisible();

    const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
    expect(results.violations).toEqual([]);
  });

  test("shows the old flat, ungrouped view when no venue has a known city/country", async ({
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

    await expect(page.getByRole("link", { name: "Grand Vista Cinema" })).toBeVisible();
    // No lone "Other locations" heading with nothing to contrast it
    // against — same flat table this page always showed.
    await expect(page.getByRole("heading", { name: "Other locations" })).toHaveCount(0);
  });
});
