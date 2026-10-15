import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import { mockCaldavServer } from "./support/mock-caldav";

// #681 gave the heatmap a legend; #911 took it out again, because the data is
// binary. #681 also measured that the grid's width was not the problem: a full
// year already spans 83% of the card at 1280px and only an unfinished current
// year is shorter, so sizing is left alone and guarded below.

const CREDENTIALS = {
  "caldav-url": "https://caldav.example.com/calendars/me/movies/",
  "caldav-username": "me",
  "caldav-password": "secret",
};

// Fixed whole-minute timestamps in UTC (#698): one day with 1 viewing, one with
// 2, one with 4, so every colour bucket has a real cell to compare against.
const viewing = (uid: string, iso: string) => ({
  uid,
  title: `Film ${uid}`,
  start: iso,
  end: new Date(new Date(iso).getTime() + 2 * 60 * 60 * 1000).toISOString(),
  medium: "cinema",
  year: "2024",
});

const VIEWINGS = [
  viewing("one", "2025-02-10T18:00:00Z"),
  viewing("two-a", "2025-06-12T14:00:00Z"),
  viewing("two-b", "2025-06-12T19:00:00Z"),
  viewing("four-a", "2025-11-20T10:00:00Z"),
  viewing("four-b", "2025-11-20T13:00:00Z"),
  viewing("four-c", "2025-11-20T16:00:00Z"),
  viewing("four-d", "2025-11-20T19:00:00Z"),
  viewing("recent", "2026-01-15T18:00:00Z"),
];

test.use({ timezoneId: "UTC", viewport: { width: 1280, height: 900 } });

async function openCalendar(page: Page) {
  mockCaldavServer(page, CREDENTIALS["caldav-url"], VIEWINGS);
  await page.goto("/");
  await page.locator("#caldav-url").fill(CREDENTIALS["caldav-url"]);
  await page.locator("#caldav-username").fill(CREDENTIALS["caldav-username"]);
  await page.locator("#caldav-password").fill(CREDENTIALS["caldav-password"]);
  await page.getByRole("button", { name: "Connect" }).click();
  await expect(page.getByRole("button", { name: "Log a viewing" })).toBeVisible();
  await page.goto("/calendar");
  await expect(page.getByRole("heading", { name: "2025" })).toBeVisible();
}

const background = (el: Element) => getComputedStyle(el).backgroundColor;

test.describe("calendar heatmap, binary marks and weekdays", () => {
  test("has no intensity legend, since a day is either went or not", async ({ page }) => {
    await openCalendar(page);

    await expect(page.getByRole("group", { name: /viewings per day/i })).toHaveCount(0);
    await expect(page.locator("[data-legend-swatch]")).toHaveCount(0);
  });

  test("a day with one viewing and a day with four share one colour", async ({ page }) => {
    await openCalendar(page);

    const one = await page
      .getByLabel("2025-02-10: 1 viewing", { exact: true })
      .evaluate(background);
    const four = await page
      .getByLabel("2025-11-20: 4 viewings", { exact: true })
      .evaluate(background);
    const empty = await page
      .getByLabel("2025-02-11: 0 viewings", { exact: true })
      .evaluate(background);

    expect(four).toBe(one);
    expect(one).not.toBe(empty);
  });

  test("the rows are labelled with weekday names", async ({ page }) => {
    await openCalendar(page);

    const section = page.getByRole("heading", { name: "2025" }).locator("xpath=ancestor::div[1]");
    for (const weekday of ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]) {
      await expect(section.getByText(weekday, { exact: true })).toBeVisible();
    }
  });

  test("an empty weekend cell is shaded apart from an empty weekday cell", async ({ page }) => {
    await openCalendar(page);

    // 2025-02-11 is a Tuesday, 2025-02-15 a Saturday, 2025-02-16 a Sunday.
    const weekday = await page
      .getByLabel("2025-02-11: 0 viewings", { exact: true })
      .evaluate(background);
    const saturday = await page
      .getByLabel("2025-02-15: 0 viewings", { exact: true })
      .evaluate(background);
    const sunday = await page
      .getByLabel("2025-02-16: 0 viewings", { exact: true })
      .evaluate(background);

    expect(saturday).not.toBe(weekday);
    expect(sunday).toBe(saturday);
  });

  test("the page has no accessibility violations", async ({ page }) => {
    await openCalendar(page);

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    expect(results.violations).toEqual([]);
  });
});

// Guards for behaviour that must not change (measured before touching anything).
test.describe("calendar heatmap, unchanged behaviour", () => {
  test("a full year's grid spans at least 80% of the card", async ({ page }) => {
    await openCalendar(page);

    const ratio = await page.getByRole("heading", { name: "2025" }).evaluate((heading) => {
      const section = heading.closest("div.flex-col") as HTMLElement;
      const grid = section.querySelector("div.grid") as HTMLElement;
      const wrapper = grid.parentElement as HTMLElement;
      return grid.getBoundingClientRect().width / wrapper.clientWidth;
    });
    expect(ratio).toBeGreaterThanOrEqual(0.8);
  });

  test("a day cell has an accessible name with its date and count, and opens that day", async ({
    page,
  }) => {
    await openCalendar(page);

    const cell = page.getByRole("button", { name: "2025-06-12: 2 viewings" });
    await expect(cell).toBeVisible();
    await cell.click();
    await expect(page.getByRole("dialog", { name: "Viewings on 2025-06-12" })).toBeVisible();
  });
});

// #918: 53 weekly columns can't fit a phone, so under the sm breakpoint the grid
// turns on its side: one row per week, the weekdays across the top.
for (const width of [320, 390]) {
  test.describe(`calendar heatmap at ${width}px`, () => {
    test.use({ viewport: { width, height: 800 } });

    test("fits the card with no horizontal scrollbar", async ({ page }) => {
      await openCalendar(page);

      const { scrollWidth, clientWidth } = await page
        .getByRole("heading", { name: "2025" })
        .evaluate((heading) => {
          const grid = (heading.closest("div.flex-col") as HTMLElement).querySelector(
            "div.grid",
          ) as HTMLElement;
          const wrapper = grid.parentElement as HTMLElement;
          return { scrollWidth: wrapper.scrollWidth, clientWidth: wrapper.clientWidth };
        });
      expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
    });

    test("weekday names head the columns, left to right Sun to Sat", async ({ page }) => {
      await openCalendar(page);

      const section = page.getByRole("heading", { name: "2025" }).locator("xpath=ancestor::div[1]");
      const xs: number[] = [];
      for (const weekday of ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]) {
        const box = await section.getByText(weekday, { exact: true }).boundingBox();
        expect(box, weekday).not.toBeNull();
        xs.push(box?.x ?? 0);
      }
      expect(xs).toEqual([...xs].sort((a, b) => a - b));
      expect(new Set(xs).size).toBe(7);
    });

    test("a day cell is still tappable and opens that day", async ({ page }) => {
      await openCalendar(page);

      await page.getByRole("button", { name: "2025-06-12: 2 viewings" }).click();
      await expect(page.getByRole("dialog", { name: "Viewings on 2025-06-12" })).toBeVisible();
    });
  });
}
