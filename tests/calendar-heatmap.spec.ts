import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import { mockCaldavServer } from "./support/mock-caldav";

const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

const CREDENTIALS = {
  "caldav-url": "https://caldav.example.com/calendars/me/movies/",
  "caldav-username": "me",
  "caldav-password": "secret",
};

function toDateInputValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function daysAgo(n: number): Date {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000);
}

// Anchors to local noon on the same day `daysAgo` gives — several tests
// below add a few hours to a fixture's own start time to place a second
// viewing later the same day, which crosses local midnight (and lands
// on the *next* day instead) whenever the suite happens to run late at
// night. Noon leaves hours of headroom either direction.
function atNoon(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12, 0, 0);
}

async function connect(page: Page) {
  await page.goto("/");
  await page.locator("#caldav-url").fill(CREDENTIALS["caldav-url"]);
  await page.locator("#caldav-username").fill(CREDENTIALS["caldav-username"]);
  await page.locator("#caldav-password").fill(CREDENTIALS["caldav-password"]);
  await page.getByRole("button", { name: "Connect" }).click();
  await expect(page.getByRole("link", { name: "Log a viewing" })).toBeVisible();
}

test.describe("viewing heatmap", () => {
  test("renders the page with a heatmap grid", async ({ page }) => {
    mockCaldavServer(page, CREDENTIALS["caldav-url"], [
      {
        uid: "dune-uid",
        title: "Dune",
        start: daysAgo(3).toISOString(),
        end: new Date(daysAgo(3).getTime() + 3600000).toISOString(),
        medium: "cinema",
      },
    ]);
    await connect(page);
    await page.goto("/calendar");

    await expect(page.getByRole("heading", { name: "Calendar" })).toBeVisible();
    await expect(page.getByText("1 logged viewing.")).toBeVisible();
  });

  test("shades a day cell by its own viewing count, distinguishable from an empty day", async ({
    page,
  }) => {
    const dayWithOne = atNoon(daysAgo(10));
    const dayWithThree = atNoon(daysAgo(5));
    mockCaldavServer(page, CREDENTIALS["caldav-url"], [
      {
        uid: "one-uid",
        title: "One",
        start: dayWithOne.toISOString(),
        end: new Date(dayWithOne.getTime() + 3600000).toISOString(),
        medium: "cinema",
      },
      ...Array.from({ length: 3 }, (_, i) => ({
        uid: `three-uid-${i}`,
        title: `Three ${i}`,
        start: new Date(dayWithThree.getTime() + i * 60 * 60 * 1000).toISOString(),
        end: new Date(dayWithThree.getTime() + (i + 1) * 60 * 60 * 1000).toISOString(),
        medium: "cinema",
      })),
    ]);
    await connect(page);
    await page.goto("/calendar");
    await expect(page.getByText("4 logged viewings.")).toBeVisible();

    const oneLabel = `${toDateInputValue(dayWithOne)}: 1 viewing`;
    const threeLabel = `${toDateInputValue(dayWithThree)}: 3 viewings`;
    const oneCell = page.getByLabel(oneLabel, { exact: true });
    const threeCell = page.getByLabel(threeLabel, { exact: true });
    await expect(oneCell).toBeVisible();
    await expect(threeCell).toBeVisible();

    const oneClass = await oneCell.getAttribute("class");
    const threeClass = await threeCell.getAttribute("class");
    // Different bucket, different shade — not visually identical.
    expect(oneClass).not.toBe(threeClass);
  });

  test("a day cell's accessible name states its date and real count, not shade alone", async ({
    page,
  }) => {
    const day = daysAgo(7);
    mockCaldavServer(page, CREDENTIALS["caldav-url"], [
      {
        uid: "dune-uid",
        title: "Dune",
        start: day.toISOString(),
        end: new Date(day.getTime() + 3600000).toISOString(),
        medium: "cinema",
      },
    ]);
    await connect(page);
    await page.goto("/calendar");
    await expect(page.getByText("1 logged viewing.")).toBeVisible();

    await expect(
      page.getByLabel(`${toDateInputValue(day)}: 1 viewing`, { exact: true }),
    ).toBeVisible();
  });

  test("activating a day with one viewing opens a popup with its details, not a navigation", async ({
    page,
  }) => {
    const day = daysAgo(7);
    mockCaldavServer(page, CREDENTIALS["caldav-url"], [
      {
        uid: "dune-uid",
        title: "Dune",
        start: day.toISOString(),
        end: new Date(day.getTime() + 3600000).toISOString(),
        medium: "cinema",
        venue: "Grand Vista Cinema",
        year: "2021",
      },
    ]);
    await connect(page);
    await page.goto("/calendar");
    await expect(page.getByText("1 logged viewing.")).toBeVisible();

    const dayValue = toDateInputValue(day);
    const cell = page.getByRole("button", { name: `${dayValue}: 1 viewing` });
    const cellBox = await cell.boundingBox();
    await cell.click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText(dayValue);
    const link = dialog.getByRole("link", { name: "Dune (2021)" });
    await expect(link).toHaveAttribute("href", "/movie?uid=dune-uid");
    await expect(dialog).toContainText("cinema · Grand Vista Cinema");

    // Anchored next to the clicked cell, not the browser's default
    // viewport-centered placement — asserting it lands within a small
    // margin of the cell rather than, say, vertically centered on a
    // ~800px-tall viewport (which a regression to the default centering
    // would produce).
    const dialogBox = await dialog.boundingBox();
    expect(cellBox).not.toBeNull();
    expect(dialogBox).not.toBeNull();
    if (cellBox && dialogBox) {
      expect(Math.abs(dialogBox.x - cellBox.x)).toBeLessThan(100);
      expect(dialogBox.y).toBeGreaterThan(cellBox.y - 50);
    }

    // Still on /calendar — the popup didn't navigate anywhere.
    await expect(page).toHaveURL(/\/calendar/);

    await dialog.getByRole("button", { name: "Close" }).click();
    await expect(dialog).toBeHidden();
  });

  test("the popup shows a poster, showtime, director/genre and rating when known", async ({
    page,
  }) => {
    const day = daysAgo(7);
    mockCaldavServer(page, CREDENTIALS["caldav-url"], [
      {
        uid: "dune-uid",
        title: "Dune",
        start: day.toISOString(),
        end: new Date(day.getTime() + 3600000).toISOString(),
        medium: "cinema",
        venue: "Grand Vista Cinema",
        year: "2021",
        posterUrl: "https://example.com/dune-poster.jpg",
        director: "Denis Villeneuve",
        genre: "Sci-Fi",
        ratingImdb: "8.0",
      },
    ]);
    await connect(page);
    await page.goto("/calendar");
    await expect(page.getByText("1 logged viewing.")).toBeVisible();

    const dayValue = toDateInputValue(day);
    await page.getByRole("button", { name: `${dayValue}: 1 viewing` }).click();

    const dialog = page.getByRole("dialog");
    await expect(dialog.locator("img")).toHaveAttribute(
      "src",
      "https://example.com/dune-poster.jpg",
    );
    await expect(dialog).toContainText("Denis Villeneuve");
    await expect(dialog).toContainText("Sci-Fi");
    await expect(dialog).toContainText("IMDb 8.0");
  });

  // #236
  test("the popup shows a placeholder graphic instead of a gap when a viewing has no poster", async ({
    page,
  }) => {
    const day = daysAgo(7);
    mockCaldavServer(page, CREDENTIALS["caldav-url"], [
      {
        uid: "paddington-uid",
        title: "Paddington",
        start: day.toISOString(),
        end: new Date(day.getTime() + 3600000).toISOString(),
        medium: "netflix",
      },
    ]);
    await connect(page);
    await page.goto("/calendar");
    await expect(page.getByText("1 logged viewing.")).toBeVisible();

    const dayValue = toDateInputValue(day);
    await page.getByRole("button", { name: `${dayValue}: 1 viewing` }).click();

    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("img", { name: "No poster available" })).toBeVisible();
    await expect(dialog.locator("img[src]")).toHaveCount(0);
  });

  test("a day with several viewings lists all of them in the popup", async ({ page }) => {
    const day = atNoon(daysAgo(7));
    mockCaldavServer(page, CREDENTIALS["caldav-url"], [
      {
        uid: "dune-uid",
        title: "Dune",
        start: day.toISOString(),
        end: new Date(day.getTime() + 3600000).toISOString(),
        medium: "cinema",
      },
      {
        uid: "paddington-uid",
        title: "Paddington",
        start: new Date(day.getTime() + 4 * 3600000).toISOString(),
        end: new Date(day.getTime() + 5 * 3600000).toISOString(),
        medium: "netflix",
      },
    ]);
    await connect(page);
    await page.goto("/calendar");
    await expect(page.getByText("2 logged viewings.")).toBeVisible();

    const dayValue = toDateInputValue(day);
    await page.getByRole("button", { name: `${dayValue}: 2 viewings` }).click();

    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("link", { name: "Dune" })).toBeVisible();
    await expect(dialog.getByRole("link", { name: "Paddington" })).toBeVisible();
  });

  test("an empty day cell has no button and does nothing when activated", async ({ page }) => {
    // Two viewings a few days apart, so the rendered range (earliest to
    // latest viewing day) actually spans an empty day in between — a
    // single viewing alone renders a one-cell grid with nothing empty
    // to test.
    mockCaldavServer(page, CREDENTIALS["caldav-url"], [
      {
        uid: "dune-uid",
        title: "Dune",
        start: daysAgo(7).toISOString(),
        end: new Date(daysAgo(7).getTime() + 3600000).toISOString(),
        medium: "cinema",
      },
      {
        uid: "paddington-uid",
        title: "Paddington",
        start: daysAgo(3).toISOString(),
        end: new Date(daysAgo(3).getTime() + 3600000).toISOString(),
        medium: "cinema",
      },
    ]);
    await connect(page);
    await page.goto("/calendar");
    await expect(page.getByText("2 logged viewings.")).toBeVisible();

    const emptyDay = toDateInputValue(daysAgo(5));
    const emptyCell = page.getByLabel(`${emptyDay}: 0 viewings`, { exact: true });
    await expect(emptyCell).toBeVisible();
    await expect(page.getByRole("button", { name: `${emptyDay}: 0 viewings` })).toHaveCount(0);
  });

  // #241: used to fall back to rendering a 12-month grid of nothing but
  // empty cells for a genuinely empty account — noisy, not helpful.
  test("no logged viewings at all shows just the status text, no empty grid", async ({ page }) => {
    mockCaldavServer(page, CREDENTIALS["caldav-url"], []);
    await connect(page);
    await page.goto("/calendar");

    await expect(page.getByText("No logged viewings yet.")).toBeVisible();
    await expect(page.locator('[role="img"]')).toHaveCount(0);
    await expect(page.getByRole("heading", { level: 2 })).toHaveCount(0);
  });

  // #230: an empty cell's own dark-mode shade used to equal the card's
  // own dark background exactly, making every cell in a gap between
  // logged viewings genuinely invisible rather than just unshaded.
  test("an empty cell is visually distinguishable from its card background in dark mode", async ({
    page,
  }) => {
    // A gap day between two viewings, same shape as the "empty day cell"
    // test above — a genuinely empty account no longer renders any grid
    // at all (#241), so this needs a real empty cell inside a populated
    // range instead.
    mockCaldavServer(page, CREDENTIALS["caldav-url"], [
      {
        uid: "dune-uid",
        title: "Dune",
        start: daysAgo(7).toISOString(),
        end: new Date(daysAgo(7).getTime() + 3600000).toISOString(),
        medium: "cinema",
      },
      {
        uid: "paddington-uid",
        title: "Paddington",
        start: daysAgo(3).toISOString(),
        end: new Date(daysAgo(3).getTime() + 3600000).toISOString(),
        medium: "cinema",
      },
    ]);
    await connect(page);
    await page.getByRole("switch", { name: /switch to (dark|light) mode/i }).click();
    await page.goto("/calendar");
    await expect(page.getByText("2 logged viewings.")).toBeVisible();

    const cell = page.locator('[role="img"]').first();
    const cellColor = await cell.evaluate((el) => getComputedStyle(el).backgroundColor);
    const cardColor = await page.evaluate(
      (el) => {
        const card = el.closest(".rounded-xl");
        if (!card) throw new Error("no card wrapper found");
        return getComputedStyle(card).backgroundColor;
      },
      await cell.elementHandle(),
    );

    expect(cellColor).not.toBe(cardColor);
  });

  // #223: same bfcache-restore gap as the calendar overview's own test.
  test("a bfcache restore refreshes data that changed while this page was cached", async ({
    page,
  }) => {
    const day = daysAgo(3);
    const server = mockCaldavServer(page, CREDENTIALS["caldav-url"], [
      {
        uid: "dune-uid",
        title: "Dune",
        start: day.toISOString(),
        end: new Date(day.getTime() + 3600000).toISOString(),
        medium: "cinema",
      },
    ]);
    await connect(page);
    await page.goto("/calendar");
    await expect(page.getByText("1 logged viewing.")).toBeVisible();

    server.viewings.delete("dune-uid");
    await page.evaluate(() => {
      window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true }));
    });

    await expect(page.getByText("No logged viewings yet.")).toBeVisible();
  });

  test("introduces no accessibility violations", async ({ page }) => {
    mockCaldavServer(page, CREDENTIALS["caldav-url"], [
      {
        uid: "dune-uid",
        title: "Dune",
        start: daysAgo(3).toISOString(),
        end: new Date(daysAgo(3).getTime() + 3600000).toISOString(),
        medium: "cinema",
      },
    ]);
    await connect(page);
    await page.goto("/calendar");
    await expect(page.getByText("1 logged viewing.")).toBeVisible();

    const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
    expect(results.violations).toEqual([]);
  });

  test("reachable from the site nav", async ({ page }) => {
    mockCaldavServer(page, CREDENTIALS["caldav-url"], []);
    await connect(page);

    await page.getByRole("link", { name: "Calendar" }).click();
    await expect(page.getByRole("heading", { name: "Calendar" })).toBeVisible();
  });
});
