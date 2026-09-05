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
