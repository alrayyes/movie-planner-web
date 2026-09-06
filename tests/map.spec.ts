import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, type Route, test } from "@playwright/test";
import { mockCaldavServer } from "./support/mock-caldav";

const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

const CREDENTIALS = {
  "caldav-url": "https://caldav.example.com/calendars/me/movies/",
  "caldav-username": "me",
  "caldav-password": "secret",
};

const DUNE = {
  uid: "dune-uid",
  title: "Dune",
  start: "2026-01-01T19:00:00.000Z",
  end: "2026-01-01T21:30:00.000Z",
  medium: "cinema",
  venue: "Tuschinski, Amsterdam, Netherlands",
  year: "2021",
  geo: { lat: 52.3665062, lon: 4.8947073 },
  posterUrl: "https://example.com/dune-poster.jpg",
};

// Same medium, no venue/geo at all — a plain unlocated viewing, not
// worth a Pathé-specific fixture just for this.
const PADDINGTON = {
  uid: "paddington-uid",
  title: "Paddington",
  start: "2026-02-01T18:00:00.000Z",
  end: "2026-02-01T19:40:00.000Z",
  medium: "netflix",
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

async function connect(page: Page) {
  await page.goto("/");
  await page.locator("#caldav-url").fill(CREDENTIALS["caldav-url"]);
  await page.locator("#caldav-username").fill(CREDENTIALS["caldav-username"]);
  await page.locator("#caldav-password").fill(CREDENTIALS["caldav-password"]);
  await page.getByRole("button", { name: "Connect" }).click();
  await expect(page.getByRole("link", { name: "Map" })).toBeVisible();
}

// #8/#203/#262: the real global map — replaces #237's static preview,
// and (per #262) renders real OpenStreetMap tiles rather than the
// original bundled abstract outline.
test.describe("global map", () => {
  test("pins every located viewing and omits unlocated ones, without error", async ({ page }) => {
    await mockTiles(page);
    mockCaldavServer(page, CREDENTIALS["caldav-url"], [DUNE, PADDINGTON]);
    await connect(page);

    await page.goto("/map");

    await expect(page.getByText("1 located viewing of 2 logged.")).toBeVisible();
    await expect(page.getByRole("region", { name: "Map showing 1 location" })).toBeVisible();
  });

  test("no located viewings at all renders an empty map, not an error", async ({ page }) => {
    await mockTiles(page);
    mockCaldavServer(page, CREDENTIALS["caldav-url"], [PADDINGTON]);
    await connect(page);

    await page.goto("/map");

    await expect(page.getByText("No located viewings yet.")).toBeVisible();
    await expect(
      page.getByRole("region", { name: "Map with no locations to show yet" }),
    ).toBeVisible();
  });

  test("a pin's popup links to that viewing's own details page", async ({ page }) => {
    await mockTiles(page);
    mockCaldavServer(page, CREDENTIALS["caldav-url"], [DUNE]);
    await connect(page);
    await page.goto("/map");
    await expect(page.getByRole("region", { name: "Map showing 1 location" })).toBeVisible();

    await page.locator(".leaflet-marker-icon").click();
    const popupLink = page.getByRole("link", { name: "Dune (2021)" });
    await expect(popupLink).toBeVisible();
    await popupLink.click();

    await expect(page).toHaveURL(/\/movie\/?\?uid=dune-uid/);
  });

  test("a pin's popup shows that viewing's poster", async ({ page }) => {
    await mockTiles(page);
    mockCaldavServer(page, CREDENTIALS["caldav-url"], [DUNE]);
    await connect(page);
    await page.goto("/map");
    await expect(page.getByRole("region", { name: "Map showing 1 location" })).toBeVisible();

    await page.locator(".leaflet-marker-icon").click();
    const popup = page.locator(".leaflet-popup-content");
    await expect(popup.locator("img")).toHaveAttribute("src", DUNE.posterUrl);
  });

  test("hovering a pin also opens its popup, closing again once the pointer leaves", async ({
    page,
  }) => {
    await mockTiles(page);
    mockCaldavServer(page, CREDENTIALS["caldav-url"], [DUNE]);
    await connect(page);
    await page.goto("/map");
    await expect(page.getByRole("region", { name: "Map showing 1 location" })).toBeVisible();

    const popupLink = page.getByRole("link", { name: "Dune (2021)" });
    await expect(popupLink).toBeHidden();

    await page.locator(".leaflet-marker-icon").hover();
    await expect(popupLink).toBeVisible();

    await page.mouse.move(0, 0);
    await expect(popupLink).toBeHidden();
  });

  // venue-map spec's "A pin links out to a full, precise external map"
  // requirement covers every pin, not just the per-venue map's single
  // one (#252) — the global map's own multiple pins get theirs inside
  // each one's own popup instead of a page-level link, since there's no
  // single "next to the map" position that would unambiguously belong
  // to one pin among several.
  test("a pin's popup also offers Open in Maps, for real precision", async ({ page }) => {
    await mockTiles(page);
    mockCaldavServer(page, CREDENTIALS["caldav-url"], [DUNE]);
    await connect(page);
    await page.goto("/map");
    await expect(page.getByRole("region", { name: "Map showing 1 location" })).toBeVisible();

    await page.locator(".leaflet-marker-icon").click();
    await expect(page.getByRole("link", { name: "Open in Maps" })).toHaveAttribute(
      "href",
      "https://www.openstreetmap.org/?mlat=52.3665062&mlon=4.8947073#map=18/52.3665062/4.8947073",
    );
  });

  test("reachable from the site nav", async ({ page }) => {
    await mockTiles(page);
    mockCaldavServer(page, CREDENTIALS["caldav-url"], [DUNE]);
    await connect(page);

    await page.getByRole("link", { name: "Map" }).click();
    await expect(page.getByRole("heading", { name: "Map" })).toBeVisible();
  });

  // #262: reversed from the original "no live network call" design —
  // confirmed with the user directly after a real device screenshot
  // showed the old bundled abstract outline reading as unrecognizable
  // and useless. Real tiles now, correctly attributed per OSM's usage
  // policy.
  test("loads real map tiles, correctly attributed", async ({ page }) => {
    const tileRequest = page.waitForRequest((request) =>
      request.url().includes("tile.openstreetmap.org"),
    );
    await mockTiles(page);
    mockCaldavServer(page, CREDENTIALS["caldav-url"], [DUNE]);
    await connect(page);

    await page.goto("/map");
    await expect(page.getByRole("region", { name: "Map showing 1 location" })).toBeVisible();

    await tileRequest;
    await expect(page.getByRole("link", { name: "OpenStreetMap" })).toHaveAttribute(
      "href",
      "https://www.openstreetmap.org/copyright",
    );
  });

  test("introduces no accessibility violations", async ({ page }) => {
    await mockTiles(page);
    mockCaldavServer(page, CREDENTIALS["caldav-url"], [DUNE]);
    await connect(page);

    await page.goto("/map");
    await expect(page.getByRole("region", { name: "Map showing 1 location" })).toBeVisible();

    const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
    expect(results.violations).toEqual([]);
  });
});
