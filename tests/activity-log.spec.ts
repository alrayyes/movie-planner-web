import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import { mockCaldavServer } from "./support/mock-caldav";

const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

const CREDENTIALS = {
  "caldav-url": "https://caldav.example.com/calendars/me/movies/",
  "caldav-username": "me",
  "caldav-password": "secret",
};

const DUNE = {
  uid: "dune-uid",
  title: "Dune",
  start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
  end: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000 + 2.5 * 60 * 60 * 1000).toISOString(),
  medium: "cinema",
};

async function connect(page: Page) {
  await page.goto("/");
  await page.locator("#caldav-url").fill(CREDENTIALS["caldav-url"]);
  await page.locator("#caldav-username").fill(CREDENTIALS["caldav-username"]);
  await page.locator("#caldav-password").fill(CREDENTIALS["caldav-password"]);
  await page.getByRole("button", { name: "Connect" }).click();
  await expect(page.getByRole("status").first()).toBeVisible();
}

test.describe("activity log", () => {
  test("says nothing recorded yet, with a clean a11y scan, before any action", async ({ page }) => {
    mockCaldavServer(page, CREDENTIALS["caldav-url"], []);
    await connect(page);

    await page.goto("/activity");
    await expect(page.getByText("Nothing recorded yet")).toBeVisible();

    const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
    expect(results.violations).toEqual([]);
  });

  test("records logging a new viewing", async ({ page }) => {
    mockCaldavServer(page, CREDENTIALS["caldav-url"], []);
    await connect(page);
    await page.getByRole("link", { name: "Log a viewing" }).click();

    await page.locator("#log-title").fill("Paddington");
    await page.locator("#log-date").fill("2026-02-01");
    await page.locator("#log-start-time").fill("18:00");
    await page.locator("#log-end-time").fill("19:40");
    await page.locator("#log-medium").fill("netflix");
    await page.getByRole("button", { name: "Log viewing" }).click();
    await expect(page.getByRole("status")).toHaveText("Logged.");

    await page.goto("/activity");
    await expect(page.getByText("1 entry")).toBeVisible();
    const row = page.locator("tbody tr");
    await expect(row).toContainText("Created");
    await expect(row).toContainText("Paddington");
  });

  test("records an edit with the field-level before/after values, and a delete", async ({
    page,
  }) => {
    mockCaldavServer(page, CREDENTIALS["caldav-url"], [DUNE]);
    await connect(page);
    await page.getByRole("link", { name: "Dune", exact: true }).click();

    await page.getByRole("button", { name: "Edit" }).click();
    await page.locator("#details-venue").fill("Grand Vista Cinema");
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByRole("status")).toHaveText("Saved.");

    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "Delete" }).click();
    await expect(page.getByRole("status")).toHaveText("Deleted.");

    await page.goto("/activity");
    await expect(page.getByText("2 entries")).toBeVisible();
    const rows = page.locator("tbody tr");
    // Most recent first: the delete, then the edit.
    await expect(rows.nth(0)).toContainText("Deleted");
    await expect(rows.nth(0)).toContainText("Dune");
    await expect(rows.nth(1)).toContainText("Updated");
    await expect(rows.nth(1)).toContainText("venue");
    await expect(rows.nth(1)).toContainText("Grand Vista Cinema");
  });

  test("the Activity link is reachable from the nav once connected", async ({ page }) => {
    mockCaldavServer(page, CREDENTIALS["caldav-url"], []);
    await connect(page);
    await expect(page.getByRole("link", { name: "Activity" })).toBeVisible();
  });
});
