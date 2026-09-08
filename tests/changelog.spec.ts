import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

// #369: reachable without connecting, same as /about and /disclaimer —
// it's a static page, no credentials involved.
test.describe("changelog", () => {
  test("lists real releases with real entries, none of them internal-only noise", async ({
    page,
  }) => {
    await page.goto("/changelog");

    await expect(page.getByRole("heading", { name: "Changelog", level: 1 })).toBeVisible();
    // A real release this repo has shipped, with a real user-facing entry.
    await expect(page.getByText("v0.79.0")).toBeVisible();
    await expect(page.getByText(/show a map of the currently-filtered viewings/)).toBeVisible();
    // Never surfaces an internal-only scope's own entry text.
    await expect(page.getByText(/bump the bun-dependencies group/)).not.toBeVisible();
    await expect(page.getByText(/regenerate bun\.lock/)).not.toBeVisible();
  });

  test("each entry links back to its own pull request", async ({ page }) => {
    await page.goto("/changelog");

    const prLink = page.getByRole("link", { name: "#356" });
    await expect(prLink).toHaveAttribute(
      "href",
      "https://github.com/alrayyes/movie-planner-web/issues/356",
    );
  });

  test("introduces no accessibility violations", async ({ page }) => {
    await page.goto("/changelog");

    const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
    expect(results.violations).toEqual([]);
  });
});
