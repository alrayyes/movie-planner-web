import { expect, type Page, test } from "@playwright/test";
import { mockCaldavServer } from "./support/mock-caldav";

const CREDENTIALS = {
  "caldav-url": "https://caldav.example.com/calendars/me/movies/",
  "caldav-username": "me",
  "caldav-password": "secret",
};

const VIEWPORTS = [
  { name: "narrow-mobile", width: 320, height: 700 },
  { name: "mobile", width: 375, height: 812 },
  { name: "desktop", width: 1280, height: 800 },
];

async function assertNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => {
    return document.documentElement.scrollWidth - document.documentElement.clientWidth;
  });
  expect(overflow).toBeLessThanOrEqual(1);
}

// iOS Safari auto-zooms the whole page when a visitor focuses any input
// styled under 16px, and the resulting zoomed viewport is then pannable —
// reading as "the page scrolls horizontally" with no actual layout
// overflow (neither Chromium nor Firefox reproduce that zoom behaviour,
// so this is the regression guard for it: assert the cause, not the
// browser-specific symptom).
async function assertInputFontSizeAtLeast16px(page: Page) {
  const tooSmall = await page.evaluate(() => {
    const small: string[] = [];
    for (const el of document.querySelectorAll("input, textarea")) {
      const size = Number.parseFloat(getComputedStyle(el).fontSize);
      if (size < 16) small.push(`${(el as HTMLInputElement).id || el.tagName} (${size}px)`);
    }
    return small;
  });
  expect(tooSmall).toEqual([]);
}

// Relative to `now`, not a fixed calendar date — the mock CalDAV server
// filters by the requested time-range like a real one would, and
// calendar-overview's default range is only the last 3 months.
const ONE_MONTH_AGO = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

async function connect(page: Page) {
  mockCaldavServer(page, CREDENTIALS["caldav-url"], [
    {
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
      ratingMetacritic: "74",
    },
  ]);
  await page.goto("/");
  await page.locator("#caldav-url").fill(CREDENTIALS["caldav-url"]);
  await page.locator("#caldav-username").fill(CREDENTIALS["caldav-username"]);
  await page.locator("#caldav-password").fill(CREDENTIALS["caldav-password"]);
  await page.getByRole("button", { name: "Connect" }).click();
  await expect(page.getByRole("link", { name: "Settings" })).toBeVisible();
}

for (const viewport of VIEWPORTS) {
  test.describe(`${viewport.name} layout`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } });

    test("credentials form has no horizontal overflow", async ({ page }) => {
      await page.goto("/");
      await assertNoHorizontalOverflow(page);
      await assertInputFontSizeAtLeast16px(page);
    });

    test("calendar overview (with a full-metadata row) has no horizontal overflow", async ({
      page,
    }) => {
      await connect(page);
      await assertNoHorizontalOverflow(page);
    });

    // #93: editing moved to the details page — the "edit mode" half of
    // the check above now lives here instead.
    test("movie details edit form has no horizontal overflow", async ({ page }) => {
      await connect(page);
      await page.getByRole("link", { name: "Dune" }).click();
      await assertNoHorizontalOverflow(page);

      await page.getByRole("button", { name: "Edit" }).click();
      await assertNoHorizontalOverflow(page);
      await assertInputFontSizeAtLeast16px(page);
    });

    test("log form has no horizontal overflow", async ({ page }) => {
      await connect(page);
      await page.getByRole("link", { name: "Log a viewing" }).click();
      await assertNoHorizontalOverflow(page);
      await assertInputFontSizeAtLeast16px(page);
    });

    test("import page has no horizontal overflow", async ({ page }) => {
      await connect(page);
      await page.getByRole("link", { name: "Import" }).click();
      await assertNoHorizontalOverflow(page);
      await assertInputFontSizeAtLeast16px(page);
    });

    test("settings page has no horizontal overflow", async ({ page }) => {
      await connect(page);
      await page.goto("/settings");
      await assertNoHorizontalOverflow(page);
      await assertInputFontSizeAtLeast16px(page);
    });
  });
}

// Genuinely long, unbroken text (no spaces to wrap at) is what actually
// stresses the layout — the fixtures above never get close to it. This
// is the reproduction from the #35 investigation: the wide table stays
// correctly contained by its own overflow-x-auto wrapper, so the page
// itself never overflows even though the table element far exceeds the
// viewport width.
test("a very long unbroken title/venue doesn't leak overflow to the page", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  mockCaldavServer(page, CREDENTIALS["caldav-url"], [
    {
      uid: "long-uid",
      title: "AVeryLongUnbrokenMovieTitleThatMightNotWrapNicelyOnANarrowScreen",
      start: ONE_MONTH_AGO.toISOString(),
      end: new Date(ONE_MONTH_AGO.getTime() + 2.5 * 60 * 60 * 1000).toISOString(),
      medium: "cinema",
      venue: "AnExtremelyLongCinemaVenueNameThatDoesNotHaveAnySpacesInItAtAll",
      director: "SomeDirectorWithAVeryLongNameIndeed",
      actors: "ActorOneWithALongName, ActorTwoWithAnotherVeryLongNameThatKeepsGoing",
    },
  ]);
  await page.goto("/");
  await page.locator("#caldav-url").fill(CREDENTIALS["caldav-url"]);
  await page.locator("#caldav-username").fill(CREDENTIALS["caldav-username"]);
  await page.locator("#caldav-password").fill(CREDENTIALS["caldav-password"]);
  await page.getByRole("button", { name: "Connect" }).click();
  await expect(page.locator("tbody tr")).toHaveCount(1);

  await assertNoHorizontalOverflow(page);
});
