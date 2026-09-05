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

async function connect(page: Page, omdbApiKey?: string, omdbPaused = false) {
  const server = mockCaldavServer(page, CREDENTIALS["caldav-url"], []);
  await page.goto("/");
  await page.locator("#caldav-url").fill(CREDENTIALS["caldav-url"]);
  await page.locator("#caldav-username").fill(CREDENTIALS["caldav-username"]);
  await page.locator("#caldav-password").fill(CREDENTIALS["caldav-password"]);
  if (omdbApiKey) await page.locator("#omdb-api-key").fill(omdbApiKey);
  if (omdbPaused) await page.locator("#omdb-paused").check();
  await page.getByRole("button", { name: "Connect" }).click();
  await expect(page.getByRole("link", { name: "Log a viewing" })).toBeVisible();
  await page.getByRole("link", { name: "Log a viewing" }).click();
  return server;
}

test.describe("manual log form", () => {
  test("submits and creates the resulting CalDAV event", async ({ page }) => {
    const server = await connect(page);

    await page.locator("#log-title").fill("Paddington");
    await page.locator("#log-date").fill("2026-02-01");
    await page.locator("#log-start-time").fill("18:00");
    await page.locator("#log-end-time").fill("19:40");
    await page.locator("#log-medium").fill("netflix");
    await page.getByRole("button", { name: "Log viewing" }).click();

    await expect(page.getByRole("status")).toHaveText("Logged.");
    expect(server.creates).toHaveLength(1);
    expect(server.creates[0]?.title).toBe("Paddington");
    expect(server.creates[0]?.medium).toBe("netflix");
  });

  test("logs with just a date — start and end time are both optional", async ({ page }) => {
    const server = await connect(page);

    await page.locator("#log-title").fill("Paddington");
    await page.locator("#log-date").fill("2026-02-01");
    await page.locator("#log-medium").fill("netflix");
    await page.getByRole("button", { name: "Log viewing" }).click();

    await expect(page.getByRole("status")).toHaveText("Logged.");
    expect(server.creates).toHaveLength(1);
    // No time given defaults to midnight; no end time given defaults to
    // the (also-defaulted) start time — same rule the CSV/JSON importer
    // already applies to a row with no times at all.
    expect(server.creates[0]?.start).toBe(new Date("2026-02-01T00:00:00").toISOString());
    expect(server.creates[0]?.end).toBe(server.creates[0]?.start);
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
    await page.locator("#log-date").fill("2026-01-01");
    await page.locator("#log-start-time").fill("19:00");
    await page.locator("#log-end-time").fill("21:30");
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
    await page.locator("#log-date").fill("2026-02-01");
    await page.locator("#log-start-time").fill("18:00");
    await page.locator("#log-end-time").fill("19:40");
    await page.locator("#log-medium").fill("netflix");
    await page.getByRole("button", { name: "Log viewing" }).click();

    await expect(page.getByRole("status")).toHaveText("Logged.");
    expect(server.creates[0]?.ratingImdb).toBeUndefined();
  });

  // #80: a stored key that's paused makes no OMDb call at all — this
  // asserts the network side, not just the resulting fields, since a
  // fetch that happens to find nothing would look identical from the
  // saved viewing alone.
  test("makes no OMDb request while lookups are paused, even with a key set", async ({ page }) => {
    const server = await connect(page, "test-omdb-key", true);
    let omdbCalls = 0;
    await page.route("https://www.omdbapi.com/**", async (route: Route) => {
      omdbCalls++;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ Response: "False" }),
      });
    });

    await page.locator("#log-title").fill("Dune");
    await page.locator("#log-date").fill("2026-01-01");
    await page.locator("#log-medium").fill("cinema");
    await page.getByRole("button", { name: "Log viewing" }).click();

    await expect(page.getByRole("status")).toHaveText("Logged.");
    expect(omdbCalls).toBe(0);
    expect(server.creates[0]?.ratingImdb).toBeUndefined();
    await expect(page.getByLabel("Choose the matching title")).toHaveCount(0);
  });

  test("offers a disambiguation picker when there's no confident match, and attaches the chosen candidate", async ({
    page,
  }) => {
    const server = await connect(page, "test-omdb-key");
    page.route("https://www.omdbapi.com/**", async (route: Route) => {
      const url = new URL(route.request().url());
      if (url.searchParams.get("t")) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ Response: "False" }),
        });
        return;
      }
      if (url.searchParams.get("s")) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            Response: "True",
            Search: [
              {
                Title: "Dune",
                Year: "2021",
                imdbID: "tt1160419",
                Poster: "https://example.com/dune-2021.jpg",
              },
              {
                Title: "Dune",
                Year: "1984",
                imdbID: "tt0087182",
                Poster: "https://example.com/dune-1984.jpg",
              },
            ],
          }),
        });
        return;
      }
      // i=<imdbID>: the chosen candidate's full details.
      expect(url.searchParams.get("i")).toBe("tt1160419");
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          Response: "True",
          Director: "Denis Villeneuve",
          Year: "2021",
          imdbID: "tt1160419",
          Ratings: [{ Source: "Internet Movie Database", Value: "8.0/10" }],
        }),
      });
    });

    await page.locator("#log-title").fill("Dune");
    await page.locator("#log-date").fill("2026-01-01");
    await page.locator("#log-medium").fill("cinema");
    await page.getByRole("button", { name: "Log viewing" }).click();

    await expect(page.getByRole("status")).toHaveText("Logged.");
    expect(server.creates[0]?.ratingImdb).toBeUndefined();

    const picker = page.getByLabel("Choose the matching title");
    await expect(picker.getByRole("button", { name: "Dune (2021)" })).toBeVisible();
    await expect(picker.getByRole("button", { name: "Dune (1984)" })).toBeVisible();
    await picker.getByRole("button", { name: "Dune (2021)" }).click();

    await expect(page.getByRole("status")).toHaveText("Logged and matched.");
    expect(server.updates).toHaveLength(1);
    expect(server.updates[0]?.director).toBe("Denis Villeneuve");
    expect(server.updates[0]?.ratingImdb).toBe("8.0/10");
    await expect(picker).toHaveCount(0);
  });

  test("dismissing the disambiguation picker leaves the entry without metadata", async ({
    page,
  }) => {
    const server = await connect(page, "test-omdb-key");
    page.route("https://www.omdbapi.com/**", async (route: Route) => {
      const url = new URL(route.request().url());
      if (url.searchParams.get("s")) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            Response: "True",
            Search: [
              {
                Title: "Dune",
                Year: "2021",
                imdbID: "tt1160419",
                Poster: "https://example.com/dune.jpg",
              },
            ],
          }),
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ Response: "False" }),
      });
    });

    await page.locator("#log-title").fill("Dune");
    await page.locator("#log-date").fill("2026-01-01");
    await page.locator("#log-medium").fill("cinema");
    await page.getByRole("button", { name: "Log viewing" }).click();

    const picker = page.getByLabel("Choose the matching title");
    await expect(picker).toBeVisible();
    await picker.getByRole("button", { name: "Continue without metadata" }).click();

    await expect(picker).toHaveCount(0);
    expect(server.updates).toHaveLength(0);
    expect(server.creates[0]?.ratingImdb).toBeUndefined();
  });

  test("no picker appears when OMDb's search also finds no candidates", async ({ page }) => {
    const server = await connect(page, "test-omdb-key");
    page.route("https://www.omdbapi.com/**", async (route: Route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ Response: "False" }),
      });
    });

    await page.locator("#log-title").fill("Not A Real Movie");
    await page.locator("#log-date").fill("2026-01-01");
    await page.locator("#log-medium").fill("cinema");
    await page.getByRole("button", { name: "Log viewing" }).click();

    await expect(page.getByRole("status")).toHaveText("Logged.");
    await expect(page.getByLabel("Choose the matching title")).toHaveCount(0);
    expect(server.creates[0]?.ratingImdb).toBeUndefined();
  });
});
