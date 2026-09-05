import { expect, type Page, type Route, test } from "@playwright/test";
import { serializeViewingToVEvent } from "../src/lib/caldav/ical";
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

// #113: a CLI-logged entry the CLI itself parsed an IMDb link out of
// its own booking source — imdbId and ratingImdb, but no director,
// actors, genre, year, or poster, since no OMDb lookup ever ran for
// it. Distinct from DUNE (already has `director`) precisely because
// this is the shape that used to make Refresh a permanent no-op.
const CLI_LOGGED_NO_POSTER = {
  uid: "cli-logged-uid",
  title: "Dune",
  start: ONE_MONTH_AGO.toISOString(),
  end: new Date(ONE_MONTH_AGO.getTime() + 2.5 * 60 * 60 * 1000).toISOString(),
  medium: "cinema",
  imdbId: "tt1160419",
  ratingImdb: "8.0/10",
};

async function connect(page: Page, omdbApiKey?: string, omdbPaused = false) {
  await page.goto("/");
  await page.locator("#caldav-url").fill(CREDENTIALS["caldav-url"]);
  await page.locator("#caldav-username").fill(CREDENTIALS["caldav-username"]);
  await page.locator("#caldav-password").fill(CREDENTIALS["caldav-password"]);
  if (omdbApiKey) await page.locator("#omdb-api-key").fill(omdbApiKey);
  if (omdbPaused) await page.locator("#omdb-paused").check();
  await page.getByRole("button", { name: "Connect" }).click();
}

test.describe("refreshing OMDb metadata from the overview", () => {
  test("no Refresh control appears without an OMDb key set", async ({ page }) => {
    mockCaldavServer(page, CREDENTIALS["caldav-url"], [DUNE]);
    await connect(page);

    await expect(page.getByRole("button", { name: "Refresh metadata" })).toHaveCount(0);
  });

  // #80: a paused visitor has a key stored but doesn't want it used yet —
  // same observable effect as having no key at all.
  test("no Refresh controls appear while OMDb lookups are paused, even with a key set", async ({
    page,
  }) => {
    mockCaldavServer(page, CREDENTIALS["caldav-url"], [DUNE, PADDINGTON]);
    await connect(page, "test-omdb-key", true);

    await expect(page.getByRole("button", { name: "Refresh metadata" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Refresh all metadata" })).toHaveCount(0);
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

  // #91: re-checks the calendar entry itself first — it may have been
  // matched elsewhere (the CLI's own sync, another tab/device) since
  // this list was loaded, and only what's still actually missing from
  // it should ever reach OMDb.
  test("re-checks the calendar entry first, skipping OMDb if it's already matched elsewhere", async ({
    page,
  }) => {
    const server = mockCaldavServer(page, CREDENTIALS["caldav-url"], [DUNE]);
    await connect(page, "test-omdb-key");

    let omdbCalls = 0;
    await page.route("https://www.omdbapi.com/**", async (route: Route) => {
      omdbCalls++;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ Response: "False" }),
      });
    });
    // Overrides mockCaldavServer's own GET for just this resource —
    // simulating the entry having been matched elsewhere since the
    // overview's list loaded.
    await page.route(`${CREDENTIALS["caldav-url"]}dune-uid.ics`, async (route: Route) => {
      if (route.request().method() !== "GET") return route.fallback();
      await route.fulfill({
        status: 200,
        contentType: "text/calendar",
        body: serializeViewingToVEvent("dune-uid", { ...DUNE, imdbId: "tt1160419" }),
      });
    });

    await page.getByRole("button", { name: "Refresh metadata" }).click();

    await expect(page.getByRole("status").last()).toHaveText("Already up to date.");
    expect(omdbCalls).toBe(0);
    expect(server.updates).toHaveLength(0);
  });

  // #113: imdbId alone used to be read as "already matched" — but a
  // CLI-logged entry gets imdbId for free by parsing its own
  // DESCRIPTION text, with no OMDb call involved, so it should never
  // have blocked Refresh from actually reaching OMDb.
  test("still calls OMDb for a CLI-logged entry that only has an IMDb link, and fills in its poster", async ({
    page,
  }) => {
    const server = mockCaldavServer(page, CREDENTIALS["caldav-url"], [CLI_LOGGED_NO_POSTER]);
    await connect(page, "test-omdb-key");

    let omdbCalls = 0;
    await page.route("https://www.omdbapi.com/**", async (route: Route) => {
      omdbCalls++;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          Response: "True",
          Director: "Denis Villeneuve",
          Poster: "https://example.com/dune-poster.jpg",
          imdbID: "tt1160419",
          Ratings: [{ Source: "Internet Movie Database", Value: "8.0/10" }],
        }),
      });
    });

    await page.getByRole("button", { name: "Refresh metadata" }).click();

    await expect(page.getByRole("status").last()).toHaveText("Refreshed.");
    expect(omdbCalls).toBeGreaterThan(0);
    expect(server.updates).toHaveLength(1);
    expect(server.updates[0]?.posterUrl).toBe("https://example.com/dune-poster.jpg");
  });

  test("bulk refresh includes a CLI-logged entry that only has an IMDb link, not just titles with none", async ({
    page,
  }) => {
    const alreadyFullyMatched = { ...DUNE, imdbId: "tt1160419" };
    const server = mockCaldavServer(page, CREDENTIALS["caldav-url"], [
      alreadyFullyMatched,
      CLI_LOGGED_NO_POSTER,
    ]);
    await connect(page, "test-omdb-key");

    await page.route("https://www.omdbapi.com/**", async (route: Route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          Response: "True",
          Poster: "https://example.com/dune-poster.jpg",
          imdbID: "tt1160419",
          Ratings: [],
        }),
      });
    });

    await page.getByRole("button", { name: "Refresh all metadata" }).click();

    await expect(page.getByRole("status").last()).toHaveText("Refreshed 1 of 1.");
    expect(server.updates).toHaveLength(1);
    expect(server.updates[0]?.uid).toBe("cli-logged-uid");
    expect(server.updates[0]?.posterUrl).toBe("https://example.com/dune-poster.jpg");
  });

  test("writes the OMDb match on top of the freshly-fetched entry, not a stale in-memory copy", async ({
    page,
  }) => {
    const server = mockCaldavServer(page, CREDENTIALS["caldav-url"], [DUNE]);
    await connect(page, "test-omdb-key");

    await page.route("https://www.omdbapi.com/**", async (route: Route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          Response: "True",
          imdbID: "tt1160419",
          Ratings: [],
        }),
      });
    });
    // The calendar's own copy has a venue the initially-loaded list
    // doesn't know about yet (a concurrent edit since the list loaded).
    await page.route(`${CREDENTIALS["caldav-url"]}dune-uid.ics`, async (route: Route) => {
      if (route.request().method() !== "GET") return route.fallback();
      await route.fulfill({
        status: 200,
        contentType: "text/calendar",
        body: serializeViewingToVEvent("dune-uid", { ...DUNE, venue: "Updated Elsewhere" }),
      });
    });

    await page.getByRole("button", { name: "Refresh metadata" }).click();

    await expect(page.getByRole("status").last()).toHaveText("Refreshed.");
    expect(server.updates).toHaveLength(1);
    expect(server.updates[0]?.venue).toBe("Updated Elsewhere");
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

  // #89: the calendar entry is the source of truth once it's been
  // matched (has an imdbId) — a bulk refresh shouldn't spend OMDb quota
  // re-fetching it. The single per-row Refresh control is unaffected
  // (still always offered) — that's the deliberate, spec'd way to
  // correct one title's stale match.
  test("refresh all skips titles that already have matched metadata", async ({ page }) => {
    const already = { ...DUNE, imdbId: "tt1160419" };
    const server = mockCaldavServer(page, CREDENTIALS["caldav-url"], [already, PADDINGTON]);
    await connect(page, "test-omdb-key");

    let omdbCalls = 0;
    page.route("https://www.omdbapi.com/**", async (route: Route) => {
      omdbCalls++;
      const title = new URL(route.request().url()).searchParams.get("t");
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          Response: "True",
          Director: `${title} director`,
          imdbID: "tt0000000",
          Ratings: [],
        }),
      });
    });

    await page.getByRole("button", { name: "Refresh all metadata" }).click();

    await expect(page.getByRole("status").last()).toHaveText("Refreshed 1 of 1.");
    expect(omdbCalls).toBe(1);
    expect(server.updates).toHaveLength(1);
    expect(server.updates[0]?.title).toBe("Paddington");
  });

  test("no Refresh all control appears when every title on the page already has matched metadata", async ({
    page,
  }) => {
    const already = { ...DUNE, imdbId: "tt1160419" };
    mockCaldavServer(page, CREDENTIALS["caldav-url"], [already]);
    await connect(page, "test-omdb-key");

    // Waits for the async post-connect render to actually settle before
    // asserting an absence — otherwise "not rendered yet" and "correctly
    // hidden" look identical and the assertion below passes for the
    // wrong reason.
    await expect(page.getByRole("button", { name: "Refresh metadata" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Refresh all metadata" })).toHaveCount(0);
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

  // #97
  test.describe("busy state while a refresh is in flight", () => {
    test("the per-row refresh button is disabled and marks its row busy until the request resolves", async ({
      page,
    }) => {
      mockCaldavServer(page, CREDENTIALS["caldav-url"], [DUNE]);
      await connect(page, "test-omdb-key");

      await page.route("https://www.omdbapi.com/**", async (route: Route) => {
        // Artificial delay — long enough that a mid-flight assertion is
        // reliably still mid-flight, not a race against an instant response.
        await new Promise((resolve) => setTimeout(resolve, 300));
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ Response: "True", imdbID: "tt1160419", Ratings: [] }),
        });
      });

      const button = page.getByRole("button", { name: "Refresh metadata" });
      const row = page.locator("tbody tr");
      await expect(row).not.toHaveAttribute("aria-busy", "true");

      await button.click();

      await expect(button).toBeDisabled();
      await expect(row).toHaveAttribute("aria-busy", "true");

      await expect(page.getByRole("status").last()).toHaveText("Refreshed.");
      await expect(row).not.toHaveAttribute("aria-busy", "true");
    });

    test("the bulk refresh button is disabled and busy until the whole batch resolves", async ({
      page,
    }) => {
      mockCaldavServer(page, CREDENTIALS["caldav-url"], [DUNE, PADDINGTON]);
      await connect(page, "test-omdb-key");

      await page.route("https://www.omdbapi.com/**", async (route: Route) => {
        await new Promise((resolve) => setTimeout(resolve, 200));
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            Response: "True",
            Director: "Some Director",
            imdbID: "tt0000000",
            Ratings: [],
          }),
        });
      });

      const button = page.getByRole("button", { name: "Refresh all metadata" });
      await button.click();

      await expect(button).toBeDisabled();
      await expect(button).toHaveAttribute("aria-busy", "true");

      await expect(page.getByRole("status").last()).toHaveText("Refreshed 2 of 2.");
      await expect(button).toHaveCount(0); // both titles now matched — control hides itself (#89)
    });
  });
});
