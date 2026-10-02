import { expect, type Page, test } from "@playwright/test";
import { mockCaldavServer } from "./support/mock-caldav";

// #679: each Viewings row was about 177px tall because of a 96x160px poster, so
// seven viewings took nearly two screens at 1280px. The poster is 56x84px on
// desktop now (between #64's 96x160, which found 64px too small to recognise a
// poster by, and the 40x60 of the Stitch mock). Mobile keeps its own sizes (#680).

const CREDENTIALS = {
  "caldav-url": "https://caldav.example.com/calendars/me/movies/",
  "caldav-username": "me",
  "caldav-password": "secret",
};

// A 1x1 PNG: the poster's own pixels don't matter, its box does.
const POSTER =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

// Fixed, whole-minute timestamps (#698): like real viewings, and the same on
// every run.
const viewing = (uid: string, title: string, day: number, withPoster: boolean) => ({
  uid,
  title,
  start: `2026-09-${String(day).padStart(2, "0")}T17:30:00Z`,
  end: `2026-09-${String(day).padStart(2, "0")}T19:45:00Z`,
  medium: "cinema",
  venue: "Grand Vista Cinema",
  year: "2024",
  ...(withPoster ? { posterUrl: POSTER } : {}),
});

const VIEWINGS = [
  viewing("v1", "Dune: Part Two", 29, true),
  viewing("v2", "Anora", 26, true),
  viewing("v3", "The Brutalist", 23, true),
  viewing("v4", "Paddington in Peru", 20, false), // no poster: the placeholder
  viewing("v5", "Challengers", 17, true),
  viewing("v6", "Nosferatu", 14, true),
  viewing("v7", "Perfect Days", 11, true),
];

test.use({ timezoneId: "UTC", viewport: { width: 1280, height: 900 } });

async function openViewings(page: Page) {
  mockCaldavServer(page, CREDENTIALS["caldav-url"], VIEWINGS);
  await page.goto("/");
  await page.locator("#caldav-url").fill(CREDENTIALS["caldav-url"]);
  await page.locator("#caldav-username").fill(CREDENTIALS["caldav-username"]);
  await page.locator("#caldav-password").fill(CREDENTIALS["caldav-password"]);
  await page.getByRole("button", { name: "Connect" }).click();
  await expect(page.locator("tbody tr")).toHaveCount(VIEWINGS.length);
}

test.describe("compact Viewings rows at 1280px", () => {
  test("every row is at most 112px tall and five of seven fit one 900px screen", async ({
    page,
  }) => {
    await openViewings(page);

    const rows = await page.locator("tbody tr").evaluateAll((trs) =>
      trs.map((tr) => {
        const r = tr.getBoundingClientRect();
        return { top: Math.round(r.top + window.scrollY), height: Math.round(r.height) };
      }),
    );

    for (const [i, row] of rows.entries()) {
      expect(row.height, `row ${i + 1} height`).toBeLessThanOrEqual(112);
    }
    // The first row starts about 386px down the page (header, nav, intro and
    // filters), so rows of ~101px put five fully inside 900px; at the old
    // 177px only two fit.
    const fullyVisible = rows.filter((row) => row.top + row.height <= 900).length;
    expect(fullyVisible, "rows fully inside the first 900px").toBeGreaterThanOrEqual(5);
  });

  test("a viewing with no poster gets a placeholder the same size as a real poster", async ({
    page,
  }) => {
    await openViewings(page);

    const size = (el: Element) => {
      const r = el.getBoundingClientRect();
      return { w: Math.round(r.width), h: Math.round(r.height) };
    };
    const poster = await page.locator("tbody tr").nth(0).locator("img").first().evaluate(size);
    const placeholder = await page
      .locator("tbody tr")
      .nth(3)
      .locator("td")
      .first()
      .locator("svg")
      .first()
      .evaluate((svg) => {
        // The placeholder's own box: the root element wrapping its icon.
        const r = (svg.parentElement as HTMLElement).getBoundingClientRect();
        return { w: Math.round(r.width), h: Math.round(r.height) };
      });

    expect(poster).toEqual({ w: 56, h: 84 });
    expect(placeholder).toEqual(poster);
  });

  test("the time-of-day bar says what it shows", async ({ page }) => {
    await openViewings(page);

    const bar = page.locator("tbody tr").first().locator("[title*='time of day' i]");
    await expect(bar).toHaveCount(1);
  });
});
