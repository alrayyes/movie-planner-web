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
  synopsis:
    "A noble family becomes embroiled in a war for control over the galaxy's most valuable asset.",
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

// #262: a real, live tile provider now — OSM's own usage policy asks
// for no automated bulk requests, and hitting the real internet from
// every test run would make this suite flaky/offline-hostile for no
// benefit. A minimal transparent 1x1 PNG stands in for a real tile.
const BLANK_TILE_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
  "base64",
);

async function mockTiles(page: Page) {
  await page.route("https://*.tile.openstreetmap.org/**", async (route: Route) => {
    await route.fulfill({ status: 200, contentType: "image/png", body: BLANK_TILE_PNG });
  });
}

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

    // #133: not just "Dune" — that now also matches the poster
    // thumbnail's own link right next to it.
    await page.getByRole("link", { name: "Dune (2021)" }).click();
    // Astro's static build serves this as a directory (`movie/index.html`),
    // and the static server 30x-redirects the extensionless request to add
    // the trailing slash — hence the optional `/` here.
    await expect(page).toHaveURL(/\/movie\/?\?uid=dune-uid/);

    await expect(page.getByRole("heading", { name: "Dune (2021)" })).toBeVisible();
    await expect(page.getByText("Grand Vista Cinema")).toBeVisible();
    // #163/#183: director/actors/genre are individually clickable chips
    // now, not one joined string — see the dedicated describe block
    // below for the filtering behaviour those chips link to.
    await expect(page.getByRole("link", { name: "Denis Villeneuve" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Timothée Chalamet" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Zendaya" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Action", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Adventure" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Drama" })).toBeVisible();
    await expect(page.getByText("IMDb 8.0")).toBeVisible();
    await expect(page.getByText(DUNE.synopsis)).toBeVisible();
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

  // #223: a visitor who edits a viewing elsewhere (another tab, say),
  // then returns here via the browser's Back button, can land on the
  // exact pre-edit DOM the browser restored from its back/forward cache
  // rather than a fresh load. See the calendar overview's own test of
  // the same gap for why a synthetic pageshow is used instead of a real
  // navigation.
  test("a bfcache restore refreshes data that changed while this page was cached", async ({
    page,
  }) => {
    const server = mockCaldavServer(page, CREDENTIALS["caldav-url"], [DUNE]);
    await connect(page);
    await page.goto("/movie?uid=dune-uid");
    await expect(page.getByRole("heading", { name: "Dune (2021)" })).toBeVisible();

    server.viewings.set(DUNE.uid, { ...DUNE, title: "Dune: Part Two" });
    await page.evaluate(() => {
      window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true }));
    });

    await expect(page.getByRole("heading", { name: "Dune: Part Two (2021)" })).toBeVisible();
  });

  test("no notes field shows at all when the viewing has none", async ({ page }) => {
    mockCaldavServer(page, CREDENTIALS["caldav-url"], [DUNE_UNMATCHED]);
    await connect(page);
    await page.getByRole("link", { name: "Dune", exact: true }).click();

    await expect(page.getByRole("heading", { name: /Dune/ })).toBeVisible();
    await expect(page.getByText("Notes", { exact: true })).toHaveCount(0);
  });

  test("no synopsis field shows at all when the viewing has none", async ({ page }) => {
    mockCaldavServer(page, CREDENTIALS["caldav-url"], [DUNE_UNMATCHED]);
    await connect(page);
    await page.getByRole("link", { name: "Dune", exact: true }).click();

    await expect(page.getByRole("heading", { name: /Dune/ })).toBeVisible();
    await expect(page.getByText("Synopsis", { exact: true })).toHaveCount(0);
  });

  // #236
  test("shows a placeholder graphic instead of a gap when the viewing has no poster", async ({
    page,
  }) => {
    mockCaldavServer(page, CREDENTIALS["caldav-url"], [DUNE_UNMATCHED]);
    await connect(page);
    await page.getByRole("link", { name: "Dune", exact: true }).click();

    await expect(page.getByRole("heading", { name: /Dune/ })).toBeVisible();
    await expect(page.getByRole("img", { name: "No poster available" })).toBeVisible();
    await expect(page.locator("img[src]")).toHaveCount(0);
  });

  test("edit and delete are reachable from the details page", async ({ page }) => {
    const server = mockCaldavServer(page, CREDENTIALS["caldav-url"], [DUNE]);
    await connect(page);
    await page.getByRole("link", { name: "Dune (2021)" }).click();

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

  // #8/#203
  test("offers an address-search lookup when editing to a venue with no known coordinates", async ({
    page,
  }) => {
    await mockTiles(page);
    const server = mockCaldavServer(page, CREDENTIALS["caldav-url"], [DUNE]);
    await connect(page);
    await page.route("https://nominatim.openstreetmap.org/**", async (route: Route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([
          {
            display_name: "Tuschinski, Amsterdam, Netherlands",
            lat: "52.3665062",
            lon: "4.8947073",
          },
        ]),
      });
    });
    await page.getByRole("link", { name: "Dune (2021)" }).click();

    await page.getByRole("button", { name: "Edit" }).click();
    await page.locator("#details-venue").fill("Tuschinski");
    await page.locator("#details-geo-search").fill("Tuschinski");
    const candidate = page.getByRole("button", { name: "Tuschinski, Amsterdam, Netherlands" });
    await expect(candidate).toBeVisible();

    const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
    expect(results.violations).toEqual([]);

    await candidate.click();
    await expect(page.getByText("Location set: Tuschinski, Amsterdam, Netherlands")).toBeVisible();

    await page.getByRole("button", { name: "Save" }).click();

    await expect(page.getByRole("status")).toHaveText("Saved.");
    expect(server.updates[0]?.geo).toEqual({ lat: 52.3665062, lon: 4.8947073 });
  });

  test("attaches a venue's known coordinates automatically when editing, without showing a search field", async ({
    page,
  }) => {
    await mockTiles(page);
    const server = mockCaldavServer(page, CREDENTIALS["caldav-url"], [
      DUNE,
      {
        uid: "paddington-uid",
        title: "Paddington",
        start: "2025-12-01T18:00:00.000Z",
        end: "2025-12-01T19:40:00.000Z",
        medium: "cinema",
        venue: "Tuschinski",
        geo: { lat: 52.3665062, lon: 4.8947073 },
      },
    ]);
    await connect(page);
    await page.getByRole("link", { name: "Dune (2021)" }).click();

    await page.getByRole("button", { name: "Edit" }).click();
    await page.locator("#details-venue").fill("Tuschinski");

    await expect(page.getByText("Using Tuschinski's known location.")).toBeVisible();
    await expect(page.locator("#details-geo-search")).toHaveCount(0);

    await page.getByRole("button", { name: "Save" }).click();

    await expect(page.getByRole("status")).toHaveText("Saved.");
    expect(server.updates[0]?.geo).toEqual({ lat: 52.3665062, lon: 4.8947073 });
  });

  // #8/#203
  test("shows a per-venue map with an Open in Maps link when the viewing has known coordinates", async ({
    page,
  }) => {
    await mockTiles(page);
    mockCaldavServer(page, CREDENTIALS["caldav-url"], [
      { ...DUNE, geo: { lat: 52.3665062, lon: 4.8947073 } },
    ]);
    await connect(page);
    await page.getByRole("link", { name: "Dune (2021)" }).click();

    await expect(page.getByRole("region", { name: "Map showing 1 location" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Open in Maps" })).toHaveAttribute(
      "href",
      "https://www.openstreetmap.org/?mlat=52.3665062&mlon=4.8947073#map=18/52.3665062/4.8947073",
    );

    const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
    expect(results.violations).toEqual([]);
  });

  test("shows no map or Open in Maps link when the viewing has no known coordinates", async ({
    page,
  }) => {
    mockCaldavServer(page, CREDENTIALS["caldav-url"], [DUNE]);
    await connect(page);
    await page.getByRole("link", { name: "Dune (2021)" }).click();

    await expect(page.getByRole("heading", { name: /Dune/ })).toBeVisible();
    await expect(page.getByRole("region", { name: /Map/ })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Open in Maps" })).toHaveCount(0);
  });

  // #262: reversed from the original "no live network call" design —
  // confirmed with the user directly after a real device screenshot
  // showed the old bundled abstract outline reading as unrecognizable
  // and useless. Real tiles now, correctly attributed per OSM's usage
  // policy.
  test("the per-venue map loads real map tiles, correctly attributed", async ({ page }) => {
    const tileRequest = page.waitForRequest((request) =>
      request.url().includes("tile.openstreetmap.org"),
    );
    await mockTiles(page);
    mockCaldavServer(page, CREDENTIALS["caldav-url"], [
      { ...DUNE, geo: { lat: 52.3665062, lon: 4.8947073 } },
    ]);
    await connect(page);
    await page.getByRole("link", { name: "Dune (2021)" }).click();
    await expect(page.getByRole("region", { name: "Map showing 1 location" })).toBeVisible();

    await tileRequest;
    await expect(page.getByRole("link", { name: "OpenStreetMap" })).toHaveAttribute(
      "href",
      "https://www.openstreetmap.org/copyright",
    );
  });

  test("offers a disambiguation picker when refreshing finds no confident match", async ({
    page,
  }) => {
    const server = mockCaldavServer(page, CREDENTIALS["caldav-url"], [DUNE_UNMATCHED]);
    await connect(page, "test-omdb-key");
    await page.getByRole("link", { name: "Dune", exact: true }).click();

    // #249: unlike every other page.route() call in this file, this one
    // wasn't awaited — registration is async (a real CDP round trip), so
    // without awaiting it the very next line's click could fire
    // handleRefresh's fetch() before the mock was actually installed,
    // sending it to the real (unreachable, in this sandbox) network
    // instead. Confirmed real (dropped the flake rate sharply under
    // repeated stress runs) but not the whole story — #249 stays open
    // for the rest.
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

  // #153: a constructed search link (the only kind ever offered for RT,
  // and the fallback for Letterboxd without a real URL) looks identical
  // to a confirmed match unless it says otherwise — a visitor has no way
  // to tell "this is definitely the right title" from "this is a guess".
  test("flags IMDb and Letterboxd as not linked when the viewing has no real match for either", async ({
    page,
  }) => {
    mockCaldavServer(page, CREDENTIALS["caldav-url"], [DUNE_UNMATCHED]);
    await connect(page);
    await page.getByRole("link", { name: "Dune", exact: true }).click();

    await expect(page.getByRole("link", { name: "IMDb" })).toHaveCount(0);
    await expect(page.getByText("IMDb not linked")).toBeVisible();
    await expect(page.getByRole("link", { name: "Letterboxd (search)" })).toHaveAttribute(
      "href",
      "https://letterboxd.com/search/Dune/",
    );
  });

  test("shows a plain IMDb/Letterboxd link once each has a real match, no gap indicator", async ({
    page,
  }) => {
    mockCaldavServer(page, CREDENTIALS["caldav-url"], [
      { ...DUNE, letterboxdUrl: "https://letterboxd.com/film/dune-2021/" },
    ]);
    await connect(page);
    await page.getByRole("link", { name: "Dune (2021)" }).click();

    await expect(page.getByRole("link", { name: "IMDb", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Letterboxd", exact: true })).toHaveAttribute(
      "href",
      "https://letterboxd.com/film/dune-2021/",
    );
    await expect(page.getByText("not linked")).toHaveCount(0);
  });

  // #193: brand marks stand in for the visible label on a real link, but
  // the unlinked gap indicator (#153) has nothing to link to and keeps
  // showing as plain text rather than a logo with no link.
  test("shows IMDb/RT/Letterboxd cross-links as brand icons, keeping the not-linked gap indicator as plain text", async ({
    page,
  }) => {
    mockCaldavServer(page, CREDENTIALS["caldav-url"], [{ ...DUNE, imdbId: undefined }]);
    await connect(page);
    await page.getByRole("link", { name: "Dune (2021)" }).click();

    const rtLink = page.getByRole("link", { name: "RT" });
    await expect(rtLink.locator("svg")).toBeVisible();
    await expect(rtLink.locator("span.sr-only")).toHaveText("RT");

    const gapIndicator = page.getByText("IMDb not linked");
    await expect(gapIndicator).toBeVisible();
    await expect(gapIndicator.locator("svg")).toHaveCount(0);
  });

  // #163
  test("shows each rating source as its own badge, and each actor/genre as its own clickable chip", async ({
    page,
  }) => {
    mockCaldavServer(page, CREDENTIALS["caldav-url"], [DUNE]);
    await connect(page);
    await page.getByRole("link", { name: "Dune (2021)" }).click();

    await expect(page.getByText("IMDb 8.0")).toBeVisible();
    await expect(page.getByText("RT 83%")).toBeVisible();

    await expect(page.getByRole("link", { name: "Denis Villeneuve" })).toHaveAttribute(
      "href",
      "/?director=Denis%20Villeneuve",
    );
    await expect(page.getByRole("link", { name: "Timothée Chalamet" })).toHaveAttribute(
      "href",
      "/?actor=Timoth%C3%A9e%20Chalamet",
    );
    await expect(page.getByRole("link", { name: "Zendaya" })).toHaveAttribute(
      "href",
      "/?actor=Zendaya",
    );
    await expect(page.getByRole("link", { name: "Action", exact: true })).toHaveAttribute(
      "href",
      "/?genre=Action",
    );
  });

  // #199
  test("shows a blocked-time bar below Start/End, purely decorative", async ({ page }) => {
    mockCaldavServer(page, CREDENTIALS["caldav-url"], [DUNE]);
    await connect(page);
    await page.getByRole("link", { name: "Dune (2021)" }).click();
    await expect(page.getByText("Start")).toBeVisible();

    const bar = page.locator('[aria-hidden="true"]').filter({ has: page.locator("div[style]") });
    await expect(bar).toBeVisible();
    // Start/End remain the real, only accessible description — the bar
    // itself carries nothing a screen reader should announce.
    await expect(bar).toHaveAttribute("aria-hidden", "true");

    const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
    expect(results.violations).toEqual([]);
  });

  test("positions and sizes the blocked-time bar from the viewing's own start/duration", async ({
    page,
  }) => {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 19, 0, 0);
    const end = new Date(start.getTime() + 150 * 60 * 1000); // 2.5 hours
    mockCaldavServer(page, CREDENTIALS["caldav-url"], [
      { ...DUNE, start: start.toISOString(), end: end.toISOString() },
    ]);
    await connect(page);
    await page.getByRole("link", { name: "Dune (2021)" }).click();
    await expect(page.getByText("Start")).toBeVisible();

    const fill = page.locator('[aria-hidden="true"] > div[style]');
    const style = await fill.getAttribute("style");
    const left = Number(/left:\s*([\d.]+)%/.exec(style ?? "")?.[1]);
    const width = Number(/width:\s*([\d.]+)%/.exec(style ?? "")?.[1]);
    expect(left).toBeCloseTo((19 * 60 * 100) / (24 * 60), 1);
    expect(width).toBeCloseTo((150 * 100) / (24 * 60), 1);
  });

  test("clips a midnight-crossing viewing's bar at the track's edge", async ({ page }) => {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 30, 0);
    const end = new Date(start.getTime() + 90 * 60 * 1000);
    mockCaldavServer(page, CREDENTIALS["caldav-url"], [
      { ...DUNE, start: start.toISOString(), end: end.toISOString() },
    ]);
    await connect(page);
    await page.getByRole("link", { name: "Dune (2021)" }).click();
    await expect(page.getByText("Start")).toBeVisible();

    const fill = page.locator('[aria-hidden="true"] > div[style]');
    const style = await fill.getAttribute("style");
    const left = Number(/left:\s*([\d.]+)%/.exec(style ?? "")?.[1]);
    const width = Number(/width:\s*([\d.]+)%/.exec(style ?? "")?.[1]);
    expect(left + width).toBeCloseTo(100, 1);
  });

  test("clicking a genre chip filters the overview to viewings with exactly that genre value", async ({
    page,
  }) => {
    mockCaldavServer(page, CREDENTIALS["caldav-url"], [
      DUNE,
      {
        uid: "other-uid",
        title: "Something Else",
        start: ONE_MONTH_AGO.toISOString(),
        end: new Date(ONE_MONTH_AGO.getTime() + 60 * 60 * 1000).toISOString(),
        medium: "cinema",
        // Deliberately NOT "Action" as a split value — a naive
        // substring match against the whole genre string would
        // wrongly match "Action" here too.
        genre: "Live Action Adaptation, Comedy",
      },
    ]);
    await connect(page);
    await page.getByRole("link", { name: "Dune (2021)" }).click();

    await page.getByRole("link", { name: "Action", exact: true }).click();

    await expect(page).toHaveURL(/\/\?genre=Action/);
    await expect(page.locator("tbody tr")).toHaveCount(1);
    await expect(page.locator("tbody tr")).toContainText("Dune");
  });

  // #183
  test("clicking the director chip filters the overview to viewings with exactly that director", async ({
    page,
  }) => {
    mockCaldavServer(page, CREDENTIALS["caldav-url"], [
      DUNE,
      {
        uid: "other-uid",
        title: "Something Else",
        start: ONE_MONTH_AGO.toISOString(),
        end: new Date(ONE_MONTH_AGO.getTime() + 60 * 60 * 1000).toISOString(),
        medium: "cinema",
        director: "Someone Else",
      },
    ]);
    await connect(page);
    await page.getByRole("link", { name: "Dune (2021)" }).click();

    await page.getByRole("link", { name: "Denis Villeneuve" }).click();

    await expect(page).toHaveURL(/\/\?director=Denis/);
    await expect(page.locator("tbody tr")).toHaveCount(1);
    await expect(page.locator("tbody tr")).toContainText("Dune");
  });

  // #303
  test("clicking the venue links to the overview filtered to exactly that venue", async ({
    page,
  }) => {
    mockCaldavServer(page, CREDENTIALS["caldav-url"], [
      DUNE,
      {
        uid: "other-uid",
        title: "Something Else",
        start: ONE_MONTH_AGO.toISOString(),
        end: new Date(ONE_MONTH_AGO.getTime() + 60 * 60 * 1000).toISOString(),
        medium: "cinema",
        venue: "Regal Union Square",
      },
    ]);
    await connect(page);
    await page.getByRole("link", { name: "Dune (2021)" }).click();

    await page.getByRole("link", { name: "Grand Vista Cinema" }).click();

    await expect(page).toHaveURL(/\/\?venue=Grand(\+|%20)Vista(\+|%20)Cinema/);
    await expect(page.locator("#overview-venue")).toHaveValue("Grand Vista Cinema");
    await expect(page.locator("tbody tr")).toHaveCount(1);
    await expect(page.locator("tbody tr")).toContainText("Dune");
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
