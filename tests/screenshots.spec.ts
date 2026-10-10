import { writeFile } from "node:fs/promises";
import { expect, type Page, test } from "@playwright/test";
import { CREDENTIALS, DUNE, PADDINGTON } from "./support/demo";
import { mockCaldavServer } from "./support/mock-caldav";

async function connect(page: Page) {
  await page.goto("/");
  await page.locator("#caldav-url").fill(CREDENTIALS["caldav-url"]);
  await page.locator("#caldav-username").fill(CREDENTIALS["caldav-username"]);
  await page.locator("#caldav-password").fill(CREDENTIALS["caldav-password"]);
  await page.getByRole("button", { name: "Connect" }).click();
  await expect(page.getByRole("button", { name: "Log a viewing" })).toBeVisible();
}

test.describe("README screenshots", () => {
  for (const mode of ["light", "dark"] as const) {
    test(`captures the overview in ${mode} mode`, async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 960 });
      await page.emulateMedia({ colorScheme: mode });
      mockCaldavServer(page, CREDENTIALS["caldav-url"], [DUNE, PADDINGTON]);
      await connect(page);

      await expect(page.locator("tbody tr")).toHaveCount(2);
      await expect(page.locator("tbody tr").first()).toContainText("Dune: Part Two");
      // Real poster images load asynchronously — wait for them so the
      // screenshot doesn't catch a half-loaded row.
      await expect(page.locator("tbody img").first()).toBeVisible();

      // The element itself, not a full-page screenshot — crops tightly to
      // the actual content instead of carrying trailing page whitespace
      // below the last row.
      const shot = await page.locator("#page-container").screenshot({
        path: `docs/screenshots/overview-${mode}.png`,
      });
      // #270: the About page's feature tour reuses this exact capture —
      // same bytes, second path, rather than a separate screenshot run —
      // so the README copy (docs/screenshots/, GitHub-rendered) and the
      // live-site copy (public/screenshots/, Astro-served) can never
      // drift apart from each other.
      await writeFile(`public/screenshots/overview-${mode}.png`, shot);
    });
  }

  for (const mode of ["light", "dark"] as const) {
    test(`captures the venues page in ${mode} mode`, async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 960 });
      await page.emulateMedia({ colorScheme: mode });
      mockCaldavServer(page, CREDENTIALS["caldav-url"], [DUNE, PADDINGTON]);
      await connect(page);

      await page.goto("/venues");
      await expect(page.getByRole("heading", { name: "Venues" })).toBeVisible();
      await expect(page.getByRole("link", { name: "Grand Vista Cinema" })).toBeVisible();

      await page.locator("#page-container").screenshot({
        path: `public/screenshots/venues-${mode}.png`,
      });
    });
  }

  for (const mode of ["light", "dark"] as const) {
    test(`captures the calendar heatmap in ${mode} mode`, async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 960 });
      await page.emulateMedia({ colorScheme: mode });
      mockCaldavServer(page, CREDENTIALS["caldav-url"], [DUNE, PADDINGTON]);
      await connect(page);

      await page.goto("/calendar");
      await expect(page.getByRole("heading", { name: "Calendar" })).toBeVisible();
      await expect(page.getByText("2 logged viewings.")).toBeVisible();

      await page.locator("#page-container").screenshot({
        path: `public/screenshots/heatmap-${mode}.png`,
      });
    });
  }

  // #269: the very first thing a brand-new visitor sees — used on
  // /docs/connecting/ (the live docs site, not the README) so "what
  // does this look like" doesn't require actually opening the app
  // first. Written straight to public/ (not docs/screenshots/, which
  // is README-only and GitHub-rendered) since this is the one Astro
  // itself needs to serve. Both modes, same reasoning as the overview
  // screenshots above — a visitor in dark mode shouldn't see a jarring
  // light-mode screenshot embedded in the docs.
  for (const mode of ["light", "dark"] as const) {
    test(`captures the first-load connect form in ${mode} mode`, async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 960 });
      await page.emulateMedia({ colorScheme: mode });
      await page.goto("/");

      await expect(page.locator("#caldav-url")).toBeVisible();

      await page.locator("#page-container").screenshot({
        path: `public/screenshots/connect-form-${mode}.png`,
      });
    });
  }
});
