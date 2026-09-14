import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import { mockCaldavServer } from "./support/mock-caldav";

const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

const CREDENTIALS = {
  "caldav-url": "https://caldav.example.com/calendars/me/movies/",
  "caldav-username": "me",
  "caldav-password": "secret",
};

const ONE_MONTH_AGO = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
const TWO_MONTHS_AGO = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);

async function connect(page: Page) {
  await page.goto("/");
  await page.locator("#caldav-url").fill(CREDENTIALS["caldav-url"]);
  await page.locator("#caldav-username").fill(CREDENTIALS["caldav-username"]);
  await page.locator("#caldav-password").fill(CREDENTIALS["caldav-password"]);
  await page.getByRole("button", { name: "Connect" }).click();
  await expect(page.getByRole("link", { name: "Settings" })).toBeVisible();
}

// #602: mirrors venue.spec.ts's own "per-venue page" coverage, minus
// the map — medium has no location to plot.
test.describe("per-medium page", () => {
  test("shows only that medium's own viewings, with no filter controls of any kind", async ({
    page,
  }) => {
    mockCaldavServer(
      page,
      CREDENTIALS["caldav-url"],
      [
        {
          uid: "dune-uid",
          title: "Dune",
          start: ONE_MONTH_AGO.toISOString(),
          end: new Date(ONE_MONTH_AGO.getTime() + 60 * 60 * 1000).toISOString(),
          medium: "Netflix",
        },
        {
          uid: "paddington-uid",
          title: "Paddington",
          start: TWO_MONTHS_AGO.toISOString(),
          end: new Date(TWO_MONTHS_AGO.getTime() + 60 * 60 * 1000).toISOString(),
          medium: "Blu-ray",
        },
      ],
      { media: ["Netflix", "Blu-ray"], venues: [] },
    );
    await connect(page);

    await page.goto(`/medium?medium=${encodeURIComponent("Netflix")}`);

    const rows = page.locator("tbody tr");
    await expect(rows).toHaveCount(1);
    await expect(rows).toContainText("Dune");
    await expect(rows).not.toContainText("Paddington");

    await expect(page.getByText("Filters", { exact: true })).toHaveCount(0);
    await expect(page.locator("input[type=text]")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Filter", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Clear filter" })).toHaveCount(0);

    const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
    expect(results.violations).toEqual([]);
  });

  // #600: a viewing with no stored medium (every CLI-logged one, since
  // the CLI never writes that property) shows up under Cinema — the
  // same blank-means-Cinema rule mediumDisplay applies everywhere else.
  test("Cinema includes viewings with no stored medium at all", async ({ page }) => {
    mockCaldavServer(
      page,
      CREDENTIALS["caldav-url"],
      [
        {
          uid: "dune-uid",
          title: "Dune",
          start: ONE_MONTH_AGO.toISOString(),
          end: new Date(ONE_MONTH_AGO.getTime() + 60 * 60 * 1000).toISOString(),
          medium: "",
        },
        {
          uid: "paddington-uid",
          title: "Paddington",
          start: TWO_MONTHS_AGO.toISOString(),
          end: new Date(TWO_MONTHS_AGO.getTime() + 60 * 60 * 1000).toISOString(),
          medium: "Netflix",
        },
      ],
      { media: ["Netflix"], venues: [] },
    );
    await connect(page);

    await page.goto("/medium?medium=Cinema");

    const rows = page.locator("tbody tr");
    await expect(rows).toHaveCount(1);
    await expect(rows).toContainText("Dune");
  });

  test("breadcrumb's middle crumb links to /mediums, and the page title reflects the medium", async ({
    page,
  }) => {
    mockCaldavServer(
      page,
      CREDENTIALS["caldav-url"],
      [
        {
          uid: "dune-uid",
          title: "Dune",
          start: ONE_MONTH_AGO.toISOString(),
          end: new Date(ONE_MONTH_AGO.getTime() + 60 * 60 * 1000).toISOString(),
          medium: "Netflix",
        },
      ],
      { media: ["Netflix"], venues: [] },
    );
    await connect(page);

    await page.goto(`/medium?medium=${encodeURIComponent("Netflix")}`);

    const nav = page.getByRole("navigation", { name: "Breadcrumb" });
    await expect(nav).toBeVisible();
    await expect(nav.getByRole("link", { name: "Home" })).toHaveAttribute("href", "/");
    await expect(nav.getByRole("link", { name: "Mediums" })).toHaveAttribute("href", "/mediums");
    await expect(nav.getByText("Netflix")).toBeVisible();

    await expect(page).toHaveTitle("Netflix — Mediums — Movie Planner");
  });

  test("shows an empty-results state for a medium matching nothing, not an error", async ({
    page,
  }) => {
    mockCaldavServer(
      page,
      CREDENTIALS["caldav-url"],
      [
        {
          uid: "dune-uid",
          title: "Dune",
          start: ONE_MONTH_AGO.toISOString(),
          end: new Date(ONE_MONTH_AGO.getTime() + 60 * 60 * 1000).toISOString(),
          medium: "Netflix",
        },
      ],
      { media: ["Netflix"], venues: [] },
    );
    await connect(page);

    await page.goto(`/medium?medium=${encodeURIComponent("No Such Medium")}`);

    await expect(page.locator("tbody tr")).toHaveCount(0);
    await expect(page.getByText("0 logged viewings.")).toBeVisible();
    await expect(page.getByRole("alert")).toHaveCount(0);
  });

  test("paginates a medium's own viewings", async ({ page }) => {
    const viewings = Array.from({ length: 30 }, (_, i) => {
      const start = new Date(ONE_MONTH_AGO.getTime() - i * 24 * 60 * 60 * 1000);
      return {
        uid: `viewing-${i}`,
        title: `Movie ${i}`,
        start: start.toISOString(),
        end: new Date(start.getTime() + 60 * 60 * 1000).toISOString(),
        medium: "Netflix",
      };
    });
    mockCaldavServer(page, CREDENTIALS["caldav-url"], viewings, {
      media: ["Netflix"],
      venues: [],
    });
    await connect(page);

    await page.goto(`/medium?medium=${encodeURIComponent("Netflix")}`);

    await expect(page.getByText("30 logged viewings.")).toBeVisible();
    await expect(page.locator("tbody tr")).toHaveCount(25);
    const pagination = page.getByLabel("Pagination");
    await expect(pagination).toBeVisible();
    await expect(pagination).toContainText("Page 1 of 2");

    await page.getByRole("button", { name: "Next page" }).click();
    await expect(page.locator("tbody tr")).toHaveCount(5);
    await expect(pagination).toContainText("Page 2 of 2");

    await page.selectOption("#medium-page-size", "50");
    await expect(page.locator("tbody tr")).toHaveCount(30);
    await expect(page.getByLabel("Pagination")).toHaveCount(0);
  });

  test("shows a distinct error toast on a genuine load failure", async ({ page }) => {
    mockCaldavServer(page, CREDENTIALS["caldav-url"], []);
    await connect(page);

    await page.route(`${new URL(CREDENTIALS["caldav-url"]).origin}/**`, async (route) => {
      if (route.request().method() === "REPORT") {
        await route.fulfill({ status: 500, body: "Internal Server Error" });
        return;
      }
      await route.fallback();
    });

    await page.goto(`/medium?medium=${encodeURIComponent("Netflix")}`);

    const toast = page.getByRole("alert");
    await expect(toast).toBeVisible();
    await expect(toast).toContainText(/the CalDAV server responded 500/);
  });

  test("asks a visitor with no stored credentials to connect first", async ({ page }) => {
    await page.goto(`/medium?medium=${encodeURIComponent("Netflix")}`);

    await expect(page.getByText("Connect first to see this medium.")).toBeVisible();
  });
});
