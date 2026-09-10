import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, type Route, test } from "@playwright/test";
import { mockCaldavServer } from "./support/mock-caldav";

const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

const CREDENTIALS = {
  "caldav-url": "https://caldav.example.com/calendars/me/movies/",
  "caldav-username": "me",
  "caldav-password": "secret",
};

const ONE_MONTH_AGO = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
const OMDB_FIELDS = {
  imdbId: "tt1000000",
  posterUrl: "https://example.com/poster.jpg",
  director: "Some Director",
  actors: "Some Actor",
  genre: "Drama",
  synopsis: "A story.",
};

function viewing(uid: string, title: string, overrides: Record<string, unknown> = {}) {
  return {
    uid,
    title,
    start: ONE_MONTH_AGO.toISOString(),
    end: new Date(ONE_MONTH_AGO.getTime() + 2 * 60 * 60 * 1000).toISOString(),
    medium: "cinema",
    ...overrides,
  };
}

const FULLY_MATCHED = viewing("full-match-uid", "Full Match", OMDB_FIELDS);
const MISSING_GENRE = viewing("missing-genre-uid", "Missing Genre", {
  ...OMDB_FIELDS,
  genre: undefined,
});
const MISSING_DIRECTOR = viewing("missing-director-uid", "Missing Director", {
  ...OMDB_FIELDS,
  director: undefined,
});
// Missing poster only — still "matched" in the sense of having some
// OMDb data, but hasOmdbMetadata (imdbId + poster) reads this as
// unmatched, so it's eligible for a bulk refresh.
const MISSING_POSTER = viewing("missing-poster-uid", "No Poster Title", {
  ...OMDB_FIELDS,
  posterUrl: undefined,
});
// Missing the IMDb match only — has a poster from some other source but
// no imdbId, also bulk-eligible, but not "missing poster" itself.
const MISSING_IMDB_MATCH = viewing("missing-imdb-uid", "No Match Title", {
  ...OMDB_FIELDS,
  imdbId: undefined,
});

async function connect(page: Page, omdbApiKey?: string) {
  await page.goto("/");
  await page.locator("#caldav-url").fill(CREDENTIALS["caldav-url"]);
  await page.locator("#caldav-username").fill(CREDENTIALS["caldav-username"]);
  await page.locator("#caldav-password").fill(CREDENTIALS["caldav-password"]);
  if (omdbApiKey) await page.locator("#omdb-api-key").fill(omdbApiKey);
  await page.getByRole("button", { name: "Connect" }).click();
  await expect(page.getByRole("link", { name: "Viewings" })).toBeVisible();
}

test.describe("missing-data overview", () => {
  test("shows a viewing's specific missing field, all checkboxes checked by default, no accessibility violations", async ({
    page,
  }) => {
    mockCaldavServer(page, CREDENTIALS["caldav-url"], [MISSING_GENRE]);
    await connect(page);
    await page.goto("/missing-data");

    const row = page.getByRole("row", { name: /Missing Genre/ });
    await expect(row.getByText("Genre", { exact: true })).toBeVisible();
    await expect(row.getByText("Director", { exact: true })).toHaveCount(0);

    for (const label of ["No IMDb match", "Poster", "Director", "Actors", "Genre", "Synopsis"]) {
      await expect(page.getByLabel(label)).toBeChecked();
    }

    const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
    expect(results.violations).toEqual([]);
  });

  test("nothing's missing when every logged viewing is fully matched", async ({ page }) => {
    mockCaldavServer(page, CREDENTIALS["caldav-url"], [FULLY_MATCHED]);
    await connect(page);
    await page.goto("/missing-data");

    await expect(page.getByText("Nothing's missing any of the checked fields.")).toBeVisible();
    await expect(page.getByRole("table")).toHaveCount(0);
  });

  test("unchecking every field but one narrows the list to just that gap", async ({ page }) => {
    mockCaldavServer(page, CREDENTIALS["caldav-url"], [MISSING_GENRE, MISSING_DIRECTOR]);
    await connect(page);
    await page.goto("/missing-data");

    await expect(page.getByText("Missing Genre")).toBeVisible();
    await expect(page.getByText("Missing Director")).toBeVisible();

    for (const label of ["No IMDb match", "Poster", "Director", "Actors", "Synopsis"]) {
      await page.getByLabel(label).uncheck();
    }

    await expect(page.getByText("Missing Genre")).toBeVisible();
    await expect(page.getByText("Missing Director")).toHaveCount(0);
  });

  test("per-row refresh finds a confident match and updates the entry", async ({ page }) => {
    const server = mockCaldavServer(page, CREDENTIALS["caldav-url"], [MISSING_IMDB_MATCH]);
    await connect(page, "test-omdb-key");
    await page.goto("/missing-data");

    page.route("https://www.omdbapi.com/**", async (route: Route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          Response: "True",
          Director: "A Director",
          Genre: "Drama",
          Poster: "https://example.com/new-poster.jpg",
          imdbID: "tt1160419",
        }),
      });
    });

    await page.getByRole("button", { name: "Refresh metadata" }).click();
    await expect(page.getByRole("status").last()).toHaveText("Refreshed.");

    expect(server.updates).toHaveLength(1);
    expect(server.updates[0]?.imdbId).toBe("tt1160419");
  });

  test("offers a disambiguation picker when refresh finds no single confident match", async ({
    page,
  }) => {
    const server = mockCaldavServer(page, CREDENTIALS["caldav-url"], [MISSING_IMDB_MATCH]);
    await connect(page, "test-omdb-key");
    await page.goto("/missing-data");

    page.route("https://www.omdbapi.com/**", async (route: Route) => {
      const url = new URL(route.request().url());
      if (url.searchParams.get("s")) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            Response: "True",
            Search: [{ Title: "No Match Title", Year: "2021", imdbID: "tt1160419", Poster: "N/A" }],
          }),
        });
        return;
      }
      if (url.searchParams.get("i")) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            Response: "True",
            imdbID: "tt1160419",
            Poster: "https://example.com/new-poster.jpg",
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

    await page.getByRole("button", { name: "Refresh metadata" }).click();
    await expect(page.getByText("OMDb didn't find a single confident match")).toBeVisible();

    await page.getByRole("button", { name: /No Match Title/ }).click();
    await expect(page.getByRole("status").last()).toHaveText("Refreshed.");
    expect(server.updates).toHaveLength(1);
  });

  test("bulk refresh is scoped to the current filter, not every bulk-eligible viewing", async ({
    page,
  }) => {
    const server = mockCaldavServer(page, CREDENTIALS["caldav-url"], [
      MISSING_POSTER,
      MISSING_IMDB_MATCH,
    ]);
    await connect(page, "test-omdb-key");
    await page.goto("/missing-data");

    // Both MISSING_POSTER and MISSING_IMDB_MATCH are bulk-eligible (each
    // lacks hasOmdbMetadata), but narrowing to only "Poster" should
    // scope the bulk refresh to MISSING_POSTER alone.
    for (const label of ["No IMDb match", "Director", "Actors", "Genre", "Synopsis"]) {
      await page.getByLabel(label).uncheck();
    }
    await expect(page.getByText("No Poster Title")).toBeVisible();
    await expect(page.getByText("No Match Title")).toHaveCount(0);

    page.route("https://www.omdbapi.com/**", async (route: Route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          Response: "True",
          imdbID: "tt1160419",
          Poster: "https://example.com/new-poster.jpg",
        }),
      });
    });

    await page.getByRole("button", { name: "Refresh all metadata" }).click();
    await expect(page.getByRole("status").last()).toHaveText("Refreshed 1 of 1.");

    expect(server.updates).toHaveLength(1);
    expect(server.updates[0]?.uid).toBe(MISSING_POSTER.uid);
  });

  test("paginates a large result set", async ({ page }) => {
    const many = Array.from({ length: 26 }, (_, i) =>
      viewing(`missing-genre-${i}`, `Missing Genre ${i}`, { ...OMDB_FIELDS, genre: undefined }),
    );
    mockCaldavServer(page, CREDENTIALS["caldav-url"], many);
    await connect(page);
    await page.goto("/missing-data");

    await expect(page.getByLabel("Pagination")).toBeVisible();
    await expect(page.getByText("Page 1 of 2")).toBeVisible();
  });

  test("is reachable from Settings", async ({ page }) => {
    mockCaldavServer(page, CREDENTIALS["caldav-url"], []);
    await connect(page);
    await page.goto("/settings");

    await page.getByRole("link", { name: "Missing data" }).click();
    await expect(page).toHaveURL(/\/missing-data/);
  });
});
