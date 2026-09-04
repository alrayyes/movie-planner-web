import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, type Route, test } from "@playwright/test";

const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

const CREDENTIALS = {
  "caldav-url": "https://caldav.example.com/calendars/me/movies/",
  "caldav-username": "me",
  "caldav-password": "secret",
};

const PATHE_EMAIL = `Booking Confirmation

Dune: Part Two
==============

English, subtitled

Wednesday 15/01/25, 19:30 Expected to end at 21:50

Auditorium 3, Seat A12

Pathé Tuschinski
Reguliersbreestraat 26
Amsterdam

Booking number

N°ABC123456
`;

function mockEmptyEventList(page: Page) {
  page.route("**/api/caldav/events/list", async (route: Route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
  });
}

function trackCreatesAndUpdates(page: Page) {
  const creates: unknown[] = [];
  const updates: unknown[] = [];
  page.route("**/api/caldav/events/create", async (route: Route) => {
    const body = route.request().postDataJSON();
    creates.push(body);
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ uid: "new-uid", ...body.viewing }),
    });
  });
  page.route("**/api/caldav/events/update", async (route: Route) => {
    const body = route.request().postDataJSON();
    updates.push(body);
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ uid: body.uid, ...body.viewing }),
    });
  });
  return { creates, updates };
}

async function connect(page: Page, omdbApiKey?: string) {
  mockEmptyEventList(page);
  await page.goto("/");
  await page.locator("#caldav-url").fill(CREDENTIALS["caldav-url"]);
  await page.locator("#caldav-username").fill(CREDENTIALS["caldav-username"]);
  await page.locator("#caldav-password").fill(CREDENTIALS["caldav-password"]);
  if (omdbApiKey) await page.locator("#omdb-api-key").fill(omdbApiKey);
  await page.getByRole("button", { name: "Connect" }).click();
  await expect(page.getByRole("link", { name: "Log a viewing" })).toBeVisible();
  await page.getByRole("link", { name: "Log a viewing" }).click();
}

test.describe("manual log form", () => {
  test("submits and creates the resulting CalDAV event", async ({ page }) => {
    await connect(page);
    const { creates } = trackCreatesAndUpdates(page);

    await page.locator("#log-title").fill("Paddington");
    await page.locator("#log-start").fill("2026-02-01T18:00");
    await page.locator("#log-end").fill("2026-02-01T19:40");
    await page.locator("#log-medium").fill("netflix");
    await page.getByRole("button", { name: "Log viewing" }).click();

    await expect(page.getByRole("status")).toHaveText("Logged.");
    expect(creates).toHaveLength(1);
    const [request] = creates as { viewing: { title: string; medium: string } }[];
    expect(request.viewing.title).toBe("Paddington");
    expect(request.viewing.medium).toBe("netflix");
  });

  test("a11y scan on the log screen", async ({ page }) => {
    await connect(page);
    const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
    expect(results.violations).toEqual([]);
  });
});

test.describe("Pathé email parsing", () => {
  test("shows the parsed result for confirmation before writing", async ({ page }) => {
    await connect(page);
    const { creates } = trackCreatesAndUpdates(page);

    await page.locator("#pathe-email-text").fill(PATHE_EMAIL);
    await page.getByRole("button", { name: "Parse" }).click();

    await expect(page.getByText("Dune: Part Two")).toBeVisible();
    await expect(page.getByText("N°ABC123456")).toBeVisible();
    // Not written yet — only Parse was clicked, not Confirm.
    expect(creates).toHaveLength(0);

    await page.getByRole("button", { name: "Confirm and log" }).click();
    await expect(page.getByRole("status")).toHaveText("Logged.");
    expect(creates).toHaveLength(1);
  });

  test("a re-submitted booking number updates the existing entry instead of duplicating", async ({
    page,
  }) => {
    await page.goto("/");
    await page.locator("#caldav-url").fill(CREDENTIALS["caldav-url"]);
    await page.locator("#caldav-username").fill(CREDENTIALS["caldav-username"]);
    await page.locator("#caldav-password").fill(CREDENTIALS["caldav-password"]);

    // The dedup check lists the booking's own day looking for a matching
    // bookingRef — simulate one already logged.
    page.route("**/api/caldav/events/list", async (route: Route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([{ uid: "existing-uid", bookingRef: "N°ABC123456" }]),
      });
    });
    await page.getByRole("button", { name: "Connect" }).click();
    await page.getByRole("link", { name: "Log a viewing" }).click();

    const { creates, updates } = trackCreatesAndUpdates(page);

    await page.locator("#pathe-email-text").fill(PATHE_EMAIL);
    await page.getByRole("button", { name: "Parse" }).click();
    await page.getByRole("button", { name: "Confirm and log" }).click();

    await expect(page.getByRole("status")).toHaveText("Updated the existing entry.");
    expect(creates).toHaveLength(0);
    expect(updates).toHaveLength(1);
    const [update] = updates as { uid: string }[];
    expect(update.uid).toBe("existing-uid");
  });
});

test.describe("OMDb enrichment", () => {
  test("attaches a best-effort match when a key is set, without a disambiguation prompt", async ({
    page,
  }) => {
    await connect(page, "test-omdb-key");
    const { creates } = trackCreatesAndUpdates(page);
    page.route("**/api/omdb/lookup", async (route: Route) => {
      const body = route.request().postDataJSON();
      expect(body.apiKey).toBe("test-omdb-key");
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ratingImdb: "8.0", director: "Denis Villeneuve" }),
      });
    });

    await page.locator("#log-title").fill("Dune");
    await page.locator("#log-start").fill("2026-01-01T19:00");
    await page.locator("#log-end").fill("2026-01-01T21:30");
    await page.locator("#log-medium").fill("cinema");
    await page.getByRole("button", { name: "Log viewing" }).click();

    await expect(page.getByRole("status")).toHaveText("Logged.");
    const [request] = creates as { viewing: { ratingImdb?: string; director?: string } }[];
    expect(request.viewing.ratingImdb).toBe("8.0");
    expect(request.viewing.director).toBe("Denis Villeneuve");
    // No disambiguation UI of any kind should appear.
    await expect(page.getByText(/which movie/i)).toHaveCount(0);
  });

  test("logs successfully with no OMDb key set", async ({ page }) => {
    await connect(page);
    const { creates } = trackCreatesAndUpdates(page);

    await page.locator("#log-title").fill("Paddington");
    await page.locator("#log-start").fill("2026-02-01T18:00");
    await page.locator("#log-end").fill("2026-02-01T19:40");
    await page.locator("#log-medium").fill("netflix");
    await page.getByRole("button", { name: "Log viewing" }).click();

    await expect(page.getByRole("status")).toHaveText("Logged.");
    const [request] = creates as { viewing: { ratingImdb?: string } }[];
    expect(request.viewing.ratingImdb).toBeUndefined();
  });
});
