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
  await expect(page.getByRole("link", { name: "Map" })).toBeVisible();
}

// #237: a static preview of the real feature (#8/#203) ahead of
// movie-planner's own GEO-coordinate support — no real data to load, so
// no mock CalDAV fixtures beyond what connect() itself needs.
test.describe("map placeholder", () => {
  test("shows a themed placeholder with a sample pin and an explanation", async ({ page }) => {
    mockCaldavServer(page, CREDENTIALS["caldav-url"], []);
    await connect(page);

    await page.goto("/map");

    await expect(page.getByRole("heading", { name: "Map" })).toBeVisible();
    await expect(page.getByText("Sample pin")).toBeVisible();
    await expect(page.getByText(/not a real venue/)).toBeVisible();
    await expect(
      page.getByRole("link", { name: "movie-planner's own CLI doesn't support surfacing yet" }),
    ).toHaveAttribute("href", "https://github.com/alrayyes/movie-planner/issues/170");
  });

  test("reachable from the site nav", async ({ page }) => {
    mockCaldavServer(page, CREDENTIALS["caldav-url"], []);
    await connect(page);

    await page.getByRole("link", { name: "Map" }).click();
    await expect(page.getByRole("heading", { name: "Map" })).toBeVisible();
  });

  test("introduces no accessibility violations", async ({ page }) => {
    mockCaldavServer(page, CREDENTIALS["caldav-url"], []);
    await connect(page);

    await page.goto("/map");
    await expect(page.getByRole("heading", { name: "Map" })).toBeVisible();

    const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
    expect(results.violations).toEqual([]);
  });
});
