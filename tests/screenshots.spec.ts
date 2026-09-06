import { expect, type Page, test } from "@playwright/test";
import { mockCaldavServer } from "./support/mock-caldav";

// #195: generates the light/dark screenshots shown in the README. Tiny
// solid-colour gradient PNGs stand in for real poster art — using an
// actual movie poster here would raise its own licensing question for a
// screenshot checked into a public repo, and a data URI keeps this test
// hermetic (no network fetch for an image that could fail or change).
const POSTER_DUNE =
  "data:image/png;base64,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";
const POSTER_PADDINGTON =
  "data:image/png;base64,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";

const CREDENTIALS = {
  "caldav-url": "https://caldav.example.com/calendars/me/movies/",
  "caldav-username": "me",
  "caldav-password": "secret",
};

function daysAgo(n: number): Date {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000);
}

const DUNE = {
  uid: "dune-uid",
  title: "Dune: Part Two",
  start: daysAgo(3).toISOString(),
  end: new Date(daysAgo(3).getTime() + 2.5 * 60 * 60 * 1000).toISOString(),
  medium: "cinema",
  venue: "Grand Vista Cinema",
  director: "Denis Villeneuve",
  actors: "Timothée Chalamet, Zendaya",
  ratingImdb: "8.5",
  ratingRottenTomatoes: "92%",
  genre: "Action, Adventure, Drama",
  year: "2024",
  posterUrl: POSTER_DUNE,
  imdbId: "tt15239678",
};

const PADDINGTON = {
  uid: "paddington-uid",
  title: "Paddington in Peru",
  start: daysAgo(20).toISOString(),
  end: new Date(daysAgo(20).getTime() + 1.5 * 60 * 60 * 1000).toISOString(),
  medium: "netflix",
  director: "Dougal Wilson",
  actors: "Ben Whishaw, Hugh Bonneville",
  ratingImdb: "6.7",
  genre: "Adventure, Comedy, Family",
  year: "2024",
  posterUrl: POSTER_PADDINGTON,
  imdbId: "tt4979562",
};

async function connect(page: Page) {
  await page.goto("/");
  await page.locator("#caldav-url").fill(CREDENTIALS["caldav-url"]);
  await page.locator("#caldav-username").fill(CREDENTIALS["caldav-username"]);
  await page.locator("#caldav-password").fill(CREDENTIALS["caldav-password"]);
  await page.getByRole("button", { name: "Connect" }).click();
  await expect(page.getByRole("link", { name: "Log a viewing" })).toBeVisible();
}

test.describe("README screenshots", () => {
  for (const mode of ["light", "dark"] as const) {
    test(`captures the overview in ${mode} mode`, async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 960 });
      await page.emulateMedia({ colorScheme: mode });
      mockCaldavServer(page, CREDENTIALS["caldav-url"], [DUNE, PADDINGTON]);
      await connect(page);

      await expect(page.locator("tbody tr")).toHaveCount(2);
      await expect(page.locator("tbody tr").first()).toContainText("Dune: Part Two");
      // Real poster images load asynchronously — wait for them so the
      // screenshot doesn't catch a half-loaded row.
      await expect(page.locator("tbody img").first()).toBeVisible();

      // The element itself, not a full-page screenshot — crops tightly to
      // the actual content instead of carrying trailing page whitespace
      // below the last row.
      await page.locator("#page-container").screenshot({
        path: `docs/screenshots/overview-${mode}.png`,
      });
    });
  }

  // #269: the very first thing a brand-new visitor sees — used on
  // /docs/connecting/ (the live docs site, not the README) so "what
  // does this look like" doesn't require actually opening the app
  // first. Written straight to public/ (not docs/screenshots/, which
  // is README-only and GitHub-rendered) since this is the one Astro
  // itself needs to serve. Both modes, same reasoning as the overview
  // screenshots above — a visitor in dark mode shouldn't see a jarring
  // light-mode screenshot embedded in the docs.
  for (const mode of ["light", "dark"] as const) {
    test(`captures the first-load connect form in ${mode} mode`, async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 960 });
      await page.emulateMedia({ colorScheme: mode });
      await page.goto("/");

      await expect(page.locator("#caldav-url")).toBeVisible();

      await page.locator("#page-container").screenshot({
        path: `public/screenshots/connect-form-${mode}.png`,
      });
    });
  }
});
