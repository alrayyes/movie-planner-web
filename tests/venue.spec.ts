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
// real. Same 1x1 blank-PNG stand-in tests/map.spec.ts and
// tests/venues.spec.ts already use.
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

test.describe("per-venue page", () => {
  // #448
  test("shows only that venue's own viewings and map, with no filter controls of any kind", async ({
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
          venue: "Grand Vista Cinema",
          geo: { lat: 52.3665062, lon: 4.8947073 },
        },
        {
          uid: "paddington-uid",
          title: "Paddington",
          start: TWO_MONTHS_AGO.toISOString(),
          end: new Date(TWO_MONTHS_AGO.getTime() + 60 * 60 * 1000).toISOString(),
          medium: "cinema",
          venue: "Regal Union Square",
        },
      ],
      { media: ["cinema"], venues: ["Grand Vista Cinema", "Regal Union Square"] },
    );
    await connect(page);

    await page.goto(`/venue?venue=${encodeURIComponent("Grand Vista Cinema")}`);

    const rows = page.locator("tbody tr");
    await expect(rows).toHaveCount(1);
    await expect(rows).toContainText("Dune");
    await expect(rows).not.toContainText("Paddington");
    await expect(page.getByRole("region", { name: "Map showing 1 location" })).toBeVisible();

    // No filter chrome of any kind, and no way to change the venue.
    await expect(page.getByText("Filters", { exact: true })).toHaveCount(0);
    await expect(page.locator("input[type=text]")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Filter", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Clear filter" })).toHaveCount(0);

    const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
    expect(results.violations).toEqual([]);
  });

  // #534: the breadcrumb's middle crumb is a real link back to /venues,
  // not just flat text baked into the current item — and the page
  // title reflects the specific venue, not the generic app name.
  test("breadcrumb's middle crumb links to /venues, and the page title reflects the venue", async ({
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

    await page.goto(`/venue?venue=${encodeURIComponent("Grand Vista Cinema")}`);

    const nav = page.getByRole("navigation", { name: "Breadcrumb" });
    await expect(nav).toBeVisible();
    await expect(nav.getByRole("link", { name: "Home" })).toHaveAttribute("href", "/");
    await expect(nav.getByRole("link", { name: "Venues" })).toHaveAttribute("href", "/venues");
    await expect(nav.getByText("Grand Vista Cinema")).toBeVisible();

    await expect(page).toHaveTitle("Grand Vista Cinema — Venues — Movie Planner");
  });

  test("shows an empty-results state for a venue matching nothing, not an error", async ({
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

    await page.goto(`/venue?venue=${encodeURIComponent("No Such Venue")}`);

    await expect(page.locator("tbody tr")).toHaveCount(0);
    await expect(page.getByText("0 logged viewings.")).toBeVisible();
    await expect(page.getByRole("alert")).toHaveCount(0);
  });

  // #440: the breadcrumb reads the trimmed name + known city, not the
  // raw stored venue value — the venue query string itself still
  // carries the raw value (filtering/matching always does), only the
  // breadcrumb's own display trims it.
  test("breadcrumb shows the venue's trimmed display name, not its raw stored value", async ({
    page,
  }) => {
    mockCaldavServer(
      page,
      CREDENTIALS["caldav-url"],
      [
        {
          uid: "tuschinski-uid",
          title: "Dune",
          start: ONE_MONTH_AGO.toISOString(),
          end: new Date(ONE_MONTH_AGO.getTime() + 60 * 60 * 1000).toISOString(),
          medium: "cinema",
          venue: "Tuschinski, Reguliersbreestraat 26-34, 1017 CN",
          city: "Amsterdam",
        },
      ],
      { media: ["cinema"], venues: ["Tuschinski, Reguliersbreestraat 26-34, 1017 CN"] },
    );
    await connect(page);

    await page.goto(
      `/venue?venue=${encodeURIComponent("Tuschinski, Reguliersbreestraat 26-34, 1017 CN")}`,
    );

    const nav = page.getByRole("navigation", { name: "Breadcrumb" });
    await expect(nav).toBeVisible();
    await expect(nav).toContainText("Tuschinski, Amsterdam");
    await expect(nav).not.toContainText("Reguliersbreestraat");
    await expect(nav.getByRole("link", { name: "Home" })).toHaveAttribute("href", "/");

    // The page's own heading uses the same trimmed name.
    await expect(page.getByRole("heading", { name: "Tuschinski, Amsterdam" })).toBeVisible();
  });

  // #300: the same visitor-adjustable page size and windowed pagination
  // as the main overview, scoped to just this one venue's viewings.
  test("paginates a venue's own viewings", async ({ page }) => {
    const viewings = Array.from({ length: 30 }, (_, i) => {
      const start = new Date(ONE_MONTH_AGO.getTime() - i * 24 * 60 * 60 * 1000);
      return {
        uid: `viewing-${i}`,
        title: `Movie ${i}`,
        start: start.toISOString(),
        end: new Date(start.getTime() + 60 * 60 * 1000).toISOString(),
        medium: "cinema",
        venue: "Grand Vista Cinema",
      };
    });
    mockCaldavServer(page, CREDENTIALS["caldav-url"], viewings, {
      media: ["cinema"],
      venues: ["Grand Vista Cinema"],
    });
    await connect(page);

    await page.goto(`/venue?venue=${encodeURIComponent("Grand Vista Cinema")}`);

    await expect(page.getByText("30 logged viewings.")).toBeVisible();
    await expect(page.locator("tbody tr")).toHaveCount(25);
    const pagination = page.getByLabel("Pagination");
    await expect(pagination).toBeVisible();
    await expect(pagination).toContainText("Page 1 of 2");

    await page.getByRole("button", { name: "Next page" }).click();
    await expect(page.locator("tbody tr")).toHaveCount(5);
    await expect(pagination).toContainText("Page 2 of 2");

    await page.selectOption("#venue-page-size", "50");
    await expect(page.locator("tbody tr")).toHaveCount(30);
    await expect(page.getByLabel("Pagination")).toHaveCount(0);
  });

  test("shows a distinct error toast on a genuine load failure", async ({ page }) => {
    mockCaldavServer(page, CREDENTIALS["caldav-url"], []);
    await connect(page);

    await page.route(`${new URL(CREDENTIALS["caldav-url"]).origin}/**`, async (route) => {
      if (route.request().method() === "REPORT") {
        await route.fulfill({ status: 500, body: "Internal Server Error" });
        return;
      }
      await route.fallback();
    });

    await page.goto(`/venue?venue=${encodeURIComponent("Grand Vista Cinema")}`);

    const toast = page.getByRole("alert");
    await expect(toast).toBeVisible();
    await expect(toast).toContainText(/the CalDAV server responded 500/);
  });

  test("asks a visitor with no stored credentials to connect first", async ({ page }) => {
    await page.goto(`/venue?venue=${encodeURIComponent("Grand Vista Cinema")}`);

    await expect(page.getByText("Connect first to see this venue.")).toBeVisible();
  });
});
