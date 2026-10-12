import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import type { LoggedViewing } from "../src/lib/caldav/types";
import { mockCaldavServer } from "./support/mock-caldav";

// #835: Settings' Danger zone deletes every viewing on the calendar, behind a
// typed confirmation.

const CALDAV_URL = "https://caldav.example.com/calendars/me/movies/";
const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

const viewing = (uid: string, title: string): LoggedViewing => ({
  uid,
  title,
  start: "2026-09-20T17:30:00Z",
  end: "2026-09-20T19:45:00Z",
  medium: "cinema",
});

test.use({ timezoneId: "UTC" });

async function connect(page: Page) {
  await page.goto("/");
  await page.locator("#caldav-url").fill(CALDAV_URL);
  await page.locator("#caldav-username").fill("me");
  await page.locator("#caldav-password").fill("secret-password-value");
  await page.getByRole("button", { name: "Connect" }).click();
  await expect(page.getByRole("button", { name: "Log a viewing" })).toBeVisible();
}

const purge = (page: Page) => page.locator("purge-calendar-button");

test.describe("purging the calendar from Settings", () => {
  test("deletes every viewing once the word is typed, and says how many", async ({ page }) => {
    const server = mockCaldavServer(page, CALDAV_URL, [
      viewing("a", "Dune"),
      viewing("b", "Anora"),
      viewing("c", "Heat"),
    ]);
    await connect(page);
    await expect(page.locator("tbody tr")).toHaveCount(3);

    await page.goto("/settings");
    await purge(page).getByRole("button", { name: "Purge calendar…" }).click();
    const confirm = purge(page).getByRole("button", { name: "Permanently delete all viewings" });
    await expect(confirm).toBeDisabled();
    await page.getByLabel(/type DELETE/).fill("delete me");
    await expect(confirm).toBeDisabled();
    await page.getByLabel(/type DELETE/).fill("DELETE");
    await confirm.click();

    await expect(purge(page).getByRole("status")).toHaveText("Deleted 3 viewings.");
    expect(server.deletes.sort()).toEqual(["a", "b", "c"]);

    await page.goto("/");
    await expect(page.locator("tbody tr")).toHaveCount(0);
  });

  test("cancelling deletes nothing", async ({ page }) => {
    const server = mockCaldavServer(page, CALDAV_URL, [viewing("a", "Dune")]);
    await connect(page);
    await page.goto("/settings");
    await purge(page).getByRole("button", { name: "Purge calendar…" }).click();
    await page.getByLabel(/type DELETE/).fill("DELETE");
    await purge(page).getByRole("button", { name: "Cancel" }).click();
    await expect(purge(page).getByRole("button", { name: "Purge calendar…" })).toBeVisible();
    expect(server.deletes).toEqual([]);
  });

  test("passes the axe-core scan, idle and armed", async ({ page }) => {
    mockCaldavServer(page, CALDAV_URL, [viewing("a", "Dune")]);
    await connect(page);
    await page.goto("/settings");
    await expect(purge(page).getByRole("button", { name: "Purge calendar…" })).toBeVisible();
    expect((await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze()).violations).toEqual([]);
    await purge(page).getByRole("button", { name: "Purge calendar…" }).click();
    expect((await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze()).violations).toEqual([]);
  });
});
