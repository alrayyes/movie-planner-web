import { expect, type Page, test } from "@playwright/test";
import { mockCaldavServer } from "./support/mock-caldav";

const CREDENTIALS = {
  "caldav-url": "https://caldav.example.com/calendars/me/movies/",
  "caldav-username": "me",
  "caldav-password": "secret",
};

const MONTH_AGO = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
const DUNE = {
  uid: "dune-uid",
  title: "Dune",
  start: MONTH_AGO.toISOString(),
  end: new Date(MONTH_AGO.getTime() + 2 * 60 * 60 * 1000).toISOString(),
  medium: "cinema",
};

async function connect(page: Page) {
  await page.goto("/");
  await page.locator("#caldav-url").fill(CREDENTIALS["caldav-url"]);
  await page.locator("#caldav-username").fill(CREDENTIALS["caldav-username"]);
  await page.locator("#caldav-password").fill(CREDENTIALS["caldav-password"]);
  await page.getByRole("button", { name: "Connect" }).click();
  await expect(page.getByRole("button", { name: "Log a viewing" })).toBeVisible();
}

async function logPaddingtonFromWizard(page: Page) {
  await page.getByRole("button", { name: "Log a viewing" }).click();
  const dialog = page.getByRole("dialog", { name: "Log a viewing" });
  await page.locator("#wizard-title").fill("Paddington");
  await dialog.getByRole("button", { name: "Next" }).click();
  await page.locator("#wizard-date").fill(new Date().toISOString().slice(0, 10));
  await dialog.getByRole("button", { name: "Log viewing" }).click();
  await expect(dialog).toBeHidden();
}

// #960: the header wizard sits apart from the page, so a list on that page
// has to hear about a saved viewing to show it without a reload.
test.describe("a viewing logged from the header wizard shows on the page behind it", () => {
  test("the calendar heatmap counts it", async ({ page }) => {
    mockCaldavServer(page, CREDENTIALS["caldav-url"], [DUNE]);
    await connect(page);
    await page.goto("/calendar");
    await expect(page.getByRole("status").first()).toHaveText("1 logged viewing.");

    await logPaddingtonFromWizard(page);

    await expect(page.getByRole("status").first()).toHaveText("2 logged viewings.");
  });

  test("the mediums list counts it", async ({ page }) => {
    mockCaldavServer(page, CREDENTIALS["caldav-url"], [DUNE]);
    await connect(page);
    await page.goto("/mediums");
    await expect(page.locator("tbody tr").first()).toContainText("1");

    await logPaddingtonFromWizard(page);

    await expect(page.locator("tbody tr").first()).toContainText("2");
  });

  test("the missing-data list includes it", async ({ page }) => {
    mockCaldavServer(page, CREDENTIALS["caldav-url"], [DUNE]);
    await connect(page);
    await page.goto("/missing-data");
    await expect(page.getByText("Paddington")).toHaveCount(0);

    await logPaddingtonFromWizard(page);

    await expect(page.getByText("Paddington").first()).toBeVisible();
  });
});
