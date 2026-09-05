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
  venue: "Grand Vista Cinema",
  director: "Denis Villeneuve",
  actors: "Timothée Chalamet, Zendaya",
  ratingImdb: "8.0",
  ratingRottenTomatoes: "83%",
  genre: "Action, Adventure, Drama",
  year: "2021",
  posterUrl: "https://example.com/dune-poster.jpg",
  imdbId: "tt1160419",
  notes: "Watched with Sam, a rewatch after the extended cut",
};

// #91: no imdbId — refresh now re-checks the calendar entry first and
// skips OMDb entirely once an imdbId is already there, so a
// disambiguation scenario needs a title that genuinely hasn't been
// matched yet.
const DUNE_UNMATCHED = {
  uid: "dune-uid",
  title: "Dune",
  start: ONE_MONTH_AGO.toISOString(),
  end: new Date(ONE_MONTH_AGO.getTime() + 2.5 * 60 * 60 * 1000).toISOString(),
  medium: "cinema",
  venue: "Grand Vista Cinema",
};

async function connect(page: Page, omdbApiKey?: string) {
  await page.goto("/");
  await page.locator("#caldav-url").fill(CREDENTIALS["caldav-url"]);
  await page.locator("#caldav-username").fill(CREDENTIALS["caldav-username"]);
  await page.locator("#caldav-password").fill(CREDENTIALS["caldav-password"]);
  if (omdbApiKey) await page.locator("#omdb-api-key").fill(omdbApiKey);
  await page.getByRole("button", { name: "Connect" }).click();
  // Credential storage is async (see credentials-gate.ts's renderForm) —
  // wait for its result to actually render before doing anything else, so
  // a test that navigates away right after connect() isn't racing the
  // write.
  await expect(page.getByRole("link", { name: "Log a viewing" })).toBeVisible();
}

test.describe("movie details page", () => {
  test("navigating from the overview shows the full metadata, and back returns to the overview", async ({
    page,
  }) => {
    mockCaldavServer(page, CREDENTIALS["caldav-url"], [DUNE]);
    await connect(page);

    await page.getByRole("link", { name: "Dune" }).click();
    // Astro's static build serves this as a directory (`movie/index.html`),
    // and the static server 30x-redirects the extensionless request to add
    // the trailing slash — hence the optional `/` here.
    await expect(page).toHaveURL(/\/movie\/?\?uid=dune-uid/);

    await expect(page.getByRole("heading", { name: "Dune (2021)" })).toBeVisible();
    await expect(page.getByText("Grand Vista Cinema")).toBeVisible();
    await expect(page.getByText("Denis Villeneuve")).toBeVisible();
    await expect(page.getByText("Timothée Chalamet, Zendaya")).toBeVisible();
    await expect(page.getByText("Action, Adventure, Drama")).toBeVisible();
    await expect(page.getByText("IMDb 8.0")).toBeVisible();
    await expect(page.getByText(DUNE.notes)).toBeVisible();
    await expect(page.getByRole("img", { name: "Dune poster" })).toHaveAttribute(
      "src",
      DUNE.posterUrl,
    );
    await expect(page.getByRole("link", { name: "IMDb" })).toHaveAttribute(
      "href",
      "https://www.imdb.com/title/tt1160419/",
    );

    await page.getByRole("link", { name: "Back to overview" }).click();
    await expect(page).toHaveURL("/");
    await expect(page.locator("tbody tr")).toHaveCount(1);
  });

  test("no notes field shows at all when the viewing has none", async ({ page }) => {
    mockCaldavServer(page, CREDENTIALS["caldav-url"], [DUNE_UNMATCHED]);
    await connect(page);
    await page.getByRole("link", { name: "Dune" }).click();

    await expect(page.getByRole("heading", { name: /Dune/ })).toBeVisible();
    await expect(page.getByText("Notes", { exact: true })).toHaveCount(0);
  });

  test("edit and delete are reachable from the details page", async ({ page }) => {
    const server = mockCaldavServer(page, CREDENTIALS["caldav-url"], [DUNE]);
    await connect(page);
    await page.getByRole("link", { name: "Dune" }).click();

    await page.getByRole("button", { name: "Edit" }).click();
    await page.locator("#details-venue").fill("Regal Union Square");
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByRole("status")).toHaveText("Saved.");
    expect(server.updates[0]?.venue).toBe("Regal Union Square");

    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "Delete" }).click();
    await expect(page.getByRole("status")).toHaveText("Deleted.");
    expect(server.deletes).toEqual(["dune-uid"]);
  });

  test("offers a disambiguation picker when refreshing finds no confident match", async ({
    page,
  }) => {
    const server = mockCaldavServer(page, CREDENTIALS["caldav-url"], [DUNE_UNMATCHED]);
    await connect(page, "test-omdb-key");
    await page.getByRole("link", { name: "Dune" }).click();

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
                Year: "1984",
                imdbID: "tt0087182",
                Poster: "https://example.com/dune-1984.jpg",
              },
            ],
          }),
        });
        return;
      }
      expect(url.searchParams.get("i")).toBe("tt0087182");
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          Response: "True",
          Director: "David Lynch",
          imdbID: "tt0087182",
          Ratings: [],
        }),
      });
    });

    await page.getByRole("button", { name: "Refresh metadata" }).click();

    const picker = page.getByLabel("Choose the matching title");
    await expect(picker.getByRole("button", { name: "Dune (1984)" })).toBeVisible();
    await picker.getByRole("button", { name: "Dune (1984)" }).click();

    await expect(page.getByRole("status")).toHaveText("Refreshed.");
    expect(server.updates).toHaveLength(1);
    expect(server.updates[0]?.director).toBe("David Lynch");
    await expect(picker).toHaveCount(0);
  });

  test("a missing uid shows a clear not-found state, not an error", async ({ page }) => {
    mockCaldavServer(page, CREDENTIALS["caldav-url"], [DUNE]);
    await connect(page);

    await page.goto("/movie?uid=does-not-exist");
    await expect(page.getByText(/not found/i)).toBeVisible();
    await expect(page.getByRole("link", { name: "Back to overview" })).toBeVisible();
  });

  test("no uid in the URL at all also shows the not-found state", async ({ page }) => {
    mockCaldavServer(page, CREDENTIALS["caldav-url"], [DUNE]);
    await connect(page);

    await page.goto("/movie");
    await expect(page.getByText(/not found/i)).toBeVisible();
  });
});
