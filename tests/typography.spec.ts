import { expect, type Page, test } from "@playwright/test";
import { mockCaldavServer } from "./support/mock-caldav";

const CREDENTIALS = {
  "caldav-url": "https://caldav.example.com/calendars/me/movies/",
  "caldav-username": "me",
  "caldav-password": "secret",
};

async function connect(page: Page) {
  mockCaldavServer(page, CREDENTIALS["caldav-url"]);
  await page.goto("/");
  await page.locator("#caldav-url").fill(CREDENTIALS["caldav-url"]);
  await page.locator("#caldav-username").fill(CREDENTIALS["caldav-username"]);
  await page.locator("#caldav-password").fill(CREDENTIALS["caldav-password"]);
  await page.getByRole("button", { name: "Connect" }).click();
  await expect(page.getByRole("link", { name: "Settings" })).toBeVisible();
}

// #65: a UX audit flagged the implicit browser default sans stack and the
// shared 768px content column as cramped for the calendar overview and
// movie details page. This is the check the issue's own definition of
// done calls for: the computed font-family, and the wide pages actually
// rendering past the old cap on a desktop viewport.

test("body text uses the self-hosted Inter typeface, not the browser default", async ({ page }) => {
  await page.goto("/");
  const fontFamily = await page.evaluate(() => getComputedStyle(document.body).fontFamily);
  expect(fontFamily).toContain("Inter");
});

test.describe("content column width on a desktop viewport", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("the home page (calendar overview) renders past the old 768px cap", async ({ page }) => {
    await connect(page);
    const width = await page
      .locator("#page-container")
      .evaluate((el) => el.getBoundingClientRect().width);
    expect(width).toBeGreaterThan(768);
  });

  test("the movie details page renders past the old 768px cap", async ({ page }) => {
    await connect(page);
    await page.goto("/movie?uid=does-not-exist");
    const width = await page
      .locator("#page-container")
      .evaluate((el) => el.getBoundingClientRect().width);
    expect(width).toBeGreaterThan(768);
  });

  test("a form page (log) keeps the narrower, original width", async ({ page }) => {
    await connect(page);
    await page.getByRole("link", { name: "Log a viewing" }).click();
    // #177: a soft, client-side transition now — unlike a hard
    // navigation, Playwright's click() doesn't implicitly wait for it
    // to finish, so a raw evaluate() right after can still read the
    // previous page's mid-transition DOM. Wait for content unique to
    // the destination page first.
    await expect(page.getByRole("heading", { name: "Log a viewing" })).toBeVisible();
    const width = await page
      .locator("#page-container")
      .evaluate((el) => el.getBoundingClientRect().width);
    expect(width).toBeLessThanOrEqual(768);
  });
});
