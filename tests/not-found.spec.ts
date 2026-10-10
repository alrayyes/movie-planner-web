import { expect, test } from "@playwright/test";

// The Worker serves dist/ as static assets. Without `not_found_handling` in
// wrangler.jsonc an unknown URL gets Cloudflare's bare response, not our page.
test("an unknown URL returns 404 with the app's own page", async ({ page }) => {
  const response = await page.goto("/no/such/page");

  expect(response?.status()).toBe(404);
  await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
  await page.getByRole("link", { name: "Back to the calendar" }).click();
  await expect(page).toHaveURL("/");
});

test("a real page still returns 200", async ({ page }) => {
  const response = await page.goto("/privacy");

  expect(response?.status()).toBe(200);
});
