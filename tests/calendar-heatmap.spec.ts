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

  // #275/#536: a year heading above its own grid, still clickable — a
  // day cell opens a popup instead (too small a span to navigate away
  // for), but a month or a year is too much to preview there. The
  // redesign (#536) replaced the old per-month heading with a compact
  // month label positioned above that month's own columns — still a
  // real link, just no longer wrapped in its own <h3> sub-heading,
  // since a month is now a label inside one continuous year grid, not
  // a document section of its own.
  test("clicking the year heading or a month label navigates to the overview filtered to that span", async ({
    page,
  }) => {
    mockCaldavServer(page, CREDENTIALS["caldav-url"], [
      {
        uid: "dune-uid",
        title: "Dune",
        start: "2026-03-15T19:00:00.000Z",
        end: "2026-03-15T21:00:00.000Z",
        medium: "cinema",
      },
    ]);
    await connect(page);
    await page.goto("/calendar");
    await expect(page.getByText("1 logged viewing.")).toBeVisible();

    const yearHeading = page.getByRole("heading", { level: 2, name: "2026" });
    await expect(yearHeading.getByRole("link", { name: "2026" })).toHaveAttribute(
      "href",
      "/?from=2026-01-01&to=2026-12-31",
    );

    const marchLabel = page.getByRole("link", { name: "Mar", exact: true });
    await expect(marchLabel).toHaveAttribute("href", "/?from=2026-03-01&to=2026-03-31");

    await marchLabel.click();
    await expect(page).toHaveURL(/\/\?from=2026-03-01&to=2026-03-31/);
    await expect(page.locator("tbody tr")).toHaveCount(1);
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

  // #440: the popup's own venue text gets the same trim-to-name +
  // known-city treatment as movie details and the overview table — a
  // street address baked into the raw venue value never shows up here.
  test("the popup shows a trimmed venue, name and known city only", async ({ page }) => {
    const day = daysAgo(7);
    mockCaldavServer(page, CREDENTIALS["caldav-url"], [
      {
        uid: "dune-uid",
        title: "Dune",
        start: day.toISOString(),
        end: new Date(day.getTime() + 3600000).toISOString(),
        medium: "cinema",
        venue: "De Munt, Vijzelstraat 15, 1017 HD Amsterdam, Netherlands",
        city: "Amsterdam",
        country: "Netherlands",
        year: "2021",
      },
    ]);
    await connect(page);
    await page.goto("/calendar");
    await expect(page.getByText("1 logged viewing.")).toBeVisible();

    const dayValue = toDateInputValue(day);
    const cell = page.getByRole("button", { name: `${dayValue}: 1 viewing` });
    await cell.click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText("cinema · De Munt, Amsterdam");
    await expect(dialog).not.toContainText("Vijzelstraat");
    await expect(dialog).not.toContainText("Netherlands");
  });

  test("hovering a day cell also opens the popup, closing again once the pointer leaves", async ({
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
        year: "2021",
      },
    ]);
    await connect(page);
    await page.goto("/calendar");
    await expect(page.getByText("1 logged viewing.")).toBeVisible();

    const dayValue = toDateInputValue(day);
    const cell = page.getByRole("button", { name: `${dayValue}: 1 viewing` });
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeHidden();

    await cell.hover();
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("link", { name: "Dune (2021)" })).toBeVisible();

    // Still just hovering, not pinned — the page underneath stays
    // interactive (a modal's backdrop would block this).
    await expect(page.getByRole("heading", { name: "Calendar" })).toBeVisible();

    await page.mouse.move(0, 0);
    await expect(dialog).toBeHidden();
  });

  // #565: hovering used to jump the whole page to the top: a non-modal
  // <dialog>'s UA-default position is `position: absolute;
  // inset-block-start: 0` — pinned to the very top of the page. Some
  // browsers (confirmed: WebKit/Safari) scroll a freshly shown dialog
  // into view as part of opening it, before this component's own
  // positionNear() gets a chance to move it next to the hovered cell —
  // so hovering a cell far down the page jumped the whole page up to
  // that top-pinned position. Pinning the dialog to `position: fixed`
  // at the viewport's own top-left corner keeps it inside the viewport
  // from the instant it opens, so there's nothing for that
  // scroll-into-view behavior to do. This can't be asserted by
  // reproducing the jump itself — it isn't reproducible via Chromium or
  // Firefox under Playwright, only WebKit, which isn't available in
  // this suite's single-browser project — so it asserts the concrete
  // invariant that prevents it instead.
  test("the popup dialog stays fixed within the viewport, not the browser's own top-of-page position", async ({
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
        year: "2021",
      },
    ]);
    await connect(page);
    await page.goto("/calendar");
    await expect(page.getByText("1 logged viewing.")).toBeVisible();

    const dayValue = toDateInputValue(day);
    const cell = page.getByRole("button", { name: `${dayValue}: 1 viewing` });
    await cell.hover();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveCSS("position", "fixed");
  });

  test("clicking a day cell pins the popup open even after the pointer leaves", async ({
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
        year: "2021",
      },
    ]);
    await connect(page);
    await page.goto("/calendar");
    await expect(page.getByText("1 logged viewing.")).toBeVisible();

    const dayValue = toDateInputValue(day);
    const cell = page.getByRole("button", { name: `${dayValue}: 1 viewing` });
    await cell.click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await page.mouse.move(0, 0);
    // A pinned (clicked) popup stays open — only hovering closes on
    // its own.
    await expect(dialog).toBeVisible();
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
    // Two viewings a few days apart, so there's a specific known-empty
    // day in between to assert against — the year grid itself (#536)
    // always renders every day of the year regardless of activity, so
    // even a single viewing already has plenty of empty cells around
    // it; this just picks one with a predictable date.
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

  // #259 first collapsed a fully-empty month to a single "No viewings."
  // line instead of a full ~30-cell empty grid; #286 went further and
  // skipped it entirely — a real excerpt from an actual import showed
  // 20 consecutive empty months each still rendering their own line,
  // one after another. #536's continuous week-column grid makes that
  // hack unnecessary: a quiet stretch of months is now just some
  // unshaded columns inside the same compact year grid, not a
  // document section of its own with its own dead space to collapse —
  // so this replacement asserts the equivalent guarantee (a long gap
  // doesn't read as a wall of anything) the new way: no per-month
  // sub-headings at all, both active months' own labels still present,
  // and a day squarely inside the gap still renders as a real,
  // zero-count cell rather than being culled.
  test("a long gap between active months renders as quiet cells within one continuous year grid, not skipped or split into sections", async ({
    page,
  }) => {
    const recent = daysAgo(3);
    const old = daysAgo(200);
    mockCaldavServer(page, CREDENTIALS["caldav-url"], [
      {
        uid: "dune-uid",
        title: "Dune",
        start: old.toISOString(),
        end: new Date(old.getTime() + 3600000).toISOString(),
        medium: "cinema",
      },
      {
        uid: "paddington-uid",
        title: "Paddington",
        start: recent.toISOString(),
        end: new Date(recent.getTime() + 3600000).toISOString(),
        medium: "cinema",
      },
    ]);
    await connect(page);
    await page.goto("/calendar");
    await expect(page.getByText("2 logged viewings.")).toBeVisible();

    // No more per-month sub-heading — a month is a label above its own
    // columns in the one continuous grid, not its own section.
    await expect(page.getByRole("heading", { level: 3 })).toHaveCount(0);

    // Both active months' own labels still render, proving the months
    // between them (with nothing logged) aren't skipped — they're
    // still part of the same grid, just quiet columns.
    const oldMonthLabel = old.toLocaleDateString("en-US", { month: "short" });
    const recentMonthLabel = recent.toLocaleDateString("en-US", { month: "short" });
    await expect(
      page.getByRole("link", { name: oldMonthLabel, exact: true }).first(),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: recentMonthLabel, exact: true }).first(),
    ).toBeVisible();

    // A day squarely inside the gap still renders as a real, zero-count
    // cell — not omitted — since the grid can't skip a stretch of
    // weeks without breaking column continuity.
    const gapDay = toDateInputValue(daysAgo(100));
    await expect(page.getByLabel(`${gapDay}: 0 viewings`, { exact: true })).toBeVisible();
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

  // #442: a genuine load failure gets a distinct, assertively announced
  // error toast — not the same quiet role="status" line the viewing
  // count uses.
  test("a load failure shows a distinct error toast, leaving routine status unaffected", async ({
    page,
  }) => {
    mockCaldavServer(page, CREDENTIALS["caldav-url"], []);
    await connect(page);

    await page.route(`${new URL(CREDENTIALS["caldav-url"]).origin}/**`, async (route) => {
      if (route.request().method() === "REPORT") {
        await route.fulfill({ status: 500, body: "Internal Server Error" });
        return;
      }
      await route.fallback();
    });
    await page.goto("/calendar");

    const toast = page.getByRole("alert");
    await expect(toast).toBeVisible();
    await expect(toast).toContainText(/the CalDAV server responded 500/);

    const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
    expect(results.violations).toEqual([]);

    await page.getByRole("button", { name: "Dismiss error" }).click();
    await expect(toast).toHaveCount(0);
  });
});
