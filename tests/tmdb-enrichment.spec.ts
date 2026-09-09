import { expect, type Page, type Route, test } from "@playwright/test";
import type { LoggedViewing } from "../src/lib/caldav/types";
import { mockCaldavServer } from "./support/mock-caldav";

// #360/#400: TMDb enrichment, wired into every place this app already
// attaches OMDb metadata — single-row refresh, bulk refresh, and both
// initial-log entry points (manual form, Pathé-email confirm). TMDb only
// ever runs off an IMDb ID OMDb has already resolved, so every scenario
// here sets up a confident (or picker-selected) OMDb match first.

const CREDENTIALS = {
  "caldav-url": "https://caldav.example.com/calendars/me/movies/",
  "caldav-username": "me",
  "caldav-password": "secret",
};

const ONE_MONTH_AGO = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

const DUNE = {
  uid: "dune-uid",
  title: "Dune",
  start: ONE_MONTH_AGO.toISOString(),
  end: new Date(ONE_MONTH_AGO.getTime() + 2.5 * 60 * 60 * 1000).toISOString(),
  medium: "cinema",
};

const PADDINGTON = {
  uid: "paddington-uid",
  title: "Paddington",
  start: ONE_MONTH_AGO.toISOString(),
  end: new Date(ONE_MONTH_AGO.getTime() + 1.5 * 60 * 60 * 1000).toISOString(),
  medium: "netflix",
};

const OMDB_MATCH = {
  Response: "True",
  Director: "Denis Villeneuve",
  imdbID: "tt1160419",
  Ratings: [{ Source: "Internet Movie Database", Value: "8.0/10" }],
};

function tmdbFindRoute(page: Page, tmdbId = 438631) {
  return page.route("https://api.themoviedb.org/3/find/**", async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ movie_results: [{ id: tmdbId }] }),
    });
  });
}

function tmdbMovieRoute(page: Page, movieResponse: Record<string, unknown>) {
  return page.route("https://api.themoviedb.org/3/movie/**", async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        budget: 0,
        popularity: 0,
        credits: { cast: [] },
        videos: { results: [] },
        release_dates: { results: [] },
        keywords: { keywords: [] },
        ...movieResponse,
      }),
    });
  });
}

const FULL_TMDB_RESPONSE = {
  homepage: "https://dunemovie.com",
  belongs_to_collection: { id: 1, name: "Dune Collection" },
  budget: 165_000_000,
  popularity: 123.456,
  credits: { cast: [{ name: "Timothée Chalamet", order: 0 }] },
  videos: {
    results: [{ key: "abc123", site: "YouTube", type: "Trailer", official: true }],
  },
  release_dates: {
    results: [{ iso_3166_1: "US", release_dates: [{ certification: "PG-13" }] }],
  },
  keywords: {
    keywords: [
      { id: 1, name: "epic" },
      { id: 2, name: "desert" },
    ],
  },
};

function expectFullTmdbFields(update: LoggedViewing | undefined) {
  expect(update?.trailerUrl).toBe("https://www.youtube.com/watch?v=abc123");
  expect(update?.collection).toBe("Dune Collection");
  expect(update?.certification).toBe("PG-13");
  expect(update?.keywords).toBe("epic, desert");
  expect(update?.budget).toBe("165000000");
  expect(update?.popularity).toBe("123.456");
}

async function connectOverview(page: Page, omdbApiKey: string, tmdbApiKey?: string) {
  await page.goto("/");
  await page.locator("#caldav-url").fill(CREDENTIALS["caldav-url"]);
  await page.locator("#caldav-username").fill(CREDENTIALS["caldav-username"]);
  await page.locator("#caldav-password").fill(CREDENTIALS["caldav-password"]);
  await page.locator("#omdb-api-key").fill(omdbApiKey);
  if (tmdbApiKey) await page.locator("#tmdb-api-key").fill(tmdbApiKey);
  await page.getByRole("button", { name: "Connect" }).click();
}

async function connectLogForm(page: Page, omdbApiKey: string, tmdbApiKey?: string) {
  const server = mockCaldavServer(page, CREDENTIALS["caldav-url"], []);
  await page.goto("/");
  await page.locator("#caldav-url").fill(CREDENTIALS["caldav-url"]);
  await page.locator("#caldav-username").fill(CREDENTIALS["caldav-username"]);
  await page.locator("#caldav-password").fill(CREDENTIALS["caldav-password"]);
  await page.locator("#omdb-api-key").fill(omdbApiKey);
  if (tmdbApiKey) await page.locator("#tmdb-api-key").fill(tmdbApiKey);
  await page.getByRole("button", { name: "Connect" }).click();
  await expect(page.getByRole("link", { name: "Log a viewing" })).toBeVisible();
  await page.getByRole("link", { name: "Log a viewing" }).click();
  return server;
}

test.describe("TMDb enrichment", () => {
  test.describe("single-row refresh", () => {
    test("attaches TMDb's trailer/collection/certification/keywords/budget/popularity when both keys are set", async ({
      page,
    }) => {
      const server = mockCaldavServer(page, CREDENTIALS["caldav-url"], [DUNE]);
      await connectOverview(page, "test-omdb-key", "test-tmdb-key");

      await page.route("https://www.omdbapi.com/**", async (route: Route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(OMDB_MATCH),
        });
      });
      await tmdbFindRoute(page);
      await tmdbMovieRoute(page, FULL_TMDB_RESPONSE);

      await page.getByRole("button", { name: "Refresh metadata" }).click();

      await expect(page.getByRole("status").last()).toHaveText("Refreshed.");
      expect(server.updates).toHaveLength(1);
      expectFullTmdbFields(server.updates[0]);
      // The OMDb match itself still lands, same as before this feature.
      expect(server.updates[0]?.director).toBe("Denis Villeneuve");
    });

    test("skips TMDb entirely, with no error, when no TMDb key is configured", async ({ page }) => {
      const server = mockCaldavServer(page, CREDENTIALS["caldav-url"], [DUNE]);
      await connectOverview(page, "test-omdb-key");

      await page.route("https://www.omdbapi.com/**", async (route: Route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(OMDB_MATCH),
        });
      });
      let tmdbCalls = 0;
      await page.route("https://api.themoviedb.org/**", async (route: Route) => {
        tmdbCalls++;
        await route.fulfill({ status: 200, body: "" });
      });

      await page.getByRole("button", { name: "Refresh metadata" }).click();

      await expect(page.getByRole("status").last()).toHaveText("Refreshed.");
      expect(tmdbCalls).toBe(0);
      expect(server.updates).toHaveLength(1);
      expect(server.updates[0]?.trailerUrl).toBeUndefined();
      expect(server.updates[0]?.director).toBe("Denis Villeneuve");
    });

    test("attaches TMDb data via the disambiguation picker when refreshing finds no confident match", async ({
      page,
    }) => {
      const server = mockCaldavServer(page, CREDENTIALS["caldav-url"], [DUNE]);
      await connectOverview(page, "test-omdb-key", "test-tmdb-key");

      await page.route("https://www.omdbapi.com/**", async (route: Route) => {
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
                { Title: "Dune", Year: "2021", imdbID: "tt1160419", Poster: "https://x/dune.jpg" },
              ],
            }),
          });
          return;
        }
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(OMDB_MATCH),
        });
      });
      await tmdbFindRoute(page);
      await tmdbMovieRoute(page, FULL_TMDB_RESPONSE);

      await page.getByRole("button", { name: "Refresh metadata" }).click();
      const picker = page.getByLabel("Choose the matching title");
      await picker.getByRole("button", { name: "Dune (2021)" }).click();

      await expect(page.getByRole("status").last()).toHaveText("Refreshed.");
      expect(server.updates).toHaveLength(1);
      expectFullTmdbFields(server.updates[0]);
    });
  });

  test.describe("bulk refresh", () => {
    test("attaches TMDb data to every viewing in the batch that resolves an IMDb id", async ({
      page,
    }) => {
      const server = mockCaldavServer(page, CREDENTIALS["caldav-url"], [DUNE, PADDINGTON]);
      await connectOverview(page, "test-omdb-key", "test-tmdb-key");

      await page.route("https://www.omdbapi.com/**", async (route: Route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(OMDB_MATCH),
        });
      });
      await tmdbFindRoute(page);
      await tmdbMovieRoute(page, FULL_TMDB_RESPONSE);

      await page.getByRole("button", { name: "Refresh all metadata" }).click();

      await expect(page.getByRole("status").last()).toHaveText("Refreshed 2 of 2.");
      expect(server.updates).toHaveLength(2);
      for (const update of server.updates) expectFullTmdbFields(update);
    });

    test("skips TMDb entirely for a bulk refresh with no TMDb key configured", async ({ page }) => {
      const server = mockCaldavServer(page, CREDENTIALS["caldav-url"], [DUNE, PADDINGTON]);
      await connectOverview(page, "test-omdb-key");

      await page.route("https://www.omdbapi.com/**", async (route: Route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(OMDB_MATCH),
        });
      });
      let tmdbCalls = 0;
      await page.route("https://api.themoviedb.org/**", async (route: Route) => {
        tmdbCalls++;
        await route.fulfill({ status: 200, body: "" });
      });

      await page.getByRole("button", { name: "Refresh all metadata" }).click();

      await expect(page.getByRole("status").last()).toHaveText("Refreshed 2 of 2.");
      expect(tmdbCalls).toBe(0);
      expect(server.updates).toHaveLength(2);
      for (const update of server.updates) expect(update?.trailerUrl).toBeUndefined();
    });
  });

  test.describe("manual log", () => {
    test("attaches TMDb data alongside a confident OMDb match when both keys are set", async ({
      page,
    }) => {
      const server = await connectLogForm(page, "test-omdb-key", "test-tmdb-key");

      await page.route("https://www.omdbapi.com/**", async (route: Route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(OMDB_MATCH),
        });
      });
      await tmdbFindRoute(page);
      await tmdbMovieRoute(page, FULL_TMDB_RESPONSE);

      await page.locator("#log-title").fill("Dune");
      await page.locator("#log-date").fill("2026-01-01");
      await page.locator("#log-medium").fill("cinema");
      await page.getByRole("button", { name: "Log viewing" }).click();

      await expect(page.getByRole("status")).toHaveText("Logged.");
      expect(server.creates).toHaveLength(1);
      expectFullTmdbFields(server.creates[0]);
    });

    test("logs successfully with no TMDb key set — OMDb only, exactly as before", async ({
      page,
    }) => {
      const server = await connectLogForm(page, "test-omdb-key");

      await page.route("https://www.omdbapi.com/**", async (route: Route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(OMDB_MATCH),
        });
      });
      let tmdbCalls = 0;
      await page.route("https://api.themoviedb.org/**", async (route: Route) => {
        tmdbCalls++;
        await route.fulfill({ status: 200, body: "" });
      });

      await page.locator("#log-title").fill("Dune");
      await page.locator("#log-date").fill("2026-01-01");
      await page.locator("#log-medium").fill("cinema");
      await page.getByRole("button", { name: "Log viewing" }).click();

      await expect(page.getByRole("status")).toHaveText("Logged.");
      expect(tmdbCalls).toBe(0);
      expect(server.creates).toHaveLength(1);
      expect(server.creates[0]?.trailerUrl).toBeUndefined();
      expect(server.creates[0]?.director).toBe("Denis Villeneuve");
    });
  });

  test.describe("Pathé email log", () => {
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

    test("attaches TMDb data alongside a confident OMDb match when both keys are set", async ({
      page,
    }) => {
      const server = mockCaldavServer(page, CREDENTIALS["caldav-url"], []);
      await page.goto("/");
      await page.locator("#caldav-url").fill(CREDENTIALS["caldav-url"]);
      await page.locator("#caldav-username").fill(CREDENTIALS["caldav-username"]);
      await page.locator("#caldav-password").fill(CREDENTIALS["caldav-password"]);
      await page.locator("#omdb-api-key").fill("test-omdb-key");
      await page.locator("#tmdb-api-key").fill("test-tmdb-key");
      await page.getByRole("button", { name: "Connect" }).click();
      await page.getByRole("link", { name: "Log a viewing" }).click();

      await page.route("https://www.omdbapi.com/**", async (route: Route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(OMDB_MATCH),
        });
      });
      await tmdbFindRoute(page);
      await tmdbMovieRoute(page, FULL_TMDB_RESPONSE);

      await page.locator("#pathe-email-text").fill(PATHE_EMAIL);
      await page.getByRole("button", { name: "Parse" }).click();
      await page.getByRole("button", { name: "Confirm and log" }).click();

      await expect(page.getByRole("status")).toHaveText("Logged.");
      expect(server.creates).toHaveLength(1);
      expectFullTmdbFields(server.creates[0]);
    });

    test("logs successfully with no TMDb key set — OMDb only, exactly as before", async ({
      page,
    }) => {
      const server = mockCaldavServer(page, CREDENTIALS["caldav-url"], []);
      await page.goto("/");
      await page.locator("#caldav-url").fill(CREDENTIALS["caldav-url"]);
      await page.locator("#caldav-username").fill(CREDENTIALS["caldav-username"]);
      await page.locator("#caldav-password").fill(CREDENTIALS["caldav-password"]);
      await page.locator("#omdb-api-key").fill("test-omdb-key");
      await page.getByRole("button", { name: "Connect" }).click();
      await page.getByRole("link", { name: "Log a viewing" }).click();

      await page.route("https://www.omdbapi.com/**", async (route: Route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(OMDB_MATCH),
        });
      });
      let tmdbCalls = 0;
      await page.route("https://api.themoviedb.org/**", async (route: Route) => {
        tmdbCalls++;
        await route.fulfill({ status: 200, body: "" });
      });

      await page.locator("#pathe-email-text").fill(PATHE_EMAIL);
      await page.getByRole("button", { name: "Parse" }).click();
      await page.getByRole("button", { name: "Confirm and log" }).click();

      await expect(page.getByRole("status")).toHaveText("Logged.");
      expect(tmdbCalls).toBe(0);
      expect(server.creates).toHaveLength(1);
      expect(server.creates[0]?.trailerUrl).toBeUndefined();
      expect(server.creates[0]?.director).toBe("Denis Villeneuve");
    });
  });
});
