import { expect, test } from "@playwright/test";
import { mockCaldavServer } from "./support/mock-caldav";

// #932: a visitor with no credentials only ever sees the connect form, so the
// overview's code (and everything it imports) shouldn't load before the form
// can paint. Lighthouse measured 2.3 s of element render delay on that form.

const URL = "https://caldav.example.com/calendars/me/movies/";
const OVERVIEW_CHUNKS = /\/_astro\/(CalendarOverview|run-import|viewings-source)\./;

test("the connect form appears without fetching the overview's code", async ({ page }) => {
  const chunks: string[] = [];
  page.on("request", (request) => {
    if (OVERVIEW_CHUNKS.test(request.url())) chunks.push(request.url());
  });

  await page.goto("/");
  await expect(page.locator("#caldav-url")).toBeVisible();
  await page.waitForLoadState("networkidle");

  expect(chunks).toEqual([]);
});

test("submitting the form loads the overview and shows it without a reload", async ({ page }) => {
  mockCaldavServer(page, URL, [
    {
      uid: "dune-uid",
      title: "Dune",
      start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
      end: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000 + 3600000).toISOString(),
      medium: "cinema",
    },
  ]);
  await page.goto("/");
  await page.locator("#caldav-url").fill(URL);
  await page.locator("#caldav-username").fill("me");
  await page.locator("#caldav-password").fill("secret");
  await page.getByRole("button", { name: "Connect" }).click();

  await expect(page.getByRole("link", { name: "Dune", exact: true })).toBeVisible();
});

test("a returning visitor still gets the overview", async ({ page }) => {
  mockCaldavServer(page, URL, [
    {
      uid: "dune-uid",
      title: "Dune",
      start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
      end: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000 + 3600000).toISOString(),
      medium: "cinema",
    },
  ]);
  await page.goto("/");
  await page.locator("#caldav-url").fill(URL);
  await page.locator("#caldav-username").fill("me");
  await page.locator("#caldav-password").fill("secret");
  await page.getByRole("button", { name: "Connect" }).click();
  await expect(page.getByRole("link", { name: "Dune", exact: true })).toBeVisible();

  await page.reload();

  await expect(page.getByRole("link", { name: "Dune", exact: true })).toBeVisible();
});
