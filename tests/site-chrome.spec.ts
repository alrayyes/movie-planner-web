import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import { mockCaldavServer } from "./support/mock-caldav";

const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

const CREDENTIALS = {
  "caldav-url": "https://caldav.example.com/calendars/me/movies/",
  "caldav-username": "me",
  "caldav-password": "secret",
};

async function connect(page: Page) {
  await page.goto("/");
  await page.locator("#caldav-url").fill(CREDENTIALS["caldav-url"]);
  await page.locator("#caldav-username").fill(CREDENTIALS["caldav-username"]);
  await page.locator("#caldav-password").fill(CREDENTIALS["caldav-password"]);
  await page.getByRole("button", { name: "Connect" }).click();
  // Credential storage is async — wait for its result to actually
  // render before doing anything else, so a test that navigates away
  // right after connect() isn't racing the write (same pattern every
  // other spec file's own connect() helper already uses).
  await expect(page.getByRole("link", { name: "Log a viewing" })).toBeVisible();
}

// #66: the "Fork me on GitHub" ribbon — present on every page via
// Layout.astro, so a single check on the unauthenticated home page
// covers it.
test.describe("Fork me on GitHub ribbon", () => {
  test("links to the repo in a new tab", async ({ page }) => {
    await page.goto("/");

    const link = page.getByRole("link", { name: "Fork me on GitHub" });
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute("href", "https://github.com/alrayyes/movie-planner-web");
    await expect(link).toHaveAttribute("target", "_blank");
    await expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  test("introduces no accessibility violations", async ({ page }) => {
    await page.goto("/");

    const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
    expect(results.violations).toEqual([]);
  });

  // #135: the ribbon's diagonal banner used to sit close enough to the
  // header's dark-mode toggle, on narrow and medium viewports, that a
  // click meant for the toggle could land on the ribbon's link instead.
  // A raw bounding-box comparison isn't the right check here: the
  // rotated banner's untransformed box is much bigger than its visible
  // diagonal strip, so two boxes "overlapping" doesn't mean a click
  // would actually be intercepted. Clicking the toggle and confirming
  // it actually flips is the real invariant.
  test("a click on the dark-mode toggle reaches the toggle, not the ribbon", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 400 });
    await page.goto("/");

    const toggle = page.getByRole("switch", { name: /switch to (dark|light) mode/i });
    const before = await toggle.getAttribute("aria-checked");

    await toggle.click();

    await expect(toggle).not.toHaveAttribute("aria-checked", before ?? "");
  });
});

// #127: used to only ever appear on the home page (built inside
// credentials-gate.ts's own renderConnected()) — every other page had
// no way to reach any other page except editing the URL.
test.describe("site nav", () => {
  test("appears immediately after connecting, without a page reload", async ({ page }) => {
    mockCaldavServer(page, CREDENTIALS["caldav-url"]);
    await page.goto("/");
    await expect(page.getByRole("link", { name: "Log a viewing" })).toHaveCount(0);

    await page.locator("#caldav-url").fill(CREDENTIALS["caldav-url"]);
    await page.locator("#caldav-username").fill(CREDENTIALS["caldav-username"]);
    await page.locator("#caldav-password").fill(CREDENTIALS["caldav-password"]);
    await page.getByRole("button", { name: "Connect" }).click();

    await expect(page.getByRole("link", { name: "Log a viewing" })).toBeVisible();
  });

  test("appears on a non-home page too, and its links work from there", async ({ page }) => {
    mockCaldavServer(page, CREDENTIALS["caldav-url"]);
    await connect(page);

    await page.goto("/privacy");

    await expect(page.getByRole("link", { name: "Viewings" })).toHaveAttribute("href", "/");
    await expect(page.getByRole("link", { name: "Venues" })).toHaveAttribute("href", "/venues");
    await expect(page.getByRole("link", { name: "Calendar" })).toHaveAttribute("href", "/calendar");
    await expect(page.getByRole("link", { name: "Map", exact: true })).toHaveAttribute(
      "href",
      "/map",
    );
    await expect(page.getByRole("link", { name: "Log a viewing" })).toHaveAttribute("href", "/log");
    await expect(page.getByRole("link", { name: "Import" })).toHaveAttribute("href", "/import");
    await expect(page.getByRole("link", { name: "Settings" })).toHaveAttribute("href", "/settings");

    // #161/#204/#237: Viewings, Venues, Calendar, Map, Log a viewing,
    // Import, Settings, in that order — not just present, but in the
    // order a visitor reads them.
    await expect(page.locator("site-nav a")).toHaveText([
      "Viewings",
      "Venues",
      "Calendar",
      "Map",
      "Log a viewing",
      "Import",
      "Settings",
    ]);

    await page.getByRole("link", { name: "Venues" }).click();
    await expect(page.getByRole("heading", { name: "Venues" })).toBeVisible();
  });

  test("doesn't appear before a visitor has connected", async ({ page }) => {
    await page.goto("/privacy");

    await expect(page.getByRole("link", { name: "Log a viewing" })).toHaveCount(0);
  });
});

// #67
test.describe("footer", () => {
  test("links to GitHub, the disclaimer, and the privacy page, with a copyright line", async ({
    page,
  }) => {
    await page.goto("/");

    const footer = page.locator("footer");
    await expect(footer.getByRole("link", { name: "GitHub" })).toHaveAttribute(
      "href",
      "https://github.com/alrayyes/movie-planner-web",
    );
    await expect(footer.getByRole("link", { name: "About" })).toHaveAttribute("href", "/about");
    await expect(footer.getByRole("link", { name: "Disclaimer" })).toHaveAttribute(
      "href",
      "/disclaimer",
    );
    await expect(footer.getByRole("link", { name: "Privacy" })).toHaveAttribute("href", "/privacy");
    await expect(footer).toContainText("GPL-3.0-or-later");
  });

  test("privacy page states the fully static, browser-only storage claim, with a clean a11y scan", async ({
    page,
  }) => {
    await page.goto("/privacy");

    await expect(page.getByRole("heading", { name: "Privacy" })).toBeVisible();
    await expect(page.getByText(/fully static/i)).toBeVisible();
    await expect(page.getByText(/IndexedDB/i)).toBeVisible();

    const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
    expect(results.violations).toEqual([]);
  });

  test("disclaimer page states the unaffiliated, as-is claim, with a clean a11y scan", async ({
    page,
  }) => {
    await page.goto("/disclaimer");

    await expect(page.getByRole("heading", { name: "Disclaimer" })).toBeVisible();
    await expect(page.getByText(/independent hobby project/i)).toBeVisible();
    await expect(page.locator("main").getByText(/GPL-3.0-or-later/)).toBeVisible();

    const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
    expect(results.violations).toEqual([]);
  });

  // #270: reachable without connecting, same as privacy/disclaimer — its
  // whole point is helping an undecided visitor judge the app before
  // they've typed anything into the connect form.
  test("about page tours the overview, venues, heatmap, and map, with a clean a11y scan", async ({
    page,
  }) => {
    await page.goto("/about");

    await expect(page.getByRole("heading", { name: "About Movie Planner" })).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "A calendar overview of everything you've watched" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Every venue you've been to, with a count" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "A GitHub-style heatmap of your viewing habits" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Every located viewing, pinned on one map" }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Connect your own CalDAV server" }),
    ).toHaveAttribute("href", "/");

    const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
    expect(results.violations).toEqual([]);
  });
});
