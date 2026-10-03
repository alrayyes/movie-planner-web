import { expect, type Page, test } from "@playwright/test";
import type { LoggedViewing } from "../src/lib/caldav/types";
import { mockCaldavServer } from "./support/mock-caldav";

// #700: #679 made the Viewings table's desktop poster 56x84px. These are the
// five other tables that still used the 96x160px size, so the same movie
// looked different depending on the page. Mobile (h-24 w-16) is unchanged.

const CREDENTIALS = {
  "caldav-url": "https://caldav.example.com/calendars/me/movies/",
  "caldav-username": "me",
  "caldav-password": "secret",
};

// A 1x1 PNG: the poster's own pixels don't matter, its box does.
const POSTER =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

const WITH_POSTER = "Has Poster";
const WITHOUT_POSTER = "Lacks Poster";

const base = {
  start: "2026-09-20T17:30:00Z",
  end: "2026-09-20T19:45:00Z",
  medium: "cinema",
  venue: "Grand Vista Cinema",
  imdbId: "tt1000000",
  director: "Some Director",
  actors: "Some Actor",
  genre: "Drama",
  synopsis: "A story.",
};

const VIEWINGS = [
  { ...base, uid: "has-poster", title: WITH_POSTER, posterUrl: POSTER },
  { ...base, uid: "lacks-poster", title: WITHOUT_POSTER },
];

test.use({ timezoneId: "UTC", viewport: { width: 1280, height: 900 } });

async function connect(page: Page, viewings: LoggedViewing[]) {
  mockCaldavServer(page, CREDENTIALS["caldav-url"], viewings);
  await page.goto("/");
  await page.locator("#caldav-url").fill(CREDENTIALS["caldav-url"]);
  await page.locator("#caldav-username").fill(CREDENTIALS["caldav-username"]);
  await page.locator("#caldav-password").fill(CREDENTIALS["caldav-password"]);
  await page.getByRole("button", { name: "Connect" }).click();
  await expect(page.getByRole("button", { name: "Log a viewing" })).toBeVisible();
}

// Runs in the browser, so it can't call a helper defined out here. `up` picks
// the element whose box is measured: the svg's wrapper for a placeholder.
const measure = (el: Element, up: boolean) => {
  const target = up ? (el.parentElement as HTMLElement) : el;
  const r = target.getBoundingClientRect();
  return { w: Math.round(r.width), h: Math.round(r.height) };
};

// The poster in the row for `withPoster`, and the placeholder in the row for
// `withoutPoster`, must both be 56x84px.
async function expectCompactPosters(page: Page, withPoster: string, withoutPoster: string) {
  const posterRow = page.locator("tbody tr", { hasText: withPoster });
  const placeholderRow = page.locator("tbody tr", { hasText: withoutPoster });

  const poster = await posterRow.locator("img").first().evaluate(measure, false);
  const placeholder = await placeholderRow
    .locator("td")
    .first()
    .locator("svg")
    .first()
    // The placeholder's own box: the root element wrapping its icon.
    .evaluate(measure, true);

  expect(poster).toEqual({ w: 56, h: 84 });
  expect(placeholder).toEqual(poster);
}

test.describe("compact posters at 1280px", () => {
  test("the medium page", async ({ page }) => {
    await connect(page, VIEWINGS);
    await page.goto("/medium?medium=cinema");
    await expectCompactPosters(page, WITH_POSTER, WITHOUT_POSTER);
  });

  test("the venue page", async ({ page }) => {
    await connect(page, VIEWINGS);
    await page.goto(`/venue?venue=${encodeURIComponent("Grand Vista Cinema")}`);
    await expectCompactPosters(page, WITH_POSTER, WITHOUT_POSTER);
  });

  test("an attribute detail page", async ({ page }) => {
    await connect(page, VIEWINGS);
    await page.goto("/genre?genre=Drama");
    await expectCompactPosters(page, WITH_POSTER, WITHOUT_POSTER);
  });

  test("the missing-data page", async ({ page }) => {
    // Both need to be listed: one lacks its genre, the other its poster.
    await connect(page, [
      { ...base, uid: "has-poster", title: WITH_POSTER, posterUrl: POSTER, genre: undefined },
      { ...base, uid: "lacks-poster", title: WITHOUT_POSTER },
    ]);
    await page.goto("/missing-data");
    await expectCompactPosters(page, WITH_POSTER, WITHOUT_POSTER);
  });

  test("the shared page", async ({ page, context }) => {
    await connect(page, VIEWINGS);

    async function sharedUrlFor(title: string) {
      await page.goto("/");
      await page.getByRole("link", { name: title }).first().click();
      await page.getByRole("button", { name: "Share" }).click();
      return page.getByRole("textbox", { name: "Shareable link" }).inputValue();
    }
    const withPosterUrl = await sharedUrlFor(WITH_POSTER);
    const withoutPosterUrl = await sharedUrlFor(WITHOUT_POSTER);

    // A fresh context: the shared page never needs credentials or a server.
    const fresh = await context.newPage();
    await fresh.goto(withPosterUrl);
    const poster = await fresh.locator("tbody tr img").first().evaluate(measure, false);
    await fresh.goto(withoutPosterUrl);
    const placeholder = await fresh
      .locator("tbody tr td")
      .first()
      .locator("svg")
      .first()
      .evaluate(measure, true);

    expect(poster).toEqual({ w: 56, h: 84 });
    expect(placeholder).toEqual(poster);
  });
});

// #700: only the desktop size changed.
test.describe("posters at 390px", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  for (const [name, path] of [
    ["medium", "/medium?medium=cinema"],
    ["venue", `/venue?venue=${encodeURIComponent("Grand Vista Cinema")}`],
    ["genre", "/genre?genre=Drama"],
  ] as const) {
    test(`the ${name} page keeps its 64x96px poster`, async ({ page }) => {
      await connect(page, VIEWINGS);
      await page.goto(path);

      const poster = await page
        .locator("tbody tr", { hasText: WITH_POSTER })
        .locator("img")
        .first()
        .evaluate(measure, false);
      expect(poster).toEqual({ w: 64, h: 96 });
    });
  }
});
