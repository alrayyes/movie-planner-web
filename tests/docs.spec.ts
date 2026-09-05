import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

// #71: the Starlight-powered usage guide, mounted at /docs alongside the
// rest of this fully static app — a build-time integration, so this is a
// smoke test confirming the mount actually works and stays accessible,
// not a page-by-page content check.
test.describe("docs", () => {
  test("the docs index renders with its own navigation, not a 404", async ({ page }) => {
    await page.goto("/docs/");
    await expect(page).toHaveTitle(/Movie Planner docs/);
    await expect(page.getByRole("heading", { name: "Movie Planner docs", level: 1 })).toBeVisible();
    await expect(
      page
        .getByRole("main")
        .getByRole("link", { name: "Connecting your CalDAV server", exact: true }),
    ).toHaveAttribute("href", "/docs/connecting/");
  });

  test("a sub-page renders and links back to the index", async ({ page }) => {
    await page.goto("/docs/keyboard-shortcuts/");
    await expect(page.getByRole("heading", { name: "Keyboard shortcuts", level: 1 })).toBeVisible();
  });

  test("introduces no accessibility violations", async ({ page }) => {
    await page.goto("/docs/");
    const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
    expect(results.violations).toEqual([]);
  });

  test("the main app's own pages still render untouched", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Movie Planner" })).toBeVisible();
  });
});
