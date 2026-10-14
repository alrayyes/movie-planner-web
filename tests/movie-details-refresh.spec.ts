import { expect, type Page, type Route, test } from "@playwright/test";
import { openOptionalIntegrations } from "./support/connect-form";
import { mockCaldavServer } from "./support/mock-caldav";

// #877: "Refresh metadata" and "Search OMDb" on a movie's own page. An imported
// calendar has viewings with a poster and an IMDb ID but no synopsis or trailer;
// the refresh has to fill them in rather than say "already up to date".

const CREDENTIALS = {
  "caldav-url": "https://caldav.example.com/calendars/me/movies/",
  "caldav-username": "me",
  "caldav-password": "secret",
};

const ONE_MONTH_AGO = new Date(Math.floor((Date.now() - 30 * 24 * 60 * 60 * 1000) / 1000) * 1000);

const PARTIAL = {
  uid: "dune-uid",
  title: "Dune",
  start: ONE_MONTH_AGO.toISOString(),
  end: new Date(ONE_MONTH_AGO.getTime() + 2.5 * 60 * 60 * 1000).toISOString(),
  medium: "cinema",
  year: "2021",
  imdbId: "tt1160419",
  posterUrl: "https://example.com/dune.jpg",
};

const OMDB_FULL = {
  Response: "True",
  Director: "Denis Villeneuve",
  Actors: "Timothée Chalamet",
  Genre: "Drama",
  Plot: "A desert planet.",
  Poster: "https://example.com/dune.jpg",
  imdbID: "tt1160419",
  Ratings: [],
};

async function connect(page: Page) {
  await page.goto("/");
  await page.locator("#caldav-url").fill(CREDENTIALS["caldav-url"]);
  await page.locator("#caldav-username").fill(CREDENTIALS["caldav-username"]);
  await page.locator("#caldav-password").fill(CREDENTIALS["caldav-password"]);
  await openOptionalIntegrations(page);
  await page.locator("#omdb-api-key").fill("test-omdb-key");
  await page.locator("#tmdb-api-key").fill("test-tmdb-key");
  await page.getByRole("button", { name: "Connect" }).click();
  await expect(page.getByRole("button", { name: "Log a viewing" })).toBeVisible();
}

async function mockTmdb(page: Page) {
  await page.route("https://api.themoviedb.org/3/find/**", async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ movie_results: [{ id: 438631 }] }),
    });
  });
  await page.route("https://api.themoviedb.org/3/movie/**", async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        budget: 0,
        popularity: 0,
        credits: { cast: [] },
        videos: { results: [{ key: "abc123", site: "YouTube", type: "Trailer", official: true }] },
        release_dates: { results: [] },
        keywords: { keywords: [] },
      }),
    });
  });
}

test.describe("refreshing a movie from its own page", () => {
  test("fills in the synopsis, director and trailer on an entry that already has a poster and an IMDb ID", async ({
    page,
  }) => {
    const server = mockCaldavServer(page, CREDENTIALS["caldav-url"], [PARTIAL]);
    await connect(page);
    await mockTmdb(page);
    await page.route("https://www.omdbapi.com/**", async (route: Route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(OMDB_FULL),
      });
    });
    await page.getByRole("link", { name: "Dune (2021)" }).click();

    await page.getByRole("button", { name: "Refresh metadata" }).click();

    await expect(page.locator("#movie-status")).toHaveText("Refreshed.");
    expect(server.updates).toHaveLength(1);
    expect(server.updates[0]?.synopsis).toBe("A desert planet.");
    expect(server.updates[0]?.director).toBe("Denis Villeneuve");
    expect(server.updates[0]?.trailerUrl).toBe("https://www.youtube.com/watch?v=abc123");
  });

  test("says it is up to date, and never calls OMDb, when nothing is missing", async ({ page }) => {
    const complete = {
      ...PARTIAL,
      director: "Denis Villeneuve",
      actors: "Timothée Chalamet",
      genre: "Drama",
      synopsis: "A desert planet.",
    };
    const server = mockCaldavServer(page, CREDENTIALS["caldav-url"], [complete]);
    await connect(page);
    let omdbCalls = 0;
    await page.route("https://www.omdbapi.com/**", async (route: Route) => {
      omdbCalls++;
      await route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
    });
    await page.getByRole("link", { name: "Dune (2021)" }).click();

    await page.getByRole("button", { name: "Refresh metadata" }).click();

    await expect(page.locator("#movie-status")).toHaveText("Already up to date.");
    expect(omdbCalls).toBe(0);
    expect(server.updates).toHaveLength(0);
  });

  // #881: a hand-corrected match survives a refresh.
  test("refreshes an entry from its own IMDb ID rather than looking its title up again", async ({
    page,
  }) => {
    const chosen = { ...PARTIAL, imdbId: "tt0087182", posterUrl: "https://example.com/1984.jpg" };
    const server = mockCaldavServer(page, CREDENTIALS["caldav-url"], [chosen]);
    await connect(page);
    const asked: string[] = [];
    await page.route("https://www.omdbapi.com/**", async (route: Route) => {
      const url = new URL(route.request().url());
      asked.push(url.searchParams.get("i") ?? `title:${url.searchParams.get("t")}`);
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ...OMDB_FULL, Director: "David Lynch", imdbID: "tt0087182" }),
      });
    });
    await page.getByRole("link", { name: "Dune (2021)" }).click();

    await page.getByRole("button", { name: "Refresh metadata" }).click();

    await expect(page.locator("#movie-status")).toHaveText("Refreshed.");
    expect(asked).toEqual(["tt0087182"]);
    expect(server.updates[0]?.imdbId).toBe("tt0087182");
    expect(server.updates[0]?.director).toBe("David Lynch");
  });

  test("a match chosen from Search OMDb gets its trailer too", async ({ page }) => {
    const server = mockCaldavServer(page, CREDENTIALS["caldav-url"], [PARTIAL]);
    await connect(page);
    await mockTmdb(page);
    await page.route("https://www.omdbapi.com/**", async (route: Route) => {
      const url = new URL(route.request().url());
      const body = url.searchParams.get("s")
        ? {
            Response: "True",
            Search: [
              {
                Title: "Dune",
                Year: "2021",
                imdbID: "tt1160419",
                Poster: "https://example.com/dune.jpg",
              },
              {
                Title: "Dune",
                Year: "1984",
                imdbID: "tt0087182",
                Poster: "https://example.com/dune-1984.jpg",
              },
            ],
          }
        : OMDB_FULL;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(body),
      });
    });
    await page.getByRole("link", { name: "Dune (2021)" }).click();

    await page.getByRole("button", { name: "Search OMDb" }).click();
    await page.locator("#omdb-search-query").fill("Dune");
    await page.getByRole("button", { name: "Search", exact: true }).click();
    await page
      .getByLabel("Choose the matching title")
      .getByRole("button", { name: "Dune (2021)" })
      .click();

    await expect(page.locator("#movie-status")).toHaveText("Refreshed.");
    expect(server.updates[0]?.director).toBe("Denis Villeneuve");
    expect(server.updates[0]?.trailerUrl).toBe("https://www.youtube.com/watch?v=abc123");
  });

  test("says so, and writes nothing, when OMDb has no details for the chosen match", async ({
    page,
  }) => {
    const server = mockCaldavServer(page, CREDENTIALS["caldav-url"], [PARTIAL]);
    await connect(page);
    await page.route("https://www.omdbapi.com/**", async (route: Route) => {
      const url = new URL(route.request().url());
      const body = url.searchParams.get("s")
        ? {
            Response: "True",
            Search: [
              {
                Title: "Dune",
                Year: "2021",
                imdbID: "tt1160419",
                Poster: "https://example.com/dune.jpg",
              },
              {
                Title: "Dune",
                Year: "1984",
                imdbID: "tt0087182",
                Poster: "https://example.com/dune-1984.jpg",
              },
            ],
          }
        : { Response: "False", Error: "Request limit reached!" };
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(body),
      });
    });
    await page.getByRole("link", { name: "Dune (2021)" }).click();

    await page.getByRole("button", { name: "Search OMDb" }).click();
    await page.locator("#omdb-search-query").fill("Dune");
    await page.getByRole("button", { name: "Search", exact: true }).click();
    await page
      .getByLabel("Choose the matching title")
      .getByRole("button", { name: "Dune (2021)" })
      .click();

    await expect(page.locator("#movie-status")).toHaveText("OMDb had no details for that match.");
    expect(server.updates).toHaveLength(0);
  });
});
