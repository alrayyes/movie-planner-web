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

const PADDINGTON = {
  uid: "paddington-uid",
  title: "Paddington",
  start: ONE_MONTH_AGO.toISOString(),
  end: new Date(ONE_MONTH_AGO.getTime() + 1.5 * 60 * 60 * 1000).toISOString(),
  medium: "netflix",
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

  test("offers a disambiguation picker when refreshing finds no confident match", async ({
    page,
  }) => {
    const server = mockCaldavServer(page, CREDENTIALS["caldav-url"], [DUNE]);
    await connect(page, "test-omdb-key");

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
                Poster: "https://example.com/dune.jpg",
              },
            ],
          }),
        });
        return;
      }
      expect(url.searchParams.get("i")).toBe("tt1160419");
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          Response: "True",
          Director: "Denis Villeneuve",
          imdbID: "tt1160419",
          Ratings: [{ Source: "Internet Movie Database", Value: "8.0/10" }],
        }),
      });
    });

    await page.getByRole("button", { name: "Refresh metadata" }).click();

    const picker = page.getByLabel("Choose the matching title");
    await expect(picker.getByRole("button", { name: "Dune (2021)" })).toBeVisible();
    await picker.getByRole("button", { name: "Dune (2021)" }).click();

    await expect(page.getByRole("status").last()).toHaveText("Refreshed.");
    expect(server.updates).toHaveLength(1);
    expect(server.updates[0]?.director).toBe("Denis Villeneuve");
    await expect(picker).toHaveCount(0);
  });

  test("no Refresh all control appears without an OMDb key set", async ({ page }) => {
    mockCaldavServer(page, CREDENTIALS["caldav-url"], [DUNE]);
    await connect(page);

    await expect(page.getByRole("button", { name: "Refresh all metadata" })).toHaveCount(0);
  });

  test("refresh all re-fetches every viewing currently on screen", async ({ page }) => {
    const server = mockCaldavServer(page, CREDENTIALS["caldav-url"], [DUNE, PADDINGTON]);
    await connect(page, "test-omdb-key");

    page.route("https://www.omdbapi.com/**", async (route: Route) => {
      const title = new URL(route.request().url()).searchParams.get("t");
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          Response: "True",
          Director: `${title} director`,
          Ratings: [{ Source: "Internet Movie Database", Value: "9.0/10" }],
        }),
      });
    });

    await page.getByRole("button", { name: "Refresh all metadata" }).click();

    await expect(page.getByRole("status").last()).toHaveText("Refreshed 2 of 2.");
    expect(server.updates).toHaveLength(2);
    expect(server.updates.map((u) => u.director).sort()).toEqual([
      "Dune director",
      "Paddington director",
    ]);
  });

  // #59: "refresh all" acts on the current page of the (filtered, sorted)
  // set, not the whole thing — same rule the medium filter already had,
  // now extended to pagination.
  test("refresh all only refreshes the current page, not every page", async ({ page }) => {
    const viewings = Array.from({ length: 26 }, (_, i) => ({
      uid: `viewing-${i}`,
      title: `Movie ${String(i).padStart(2, "0")}`,
      start: new Date(Date.now() - i * 24 * 60 * 60 * 1000).toISOString(),
      end: new Date(Date.now() - i * 24 * 60 * 60 * 1000 + 60 * 60 * 1000).toISOString(),
      medium: "cinema",
    }));
    const server = mockCaldavServer(page, CREDENTIALS["caldav-url"], viewings);
    await connect(page, "test-omdb-key");

    page.route("https://www.omdbapi.com/**", async (route: Route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          Response: "True",
          Director: "Some Director",
          Ratings: [],
        }),
      });
    });

    await page.getByRole("button", { name: "Next page" }).click();
    await expect(page.locator("tbody tr")).toHaveCount(1);

    await page.getByRole("button", { name: "Refresh all metadata" }).click();

    await expect(page.getByRole("status").last()).toHaveText("Refreshed 1 of 1.");
    expect(server.updates).toHaveLength(1);
  });

  test("refresh all reports misses without failing the whole batch", async ({ page }) => {
    const server = mockCaldavServer(page, CREDENTIALS["caldav-url"], [DUNE, PADDINGTON]);
    await connect(page, "test-omdb-key");

    page.route("https://www.omdbapi.com/**", async (route: Route) => {
      const title = new URL(route.request().url()).searchParams.get("t");
      if (title === "Paddington") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ Response: "False" }),
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          Response: "True",
          Director: "Denis Villeneuve",
          Ratings: [],
        }),
      });
    });

    await page.getByRole("button", { name: "Refresh all metadata" }).click();

    await expect(page.getByRole("status").last()).toHaveText(
      "Refreshed 1 of 2 (1 had no OMDb match or failed).",
    );
    expect(server.updates).toHaveLength(1);
    expect(server.updates[0]?.title).toBe("Dune");
  });
});
