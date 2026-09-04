import { expect, test } from "@playwright/test";

test("home page renders", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle(/movie-planner-web/);
  await expect(page.getByRole("heading", { name: "movie-planner-web" })).toBeVisible();
});
