import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

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
});
