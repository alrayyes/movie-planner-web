import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import { mockCaldavServer } from "./support/mock-caldav";

const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

const CREDENTIALS = {
  "caldav-url": "https://caldav.example.com/dav.php/calendars/me/movies/",
  "caldav-username": "me",
  "caldav-password": "secret",
};

// Connecting hands off to <calendar-overview>, which loads real calendar
// data — mocked here the same way calendar-overview.spec.ts does, so these
// credentials-focused tests don't also need a real (or fake) CalDAV server
// to reach a stable, testable "connected" state.
function mockEmptyEventList(page: Page) {
  mockCaldavServer(page, CREDENTIALS["caldav-url"], []);
}

async function connect(page: Page, omdbApiKey?: string) {
  mockEmptyEventList(page);
  await page.goto("/");
  await page.locator("#caldav-url").fill(CREDENTIALS["caldav-url"]);
  await page.locator("#caldav-username").fill(CREDENTIALS["caldav-username"]);
  await page.locator("#caldav-password").fill(CREDENTIALS["caldav-password"]);
  if (omdbApiKey) {
    await page.locator("#omdb-api-key").fill(omdbApiKey);
  }
  await page.getByRole("button", { name: "Connect" }).click();
  await expect(page.getByRole("link", { name: "Settings" })).toBeVisible();
}

test.describe("first-load credentials capture", () => {
  test("shows the credentials form and nothing else when no credentials are stored", async ({
    page,
  }) => {
    await page.goto("/");

    await expect(page.locator("#caldav-url")).toBeVisible();
    await expect(page.locator("#caldav-username")).toBeVisible();
    await expect(page.locator("#caldav-password")).toBeVisible();
    await expect(page.locator("#omdb-api-key")).toBeVisible();
    await expect(page.getByRole("link", { name: "Settings" })).toHaveCount(0);

    const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
    expect(results.violations).toEqual([]);
  });

  test("a returning visitor with stored credentials skips the first-load form", async ({
    page,
  }) => {
    await connect(page);

    mockEmptyEventList(page);
    await page.reload();

    await expect(page.getByRole("link", { name: "Settings" })).toBeVisible();
    await expect(page.locator("#caldav-url")).toHaveCount(0);
  });

  test("submitting with no OMDb key set succeeds and doesn't block connecting", async ({
    page,
  }) => {
    mockEmptyEventList(page);
    await page.goto("/");
    await page.locator("#caldav-url").fill(CREDENTIALS["caldav-url"]);
    await page.locator("#caldav-username").fill(CREDENTIALS["caldav-username"]);
    await page.locator("#caldav-password").fill(CREDENTIALS["caldav-password"]);
    await expect(page.locator("#omdb-api-key")).toHaveValue("");

    await page.getByRole("button", { name: "Connect" }).click();

    await expect(page.getByRole("link", { name: "Settings" })).toBeVisible();
  });
});

test.describe("settings screen", () => {
  test("shows the visitor's current values", async ({ page }) => {
    await connect(page);

    await page.goto("/settings");

    await expect(page.locator("#caldav-username")).toHaveValue(CREDENTIALS["caldav-username"]);

    const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
    expect(results.violations).toEqual([]);
  });

  test("updating the CalDAV password overwrites the stored value", async ({ page }) => {
    await connect(page);
    await page.goto("/settings");

    await page.locator("#caldav-password").fill("a new password");
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByRole("status")).toHaveText("Saved.");

    // The credentials store is the single source every future CalDAV call
    // reads from, so confirming it holds the new value here is confirming
    // it's what the next call will use.
    await page.reload();
    await expect(page.locator("#caldav-password")).toHaveValue("a new password");
  });
});
