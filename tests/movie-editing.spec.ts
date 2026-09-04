import { expect, type Page, test } from "@playwright/test";
import { mockCaldavServer } from "./support/mock-caldav";

const CREDENTIALS = {
  "caldav-url": "https://caldav.example.com/calendars/me/movies/",
  "caldav-username": "me",
  "caldav-password": "secret",
};

// Relative to `now`, not a fixed calendar date — the mock CalDAV server
// filters by the requested time-range like a real one would, and
// calendar-overview's default range is only the last 3 months.
const ONE_MONTH_AGO = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

const DUNE = {
  uid: "dune-uid",
  title: "Dune",
  start: ONE_MONTH_AGO.toISOString(),
  end: new Date(ONE_MONTH_AGO.getTime() + 2.5 * 60 * 60 * 1000).toISOString(),
  medium: "cinema",
  venue: "Grand Vista Cinema",
  ratingImdb: "5.0",
};

async function connect(page: Page) {
  await page.goto("/");
  await page.locator("#caldav-url").fill(CREDENTIALS["caldav-url"]);
  await page.locator("#caldav-username").fill(CREDENTIALS["caldav-username"]);
  await page.locator("#caldav-password").fill(CREDENTIALS["caldav-password"]);
  await page.getByRole("button", { name: "Connect" }).click();
}

test.describe("updating a logged viewing", () => {
  test("edits the viewing's own fields and writes the change", async ({ page }) => {
    const server = mockCaldavServer(page, CREDENTIALS["caldav-url"], [DUNE]);
    await connect(page);

    await page.getByRole("button", { name: "Edit" }).click();
    const venueInput = page.locator("#edit-dune-uid-venue");
    await expect(venueInput).toHaveValue("Grand Vista Cinema");
    await venueInput.fill("Regal Union Square");
    await page.getByRole("button", { name: "Save" }).click();

    await expect(page.getByRole("status").last()).toHaveText("Saved.");
    expect(server.updates).toHaveLength(1);
    expect(server.updates[0]?.uid).toBe("dune-uid");
    expect(server.updates[0]?.venue).toBe("Regal Union Square");
  });

  // movie-editing spec, "Update a logged viewing's own fields": OMDb-
  // sourced data isn't offered as an editable field at all — a
  // hand-typed value would drift from what OMDb actually reports, with
  // no way to tell the two apart later.
  test("doesn't offer OMDb-sourced fields (ratings, director, actors) as editable", async ({
    page,
  }) => {
    mockCaldavServer(page, CREDENTIALS["caldav-url"], [DUNE]);
    await connect(page);

    await page.getByRole("button", { name: "Edit" }).click();
    await expect(page.locator("#edit-dune-uid-ratingImdb")).toHaveCount(0);
    await expect(page.locator("#edit-dune-uid-director")).toHaveCount(0);
    await expect(page.locator("#edit-dune-uid-actors")).toHaveCount(0);
  });

  test("editing preserves the viewing's existing OMDb-sourced fields untouched", async ({
    page,
  }) => {
    const server = mockCaldavServer(page, CREDENTIALS["caldav-url"], [
      { ...DUNE, director: "Denis Villeneuve", ratingImdb: "8.0" },
    ]);
    await connect(page);

    await page.getByRole("button", { name: "Edit" }).click();
    await page.locator("#edit-dune-uid-venue").fill("Regal Union Square");
    await page.getByRole("button", { name: "Save" }).click();

    await expect(page.getByRole("status").last()).toHaveText("Saved.");
    expect(server.updates[0]?.director).toBe("Denis Villeneuve");
    expect(server.updates[0]?.ratingImdb).toBe("8.0");
  });

  test("cancel discards changes without writing", async ({ page }) => {
    const server = mockCaldavServer(page, CREDENTIALS["caldav-url"], [DUNE]);
    await connect(page);

    await page.getByRole("button", { name: "Edit" }).click();
    await page.locator("#edit-dune-uid-title").fill("Something else entirely");
    await page.getByRole("button", { name: "Cancel" }).click();

    await expect(page.getByRole("button", { name: "Edit" })).toBeVisible();
    expect(server.updates).toHaveLength(0);
  });
});

test.describe("deleting a logged viewing", () => {
  test("asks for confirmation before removing the event", async ({ page }) => {
    const server = mockCaldavServer(page, CREDENTIALS["caldav-url"], [DUNE]);
    await connect(page);

    page.once("dialog", (dialog) => dialog.dismiss());
    await page.getByRole("button", { name: "Delete" }).click();

    // Dismissed — nothing should have been deleted.
    await page.waitForTimeout(100);
    expect(server.deletes).toHaveLength(0);
  });

  test("removes the event once confirmed", async ({ page }) => {
    const server = mockCaldavServer(page, CREDENTIALS["caldav-url"], [DUNE]);
    await connect(page);

    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "Delete" }).click();

    await expect(page.getByRole("status").last()).toHaveText("Deleted.");
    expect(server.deletes).toHaveLength(1);
    expect(server.deletes[0]).toBe("dune-uid");
  });
});
