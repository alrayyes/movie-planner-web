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

// Fixed, absolute timestamps, never relative to now (#698): the rendered date
// text is what the wrap tests measure, and its width depends on the exact
// digits, so a date moving with the clock made a borderline case pass one
// hour and fail the next. Whole minutes, like a real viewing (a time is
// entered to the minute, and formatTime drops zero seconds, #359): seconds in
// the fixture would make the date wider than any real one.
const at = (iso: string, hours = 2.5) => ({
  start: iso,
  end: new Date(new Date(iso).getTime() + hours * 60 * 60 * 1000).toISOString(),
});
const viewing = (uid: string, title: string, iso: string, medium: string, venue?: string) => ({
  uid,
  title,
  ...at(iso),
  medium,
  venue,
  year: "2024",
});

const VIEWINGS = [
  viewing("dune", "Dune: Part Two", "2026-09-29T17:34:00Z", "cinema", "Grand Vista Cinema"),
  viewing("paddington", "Paddington in Peru", "2026-09-12T15:30:00Z", "netflix"),
  viewing("lumen", "The Brutalist", "2026-09-23T20:15:00Z", "cinema", "Filmhuis Lumen"),
];

// The same date text on every machine: formatPeriod reads the browser's zone.
test.use({ timezoneId: "UTC" });

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

// #914: the same page at each phone width is one journey: open it once, then
// resize, rather than signing in again per width.
const WIDTHS = [390, 320];

async function atEachWidth(page: Page, check: (width: number) => Promise<void>) {
  await openViewings(page, WIDTHS[0] as number);
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 800 });
    await check(width);
  }
}

test.describe("Viewings table at phone widths", () => {
  test("the page and the table's own wrapper don't overflow sideways", async ({ page }) => {
    await atEachWidth(page, async (width) => {
      const overflow = await page.evaluate(() => {
        const wrap = document.querySelector("table")?.parentElement as HTMLElement;
        return {
          page: document.documentElement.scrollWidth - window.innerWidth,
          wrapper: wrap.scrollWidth - wrap.clientWidth,
        };
      });

      expect(overflow.page, `page at ${width}px`).toBeLessThanOrEqual(0);
      expect(overflow.wrapper, `table wrapper at ${width}px`).toBeLessThanOrEqual(0);
    });
  });

  test("edit and delete are fully on screen and at least 44x44", async ({ page }) => {
    await atEachWidth(page, async (width) => {
      for (const name of [/^Edit Dune/, /^Delete Dune/]) {
        const box = await page
          .getByRole(name.source.startsWith("^Edit") ? "link" : "button", {
            name,
          })
          .boundingBox();
        expect(box, `${name} at ${width}px`).not.toBeNull();
        const { x, y, width: w, height: h } = box as NonNullable<typeof box>;
        expect(x, `${name} left edge at ${width}px`).toBeGreaterThanOrEqual(0);
        expect(x + w, `${name} right edge at ${width}px`).toBeLessThanOrEqual(width);
        expect(w, `${name} width at ${width}px`).toBeGreaterThanOrEqual(44);
        expect(h, `${name} height at ${width}px`).toBeGreaterThanOrEqual(44);
        expect(y).toBeGreaterThan(0);
      }
    });
  });

  // 390px is the ticket's width (#680): two lines. At 320px the title column
  // is only about 80px wide, so a whole-minute date still wraps to three.
  test("a viewing's date wraps over few lines", async ({ page }) => {
    await atEachWidth(page, async (width) => {
      const dates = page
        .locator("tbody tr")
        .first()
        .getByText(/\d{2}-\d{2}-\d{4}|\d{1,2} \w{3} \d{4}/);
      await expect(dates.first()).toBeVisible();
      const lines = await dates
        .first()
        .evaluate(new Function(`return (${COUNT_LINES})(arguments[0])`) as never);
      expect(lines, `date lines at ${width}px`).toBeLessThanOrEqual(width === 390 ? 2 : 3);
    });
  });

  test("the site name and the Log button each fit on one line", async ({ page }) => {
    await atEachWidth(page, async (width) => {
      const logo = page.locator("header a").first();
      const log = page.getByRole("button", { name: "Log a viewing" });
      const logoLines = await logo.evaluate(
        new Function(`return (${COUNT_LINES})(arguments[0])`) as never,
      );
      const logLines = await log.evaluate(
        new Function(`return (${COUNT_LINES})(arguments[0])`) as never,
      );
      expect(logoLines, `site name at ${width}px`).toBe(1);
      expect(logLines, `Log a viewing at ${width}px`).toBe(1);
    });
  });

  test("introduces no accessibility violations", async ({ page }) => {
    await atEachWidth(page, async () => {
      const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
        .analyze();
      expect(results.violations).toEqual([]);
    });
  });
});
