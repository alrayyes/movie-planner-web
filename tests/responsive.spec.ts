import { expect, type Page, type Route, test } from "@playwright/test";
import { mockCaldavServer } from "./support/mock-caldav";

async function mockYoutubeEmbed(page: Page) {
  await page.route("https://www.youtube-nocookie.com/embed/**", async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: "text/html",
      body: "<!doctype html><title>stub player</title>",
    });
  });
}

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

async function assertNoHorizontalOverflow(page: Page, label = "page") {
  const overflow = await page.evaluate(() => {
    return document.documentElement.scrollWidth - document.documentElement.clientWidth;
  });
  expect(overflow, `${label} overflows sideways`).toBeLessThanOrEqual(1);
}

// #914: a page's layout at three widths is one journey, not three. Load and
// connect once, then resize the same page through each width, instead of paying
// for a sign-in per width.
async function atEachViewport(page: Page, check: (viewport: string) => Promise<void>) {
  for (const viewport of VIEWPORTS) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await check(viewport.name);
  }
}

// iOS Safari auto-zooms the whole page when a visitor focuses any input
// styled under 16px, and the resulting zoomed viewport is then pannable —
// reading as "the page scrolls horizontally" with no actual layout
// overflow (neither Chromium nor Firefox reproduce that zoom behaviour,
// so this is the regression guard for it: assert the cause, not the
// browser-specific symptom).
//
// #640: a plain one-shot evaluate() here flaked under CI's own full-suite
// parallel load — always the same shape, a freshly-mounted input read as
// under 16px only when CPU contention is real — while a from-scratch
// isolated check of the exact same flow found zero small-font elements
// every time. expect.poll gives the same real assertion room to settle
// past a transient contention window instead of reading a single,
// possibly-too-early snapshot; a genuinely too-small input still fails
// once the poll window (Playwright's default 5s) runs out.
async function assertInputFontSizeAtLeast16px(page: Page) {
  await expect
    .poll(() =>
      page.evaluate(() => {
        const small: string[] = [];
        for (const el of document.querySelectorAll("input, textarea")) {
          const size = Number.parseFloat(getComputedStyle(el).fontSize);
          if (size < 16) small.push(`${(el as HTMLInputElement).id || el.tagName} (${size}px)`);
        }
        return small;
      }),
    )
    .toEqual([]);
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
  await expect(page.getByRole("button", { name: "Log a viewing" })).toBeVisible();
  // #756: the header's button shows before the viewings table renders, so a
  // test that measured right after this could find no table, or measure a page
  // without its widest row in it. Waiting for the row is what "connected and
  // showing the overview" means here.
  await expect(page.getByRole("link", { name: "Dune", exact: true })).toBeVisible();
}

test.describe("no horizontal overflow across viewports", () => {
  test("credentials form", async ({ page }) => {
    await page.goto("/");
    await atEachViewport(page, async (viewport) => {
      await assertNoHorizontalOverflow(page, `${viewport} credentials form`);
      await assertInputFontSizeAtLeast16px(page);
    });
  });

  test("calendar overview (with a full-metadata row)", async ({ page }) => {
    await connect(page);
    await atEachViewport(page, (viewport) =>
      assertNoHorizontalOverflow(page, `${viewport} calendar overview`),
    );
  });

  // #93: editing moved to the details page. #403: the read-mode action row
  // (Edit/Export/Refresh metadata/Search OMDb/Delete) is a different code path
  // from the edit form and was once the thing that overflowed a narrow
  // viewport unnoticed, so both modes are checked.
  test("movie details, in view mode and in the edit form", async ({ page }) => {
    await connect(page);
    await page.getByRole("link", { name: "Dune", exact: true }).click();
    await expect(page.getByRole("button", { name: "Delete" })).toBeVisible();
    await atEachViewport(page, (viewport) =>
      assertNoHorizontalOverflow(page, `${viewport} details, view mode`),
    );

    await page.getByRole("button", { name: "Edit" }).click();
    await atEachViewport(page, async (viewport) => {
      await assertNoHorizontalOverflow(page, `${viewport} details, edit form`);
      await assertInputFontSizeAtLeast16px(page);
    });
  });

  // #414: the trailer embed used to sit inside the same squeezed label/value
  // grid column as every other field, so it rendered far narrower than the
  // page's actual available width. Compared against the "Trailer" heading's own
  // width, not the whole page: on a desktop-width viewport the poster column
  // sits beside this content column.
  test("the trailer embed uses most of the available content width", async ({ page }) => {
    await mockYoutubeEmbed(page);
    mockCaldavServer(page, CREDENTIALS["caldav-url"], [
      {
        uid: "dune-uid",
        title: "Dune",
        start: ONE_MONTH_AGO.toISOString(),
        end: new Date(ONE_MONTH_AGO.getTime() + 2.5 * 60 * 60 * 1000).toISOString(),
        medium: "cinema",
        trailerUrl: "https://www.youtube.com/watch?v=8g18jFHCLXk",
      },
    ]);
    await page.goto("/");
    await page.locator("#caldav-url").fill(CREDENTIALS["caldav-url"]);
    await page.locator("#caldav-username").fill(CREDENTIALS["caldav-username"]);
    await page.locator("#caldav-password").fill(CREDENTIALS["caldav-password"]);
    await page.getByRole("button", { name: "Connect" }).click();
    await expect(page.getByRole("button", { name: "Log a viewing" })).toBeVisible();
    await page.getByRole("link", { name: "Dune", exact: true }).click();

    await atEachViewport(page, async (viewport) => {
      const iframeBox = await page.locator("iframe").boundingBox();
      const headingBox = await page.getByRole("heading", { name: "Trailer" }).boundingBox();
      expect(iframeBox, `${viewport} embed`).not.toBeNull();
      expect(headingBox, `${viewport} heading`).not.toBeNull();
      expect(
        (iframeBox?.width ?? 0) / (headingBox?.width ?? 1),
        `${viewport} embed width against its column`,
      ).toBeGreaterThan(0.95);
      await assertNoHorizontalOverflow(page, `${viewport} trailer`);
    });
  });

  // #436: Import is reached from Settings, so a direct navigation stands in for
  // that click. #198/#204/#536: a year's worth of week columns is far wider
  // than any phone viewport, so the heatmap's wrapper has to scroll instead of
  // the page.
  test("the log, import, settings and calendar pages", async ({ page }) => {
    await connect(page);
    for (const path of ["/log", "/import", "/settings", "/calendar"]) {
      await page.goto(path);
      await atEachViewport(page, async (viewport) => {
        await assertNoHorizontalOverflow(page, `${viewport} ${path}`);
        if (path !== "/calendar") await assertInputFontSizeAtLeast16px(page);
      });
    }
  });
});

// #217: an ordinary row (nothing pathological — a title/venue/director of
// real-world length) still forced the table's own overflow-x-auto wrapper
// to scroll at a real phone width, which is undesirable even though the
// page itself never overflowed (that's what assertNoHorizontalOverflow
// above already covers). This asserts the table's own footprint fits its
// wrapper too, distinct from — and stricter than — the page-level check.
test("an ordinary row doesn't force the table's own inner scrollbar at phone width", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await connect(page);
  const overflow = await page.evaluate(() => {
    const wrapper = document.querySelector("table")?.parentElement;
    if (!wrapper) throw new Error("no table wrapper found");
    return wrapper.scrollWidth - wrapper.clientWidth;
  });
  expect(overflow).toBeLessThanOrEqual(1);
});

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
