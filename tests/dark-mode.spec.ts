import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import { mockCaldavServer } from "./support/mock-caldav";

const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

const CREDENTIALS = {
  "caldav-url": "https://caldav.example.com/calendars/me/movies/",
  "caldav-username": "me",
  "caldav-password": "secret",
};

async function connectInDarkMode(page: Page) {
  mockCaldavServer(page, CREDENTIALS["caldav-url"], []);
  await page.goto("/");
  await page.getByRole("switch").click();
  await page.locator("#caldav-url").fill(CREDENTIALS["caldav-url"]);
  await page.locator("#caldav-username").fill(CREDENTIALS["caldav-username"]);
  await page.locator("#caldav-password").fill(CREDENTIALS["caldav-password"]);
  await page.getByRole("button", { name: "Connect" }).click();
  await expect(page.getByRole("link", { name: "Settings" })).toBeVisible();
}

test.describe("dark mode", () => {
  test("follows the OS preference by default when no choice is stored", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await page.goto("/");
    await expect(page.locator("html")).toHaveClass(/dark/);
    await expect(page.getByRole("switch")).toHaveAttribute("aria-checked", "true");
  });

  test("defaults to light when the OS prefers light", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "light" });
    await page.goto("/");
    await expect(page.locator("html")).not.toHaveClass(/dark/);
    await expect(page.getByRole("switch")).toHaveAttribute("aria-checked", "false");
  });

  test("toggling switches the theme and persists across reload, overriding the OS preference", async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: "light" });
    await page.goto("/");
    await expect(page.locator("html")).not.toHaveClass(/dark/);

    await page.getByRole("switch").click();
    await expect(page.locator("html")).toHaveClass(/dark/);

    // The stored explicit choice, not the OS preference, wins on reload —
    // still emulating "light" here to prove that.
    await page.reload();
    await expect(page.locator("html")).toHaveClass(/dark/);
    await expect(page.getByRole("switch")).toHaveAttribute("aria-checked", "true");

    await page.getByRole("switch").click();
    await expect(page.locator("html")).not.toHaveClass(/dark/);
    await page.reload();
    await expect(page.locator("html")).not.toHaveClass(/dark/);
  });

  test("axe scan is clean in dark mode — credentials form", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("switch").click();
    await expect(page.locator("html")).toHaveClass(/dark/);

    const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
    expect(results.violations).toEqual([]);
  });

  test("axe scan is clean in dark mode — log form", async ({ page }) => {
    await connectInDarkMode(page);
    await page.getByRole("link", { name: "Log a viewing" }).click();
    await expect(page.locator("html")).toHaveClass(/dark/);

    const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
    expect(results.violations).toEqual([]);
  });

  test("axe scan is clean in dark mode — settings screen", async ({ page }) => {
    await connectInDarkMode(page);
    await page.goto("/settings");
    await expect(page.locator("html")).toHaveClass(/dark/);

    const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
    expect(results.violations).toEqual([]);
  });
});
