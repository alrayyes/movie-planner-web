import { expect, test } from "@playwright/test";

test("home page renders", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle(/Movie Planner/);

  // #439: the header brand link already reads "Movie Planner" (Layout.astro),
  // so the page's own H1 must not repeat that text visibly. It's kept for
  // document structure/screen-reader navigation, sr-only rather than removed
  // outright — Playwright's own toBeVisible() can't tell a sr-only heading
  // from a normal one (its clipped box still has a non-empty 1x1px bounding
  // rect), so the check has to be the class, not visibility.
  await expect(page.getByRole("heading", { name: "Movie Planner" })).toHaveClass(/sr-only/);

  // The description paragraph is the first visible content under the header.
  await expect(page.getByText("A public web client for", { exact: false })).toBeVisible();
});
