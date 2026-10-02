import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import { mockCaldavServer } from "./support/mock-caldav";

// #681: the calendar heatmap had no legend, so a pale or dark square had no
// stated meaning. Measured first: the grid's width was not the problem. A full
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

test.describe("calendar heatmap legend", () => {
  test("a Less to More legend with four swatches is shown below the grids", async ({ page }) => {
    await openCalendar(page);

    const legend = page.getByRole("group", { name: /viewings per day/i });
    await expect(legend).toBeVisible();
    await expect(legend).toContainText("Less");
    await expect(legend).toContainText("More");
    await expect(legend.locator("[data-legend-swatch]")).toHaveCount(4);
  });

  test("each swatch is the colour of a real cell with that many viewings", async ({ page }) => {
    await openCalendar(page);

    const cases: [string, string][] = [
      ["0", "2025-02-11: 0 viewings"],
      ["1", "2025-02-10: 1 viewing"],
      ["2-3", "2025-06-12: 2 viewings"],
      ["4+", "2025-11-20: 4 viewings"],
    ];
    for (const [bucket, cellLabel] of cases) {
      const swatch = await page.locator(`[data-legend-swatch="${bucket}"]`).evaluate(background);
      const cell = await page.getByLabel(cellLabel, { exact: true }).first().evaluate(background);
      expect(swatch, `legend swatch ${bucket} against cell "${cellLabel}"`).toBe(cell);
    }
  });

  test("the legend has no accessibility violations", async ({ page }) => {
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
