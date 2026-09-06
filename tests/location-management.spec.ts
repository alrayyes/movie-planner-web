import { expect, type Page, test } from "@playwright/test";
import type { LoggedViewing, Picklists } from "../src/lib/caldav/types";
import { mockCaldavServer } from "./support/mock-caldav";

const CREDENTIALS = {
  "caldav-url": "https://caldav.example.com/calendars/me/movies/",
  "caldav-username": "me",
  "caldav-password": "secret",
};

async function connect(
  page: Page,
  initialPicklists?: Picklists,
  initialViewings: LoggedViewing[] = [],
) {
  const server = mockCaldavServer(
    page,
    CREDENTIALS["caldav-url"],
    initialViewings,
    initialPicklists,
  );
  await page.goto("/");
  await page.locator("#caldav-url").fill(CREDENTIALS["caldav-url"]);
  await page.locator("#caldav-username").fill(CREDENTIALS["caldav-username"]);
  await page.locator("#caldav-password").fill(CREDENTIALS["caldav-password"]);
  await page.getByRole("button", { name: "Connect" }).click();
  await expect(page.getByRole("link", { name: "Log a viewing" })).toBeVisible();
  return server;
}

test.describe("location-management", () => {
  test("offers a previously-added venue as a choice on the log form", async ({ page }) => {
    await connect(page, { media: ["cinema"], venues: ["Grand Vista Cinema"] });
    await page.getByRole("link", { name: "Log a viewing" }).click();

    const venueInput = page.locator("#log-venue");
    const listId = await venueInput.getAttribute("list");
    expect(listId).toBeTruthy();
    const options = page.locator(`#${listId} option`);
    await expect(options).toContainText(["Grand Vista Cinema"]);
  });

  test("logging with a new venue adds it to the sidecar picklist", async ({ page }) => {
    const server = await connect(page, { media: [], venues: [] });
    await page.getByRole("link", { name: "Log a viewing" }).click();

    await page.locator("#log-title").fill("Dune");
    await page.locator("#log-date").fill("2026-01-01");
    await page.locator("#log-start-time").fill("19:00");
    await page.locator("#log-end-time").fill("21:30");
    await page.locator("#log-medium").fill("cinema");
    await page.locator("#log-venue").fill("Grand Vista Cinema");
    await page.getByRole("button", { name: "Log viewing" }).click();

    await expect(page.getByRole("status")).toHaveText("Logged.");
    await expect.poll(() => server.picklists.venues).toContain("Grand Vista Cinema");
    expect(server.picklists.media).toContain("cinema");

    // The new venue is now offered as a choice without a reload.
    const listId = await page.locator("#log-venue").getAttribute("list");
    await expect(page.locator(`#${listId} option`)).toContainText(["Grand Vista Cinema"]);
  });

  // #98
  test("offers a previously-added venue as a choice when editing on the details page", async ({
    page,
  }) => {
    const oneMonthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const dune: LoggedViewing = {
      uid: "dune-uid",
      title: "Dune",
      start: oneMonthAgo.toISOString(),
      end: new Date(oneMonthAgo.getTime() + 2.5 * 60 * 60 * 1000).toISOString(),
      medium: "cinema",
      venue: "Grand Vista Cinema",
    };
    await connect(
      page,
      { media: ["cinema"], venues: ["Grand Vista Cinema", "Regal Union Square"] },
      [dune],
    );
    await page.getByRole("link", { name: "Dune", exact: true }).click();
    await page.getByRole("button", { name: "Edit" }).click();

    const venueInput = page.locator("#details-venue");
    const listId = await venueInput.getAttribute("list");
    expect(listId).toBeTruthy();
    const options = page.locator(`#${listId} option`);
    await expect(options).toContainText(["Grand Vista Cinema", "Regal Union Square"]);
  });
});
