import { expect, type Page, type Route, test } from "@playwright/test";
import { mockCaldavServer } from "./support/mock-caldav";

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
  director: "Some Stale Director",
  ratingImdb: "1.0",
};

async function connect(page: Page, omdbApiKey?: string) {
  await page.goto("/");
  await page.locator("#caldav-url").fill(CREDENTIALS["caldav-url"]);
  await page.locator("#caldav-username").fill(CREDENTIALS["caldav-username"]);
  await page.locator("#caldav-password").fill(CREDENTIALS["caldav-password"]);
  if (omdbApiKey) await page.locator("#omdb-api-key").fill(omdbApiKey);
  await page.getByRole("button", { name: "Connect" }).click();
}

test.describe("refreshing OMDb metadata from the overview", () => {
  test("no Refresh control appears without an OMDb key set", async ({ page }) => {
    mockCaldavServer(page, CREDENTIALS["caldav-url"], [DUNE]);
    await connect(page);

    await expect(page.getByRole("button", { name: "Refresh metadata" })).toHaveCount(0);
  });

  test("refreshing re-fetches and overwrites the OMDb-sourced fields", async ({ page }) => {
    const server = mockCaldavServer(page, CREDENTIALS["caldav-url"], [DUNE]);
    await connect(page, "test-omdb-key");

    page.route("https://www.omdbapi.com/**", async (route: Route) => {
      const url = new URL(route.request().url());
      expect(url.searchParams.get("t")).toBe("Dune");
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          Response: "True",
          Director: "Denis Villeneuve",
          Actors: "Timothée Chalamet, Zendaya",
          Genre: "Action, Adventure, Drama",
          Year: "2021",
          Poster: "https://example.com/dune-poster.jpg",
          imdbID: "tt1160419",
          Ratings: [{ Source: "Internet Movie Database", Value: "8.0/10" }],
        }),
      });
    });

    await page.getByRole("button", { name: "Refresh metadata" }).click();

    await expect(page.getByRole("status").last()).toHaveText("Refreshed.");
    expect(server.updates).toHaveLength(1);
    const [update] = server.updates;
    expect(update?.director).toBe("Denis Villeneuve");
    expect(update?.ratingImdb).toBe("8.0/10");
    expect(update?.genre).toBe("Action, Adventure, Drama");
    expect(update?.year).toBe("2021");
    expect(update?.posterUrl).toBe("https://example.com/dune-poster.jpg");
    expect(update?.imdbId).toBe("tt1160419");
    // Unrelated fields the lookup doesn't touch stay as they were.
    expect(update?.title).toBe("Dune");
    expect(update?.medium).toBe("cinema");
  });

  test("reports plainly when OMDb has no match to refresh with", async ({ page }) => {
    mockCaldavServer(page, CREDENTIALS["caldav-url"], [DUNE]);
    await connect(page, "test-omdb-key");

    page.route("https://www.omdbapi.com/**", async (route: Route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ Response: "False" }),
      });
    });

    await page.getByRole("button", { name: "Refresh metadata" }).click();

    await expect(page.getByRole("status").last()).toHaveText("OMDb had no match for this title.");
  });
});
