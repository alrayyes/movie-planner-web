import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, type Route, test } from "@playwright/test";

const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

const CREDENTIALS = {
  "caldav-url": "https://caldav.example.com/calendars/me/movies/",
  "caldav-username": "me",
  "caldav-password": "secret",
};

const DUNE = {
  uid: "dune-uid",
  title: "Dune",
  start: "2026-01-01T19:00:00.000Z",
  end: "2026-01-01T21:30:00.000Z",
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
  start: "2025-06-01T18:00:00.000Z",
  end: "2025-06-01T19:40:00.000Z",
  medium: "netflix",
};

async function connect(page: Page) {
  await page.goto("/");
  await page.locator("#caldav-url").fill(CREDENTIALS["caldav-url"]);
  await page.locator("#caldav-username").fill(CREDENTIALS["caldav-username"]);
  await page.locator("#caldav-password").fill(CREDENTIALS["caldav-password"]);
  await page.getByRole("button", { name: "Connect" }).click();
}

// Mocks the proxy's own /api/caldav/events/list route at the browser level
// — the calendar-overview spec's "mocked calendar" — rather than a real or
// fake CalDAV server, since this page's own logic (rendering, filtering,
// which config it sends) is what's under test here, not the proxy's wire
// protocol (that's src/lib/caldav/*.test.ts and test/integration/).
function mockEventList(page: Page, viewings: (typeof DUNE | typeof PADDINGTON)[]) {
  const requestBodies: unknown[] = [];
  page.route("**/api/caldav/events/list", async (route: Route) => {
    const body = route.request().postDataJSON() as {
      config: { username: string };
      range: { from: string; to: string };
    };
    requestBodies.push(body);
    const matching = viewings.filter((v) => v.start >= body.range.from && v.start <= body.range.to);
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(matching),
    });
  });
  return requestBodies;
}

test.describe("calendar overview", () => {
  test("renders full metadata for a logged viewing", async ({ page }) => {
    mockEventList(page, [DUNE]);
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

  test("filters to a date range by re-querying the proxy", async ({ page }) => {
    mockEventList(page, [DUNE, PADDINGTON]);
    await connect(page);

    await expect(page.locator("tbody tr")).toHaveCount(2);

    await page.locator("#overview-from").fill("2025-12-01");
    await page.locator("#overview-to").fill("2026-02-01");
    await page.getByRole("button", { name: "Filter" }).click();

    await expect(page.locator("tbody tr")).toHaveCount(1);
    await expect(page.locator("tbody tr")).toContainText("Dune");
  });

  test("filters by medium client-side, over whatever the date range already returned", async ({
    page,
  }) => {
    const requests = mockEventList(page, [DUNE, PADDINGTON]);
    await connect(page);
    await expect(page.locator("tbody tr")).toHaveCount(2);

    await page.locator("#overview-medium").fill("cinema");
    await page.getByRole("button", { name: "Filter" }).click();

    await expect(page.locator("tbody tr")).toHaveCount(1);
    await expect(page.locator("tbody tr")).toContainText("Dune");
    // Medium isn't part of the CalDAV query — both requests carry the same
    // (unchanged, to-the-day) default date range, confirming the medium
    // filter is applied to the response rather than sent to the proxy.
    // Not exact-equal: the default range is computed fresh from `now` on
    // each request, so the two calls can differ by a few milliseconds.
    const ranges = (requests as { range: { from: string; to: string } }[]).map((r) => r.range);
    expect(ranges[0]?.from.slice(0, 10)).toBe(ranges[1]?.from.slice(0, 10));
    expect(ranges[0]?.to.slice(0, 10)).toBe(ranges[1]?.to.slice(0, 10));
  });

  test("sends the visitor's own stored credentials, not anyone else's", async ({ page }) => {
    const requests = mockEventList(page, [DUNE]);
    await connect(page);
    await expect(page.locator("tbody tr")).toHaveCount(1);

    const [request] = requests as { config: { username: string } }[];
    expect(request.config.username).toBe(CREDENTIALS["caldav-username"]);
  });
});
