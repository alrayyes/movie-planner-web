import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import { mockCaldavServer } from "./support/mock-caldav";

// #680: at 390px the Viewings table's columns left the date about 77px, so a
// date wrapped over six lines, the delete button sat a couple of pixels past
// the card edge at 32px square, and the header wrapped the site name and the
// Log button. Measured the way a visitor meets it (visible text lines,
// on-screen boxes, tap-target size), not by class names.

const CREDENTIALS = {
  "caldav-url": "https://caldav.example.com/calendars/me/movies/",
  "caldav-username": "me",
  "caldav-password": "secret",
};

const daysAgo = (n: number) => new Date(Date.now() - n * 24 * 60 * 60 * 1000);
const viewing = (uid: string, title: string, ago: number, medium: string, venue?: string) => ({
  uid,
  title,
  start: daysAgo(ago).toISOString(),
  end: new Date(daysAgo(ago).getTime() + 2.5 * 60 * 60 * 1000).toISOString(),
  medium,
  venue,
  year: "2024",
});

const VIEWINGS = [
  viewing("dune", "Dune: Part Two", 3, "cinema", "Grand Vista Cinema"),
  viewing("paddington", "Paddington in Peru", 20, "netflix"),
  viewing("lumen", "The Brutalist", 9, "cinema", "Filmhuis Lumen"),
];

async function openViewings(page: Page, width: number) {
  await page.setViewportSize({ width, height: 800 });
  mockCaldavServer(page, CREDENTIALS["caldav-url"], VIEWINGS);
  await page.goto("/");
  await page.locator("#caldav-url").fill(CREDENTIALS["caldav-url"]);
  await page.locator("#caldav-username").fill(CREDENTIALS["caldav-username"]);
  await page.locator("#caldav-password").fill(CREDENTIALS["caldav-password"]);
  await page.getByRole("button", { name: "Connect" }).click();
  await expect(page.getByRole("button", { name: "Log a viewing" })).toBeVisible();
  await expect(page.locator("tbody tr")).toHaveCount(VIEWINGS.length);
}

// Lines of text an element's own content wraps over: the distinct vertical
// positions of its text nodes' client rects. Text nodes only, so a leading
// icon (the logo's SVG) doesn't read as a second line.
const COUNT_LINES = `(el) => {
  const tops = new Set();
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (!node.textContent.trim()) continue;
    const range = document.createRange();
    range.selectNodeContents(node);
    for (const r of range.getClientRects()) if (r.width > 0) tops.add(Math.round(r.top));
  }
  return tops.size;
}`;

for (const width of [390, 320]) {
  test.describe(`Viewings table at ${width}px`, () => {
    test("the page and the table's own wrapper don't overflow sideways", async ({ page }) => {
      await openViewings(page, width);

      const overflow = await page.evaluate(() => {
        const wrap = document.querySelector("table")?.parentElement as HTMLElement;
        return {
          page: document.documentElement.scrollWidth - window.innerWidth,
          wrapper: wrap.scrollWidth - wrap.clientWidth,
        };
      });

      expect(overflow.page).toBeLessThanOrEqual(0);
      expect(overflow.wrapper).toBeLessThanOrEqual(0);
    });

    test("edit and delete are fully on screen and at least 44x44", async ({ page }) => {
      await openViewings(page, width);

      for (const name of [/^Edit Dune/, /^Delete Dune/]) {
        const box = await page
          .getByRole(name.source.startsWith("^Edit") ? "link" : "button", {
            name,
          })
          .boundingBox();
        expect(box, String(name)).not.toBeNull();
        const { x, y, width: w, height: h } = box as NonNullable<typeof box>;
        expect(x, `${name} left edge`).toBeGreaterThanOrEqual(0);
        expect(x + w, `${name} right edge`).toBeLessThanOrEqual(width);
        expect(w, `${name} width`).toBeGreaterThanOrEqual(44);
        expect(h, `${name} height`).toBeGreaterThanOrEqual(44);
        expect(y).toBeGreaterThan(0);
      }
    });

    // At 320px the title column is about 100px wide, and a date with seconds
    // (17:34:50 - 19:34:50) can't fit two lines in that. Dropping the seconds
    // is #679; until then 320px is allowed one more line.
    test("a viewing's date wraps over few lines", async ({ page }) => {
      await openViewings(page, width);

      const dates = page
        .locator("tbody tr")
        .first()
        .getByText(/\d{2}-\d{2}-\d{4}|\d{1,2} \w{3} \d{4}/);
      await expect(dates.first()).toBeVisible();
      const lines = await dates
        .first()
        .evaluate(new Function(`return (${COUNT_LINES})(arguments[0])`) as never);
      expect(lines).toBeLessThanOrEqual(width === 390 ? 2 : 3);
    });

    test("the site name and the Log button each fit on one line", async ({ page }) => {
      await openViewings(page, width);

      const logo = page.locator("header a").first();
      const log = page.getByRole("button", { name: "Log a viewing" });
      const logoLines = await logo.evaluate(
        new Function(`return (${COUNT_LINES})(arguments[0])`) as never,
      );
      const logLines = await log.evaluate(
        new Function(`return (${COUNT_LINES})(arguments[0])`) as never,
      );
      expect(logoLines, "site name").toBe(1);
      expect(logLines, "Log a viewing").toBe(1);
    });

    test("introduces no accessibility violations", async ({ page }) => {
      await openViewings(page, width);

      const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
        .analyze();
      expect(results.violations).toEqual([]);
    });
  });
}
