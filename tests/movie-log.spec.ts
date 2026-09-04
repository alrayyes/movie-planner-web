import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, type Route, test } from "@playwright/test";
import { mockCaldavServer } from "./support/mock-caldav";

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

async function connect(page: Page, omdbApiKey?: string) {
  const server = mockCaldavServer(page, CREDENTIALS["caldav-url"], []);
  await page.goto("/");
  await page.locator("#caldav-url").fill(CREDENTIALS["caldav-url"]);
  await page.locator("#caldav-username").fill(CREDENTIALS["caldav-username"]);
  await page.locator("#caldav-password").fill(CREDENTIALS["caldav-password"]);
  if (omdbApiKey) await page.locator("#omdb-api-key").fill(omdbApiKey);
  await page.getByRole("button", { name: "Connect" }).click();
  await expect(page.getByRole("link", { name: "Log a viewing" })).toBeVisible();
  await page.getByRole("link", { name: "Log a viewing" }).click();
  return server;
}

test.describe("manual log form", () => {
  test("submits and creates the resulting CalDAV event", async ({ page }) => {
    const server = await connect(page);

    await page.locator("#log-title").fill("Paddington");
    await page.locator("#log-start").fill("2026-02-01T18:00");
    await page.locator("#log-end").fill("2026-02-01T19:40");
    await page.locator("#log-medium").fill("netflix");
    await page.getByRole("button", { name: "Log viewing" }).click();

    await expect(page.getByRole("status")).toHaveText("Logged.");
    expect(server.creates).toHaveLength(1);
    expect(server.creates[0]?.title).toBe("Paddington");
    expect(server.creates[0]?.medium).toBe("netflix");
  });

  test("a11y scan on the log screen", async ({ page }) => {
    await connect(page);
    const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
    expect(results.violations).toEqual([]);
  });
});

test.describe("Pathé email parsing", () => {
  test("shows the parsed result for confirmation before writing", async ({ page }) => {
    const server = await connect(page);

    await page.locator("#pathe-email-text").fill(PATHE_EMAIL);
    await page.getByRole("button", { name: "Parse" }).click();

    await expect(page.getByText("Dune: Part Two")).toBeVisible();
    await expect(page.getByText("N°ABC123456")).toBeVisible();
    // Not written yet — only Parse was clicked, not Confirm.
    expect(server.creates).toHaveLength(0);

    await page.getByRole("button", { name: "Confirm and log" }).click();
    await expect(page.getByRole("status")).toHaveText("Logged.");
    expect(server.creates).toHaveLength(1);
  });

  test("a re-submitted booking number updates the existing entry instead of duplicating", async ({
    page,
  }) => {
    await page.goto("/");
    await page.locator("#caldav-url").fill(CREDENTIALS["caldav-url"]);
    await page.locator("#caldav-username").fill(CREDENTIALS["caldav-username"]);
    await page.locator("#caldav-password").fill(CREDENTIALS["caldav-password"]);

    // The dedup check lists the booking's own day looking for a matching
    // bookingRef — seed an existing viewing on that same day with the
    // booking's own reference already logged.
    const server = mockCaldavServer(page, CREDENTIALS["caldav-url"], [
      {
        uid: "existing-uid",
        title: "Dune: Part Two",
        start: "2025-01-15T18:30:00.000Z",
        end: "2025-01-15T20:50:00.000Z",
        medium: "cinema",
        bookingRef: "N°ABC123456",
      },
    ]);
    await page.getByRole("button", { name: "Connect" }).click();
    await page.getByRole("link", { name: "Log a viewing" }).click();

    await page.locator("#pathe-email-text").fill(PATHE_EMAIL);
    await page.getByRole("button", { name: "Parse" }).click();
    await page.getByRole("button", { name: "Confirm and log" }).click();

    await expect(page.getByRole("status")).toHaveText("Updated the existing entry.");
    expect(server.creates).toHaveLength(0);
    expect(server.updates).toHaveLength(1);
    expect(server.updates[0]?.uid).toBe("existing-uid");
  });
});

test.describe("OMDb enrichment", () => {
  test("attaches a best-effort match when a key is set, without a disambiguation prompt", async ({
    page,
  }) => {
    const server = await connect(page, "test-omdb-key");
    page.route("https://www.omdbapi.com/**", async (route: Route) => {
      const url = new URL(route.request().url());
      expect(url.searchParams.get("apikey")).toBe("test-omdb-key");
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          Response: "True",
          Director: "Denis Villeneuve",
          Ratings: [{ Source: "Internet Movie Database", Value: "8.0/10" }],
        }),
      });
    });

    await page.locator("#log-title").fill("Dune");
    await page.locator("#log-start").fill("2026-01-01T19:00");
    await page.locator("#log-end").fill("2026-01-01T21:30");
    await page.locator("#log-medium").fill("cinema");
    await page.getByRole("button", { name: "Log viewing" }).click();

    await expect(page.getByRole("status")).toHaveText("Logged.");
    expect(server.creates[0]?.ratingImdb).toBe("8.0/10");
    expect(server.creates[0]?.director).toBe("Denis Villeneuve");
    // No disambiguation UI of any kind should appear.
    await expect(page.getByText(/which movie/i)).toHaveCount(0);
  });

  test("logs successfully with no OMDb key set", async ({ page }) => {
    const server = await connect(page);

    await page.locator("#log-title").fill("Paddington");
    await page.locator("#log-start").fill("2026-02-01T18:00");
    await page.locator("#log-end").fill("2026-02-01T19:40");
    await page.locator("#log-medium").fill("netflix");
    await page.getByRole("button", { name: "Log viewing" }).click();

    await expect(page.getByRole("status")).toHaveText("Logged.");
    expect(server.creates[0]?.ratingImdb).toBeUndefined();
  });
});
