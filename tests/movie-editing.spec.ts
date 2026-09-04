import { expect, type Page, type Route, test } from "@playwright/test";

const CREDENTIALS = {
  "caldav-url": "https://caldav.example.com/calendars/me/movies/",
  "caldav-username": "me",
  "caldav-password": "secret",
};

const DUNE = {
  uid: "dune-uid",
  title: "Dune",
  start: "2026-01-01T19:00:00.000Z",
  end: "2026-01-01T21:30:00.000Z",
  medium: "cinema",
  venue: "Grand Vista Cinema",
  ratingImdb: "5.0",
};

function mockEventList(page: Page, viewings: unknown[]) {
  page.route("**/api/caldav/events/list", async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(viewings),
    });
  });
}

function trackUpdatesAndDeletes(page: Page) {
  const updates: unknown[] = [];
  const deletes: unknown[] = [];
  page.route("**/api/caldav/events/update", async (route: Route) => {
    const body = route.request().postDataJSON();
    updates.push(body);
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ uid: body.uid, ...body.viewing }),
    });
  });
  page.route("**/api/caldav/events/delete", async (route: Route) => {
    deletes.push(route.request().postDataJSON());
    await route.fulfill({ status: 204, body: "" });
  });
  return { updates, deletes };
}

async function connect(page: Page) {
  await page.goto("/");
  await page.locator("#caldav-url").fill(CREDENTIALS["caldav-url"]);
  await page.locator("#caldav-username").fill(CREDENTIALS["caldav-username"]);
  await page.locator("#caldav-password").fill(CREDENTIALS["caldav-password"]);
  await page.getByRole("button", { name: "Connect" }).click();
}

test.describe("updating a logged viewing", () => {
  test("corrects a mismatched OMDb rating and writes the change", async ({ page }) => {
    mockEventList(page, [DUNE]);
    await connect(page);
    const { updates } = trackUpdatesAndDeletes(page);

    await page.getByRole("button", { name: "Edit" }).click();
    const ratingInput = page.locator("#edit-dune-uid-ratingImdb");
    await expect(ratingInput).toHaveValue("5.0");
    await ratingInput.fill("8.0");
    await page.getByRole("button", { name: "Save" }).click();

    await expect(page.getByRole("status").last()).toHaveText("Saved.");
    expect(updates).toHaveLength(1);
    const [update] = updates as { uid: string; viewing: { ratingImdb?: string } }[];
    expect(update.uid).toBe("dune-uid");
    expect(update.viewing.ratingImdb).toBe("8.0");
  });

  test("cancel discards changes without writing", async ({ page }) => {
    mockEventList(page, [DUNE]);
    await connect(page);
    const { updates } = trackUpdatesAndDeletes(page);

    await page.getByRole("button", { name: "Edit" }).click();
    await page.locator("#edit-dune-uid-title").fill("Something else entirely");
    await page.getByRole("button", { name: "Cancel" }).click();

    await expect(page.getByRole("button", { name: "Edit" })).toBeVisible();
    expect(updates).toHaveLength(0);
  });
});

test.describe("deleting a logged viewing", () => {
  test("asks for confirmation before removing the event", async ({ page }) => {
    mockEventList(page, [DUNE]);
    await connect(page);
    const { deletes } = trackUpdatesAndDeletes(page);

    page.once("dialog", (dialog) => dialog.dismiss());
    await page.getByRole("button", { name: "Delete" }).click();

    // Dismissed — nothing should have been deleted.
    await page.waitForTimeout(100);
    expect(deletes).toHaveLength(0);
  });

  test("removes the event once confirmed", async ({ page }) => {
    mockEventList(page, [DUNE]);
    await connect(page);
    const { deletes } = trackUpdatesAndDeletes(page);

    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "Delete" }).click();

    await expect(page.getByRole("status").last()).toHaveText("Deleted.");
    expect(deletes).toHaveLength(1);
    const [request] = deletes as { uid: string }[];
    expect(request.uid).toBe("dune-uid");
  });
});
