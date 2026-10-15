import { expect, test } from "@playwright/test";
import { mockCaldavServer } from "./support/mock-caldav";

// #920: the wizard is a dialog behind one button, so its code (and the venue
// picker and Nominatim client it pulls in) loads on the first click, not on
// every page.

const URL = "https://caldav.example.com/calendars/me/movies/";
const WIZARD_CHUNKS = /\/_astro\/(LogViewingWizard|VenuePicker|nominatim)\./;

async function connect(page: import("@playwright/test").Page) {
  mockCaldavServer(page, URL, []);
  await page.goto("/");
  await page.locator("#caldav-url").fill(URL);
  await page.locator("#caldav-username").fill("me");
  await page.locator("#caldav-password").fill("secret");
  await page.getByRole("button", { name: "Connect" }).click();
  await expect(page.getByRole("button", { name: "Log a viewing" })).toBeVisible();
}

test("a page load doesn't fetch the wizard, its venue picker or Nominatim", async ({ page }) => {
  const chunks: string[] = [];
  page.on("request", (request) => {
    if (WIZARD_CHUNKS.test(request.url())) chunks.push(request.url());
  });

  await connect(page);
  await page.reload();
  await expect(page.getByRole("button", { name: "Log a viewing" })).toBeVisible();
  await page.waitForLoadState("networkidle");

  expect(chunks).toEqual([]);
});

test("the first click loads the wizard and opens it, and later clicks reopen the same one", async ({
  page,
}) => {
  await connect(page);
  const button = page.getByRole("button", { name: "Log a viewing" });
  const dialog = page.getByRole("dialog", { name: "Log a viewing" });

  await button.click();
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();

  await button.click();
  await expect(dialog).toBeVisible();
  await expect(page.locator("dialog[aria-label='Log a viewing']")).toHaveCount(1);
});

test("a double click opens one wizard", async ({ page }) => {
  await connect(page);

  await page.getByRole("button", { name: "Log a viewing" }).dblclick();

  await expect(page.getByRole("dialog", { name: "Log a viewing" })).toBeVisible();
  await expect(page.locator("dialog[aria-label='Log a viewing']")).toHaveCount(1);
});

test("the wizard still opens after navigating to another page with the router", async ({
  page,
}) => {
  await connect(page);
  await page.getByRole("button", { name: "Log a viewing" }).click();
  await expect(page.getByRole("dialog", { name: "Log a viewing" })).toBeVisible();
  await page.keyboard.press("Escape");

  await page.getByRole("link", { name: "Venues" }).click();
  await expect(page.getByRole("heading", { name: "Venues" })).toBeVisible();
  await page.getByRole("button", { name: "Log a viewing" }).click();

  await expect(page.getByRole("dialog", { name: "Log a viewing" })).toBeVisible();
  await expect(page.locator("dialog[aria-label='Log a viewing']")).toHaveCount(1);
});
