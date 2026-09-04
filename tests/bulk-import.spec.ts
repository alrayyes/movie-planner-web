import { expect, type Page, test } from "@playwright/test";
import { mockCaldavServer } from "./support/mock-caldav";

const CREDENTIALS = {
  "caldav-url": "https://caldav.example.com/calendars/me/movies/",
  "caldav-username": "me",
  "caldav-password": "secret",
};

const CSV_TWO_MOVIES = `title,date,start_time,end_time,medium,venue,imdb_url
Paddington,2026-02-01,18:00,19:40,netflix,,
Paddington in Peru,2026-02-15,18:00,19:45,netflix,,
`;

async function connect(page: Page) {
  await page.goto("/");
  await page.locator("#caldav-url").fill(CREDENTIALS["caldav-url"]);
  await page.locator("#caldav-username").fill(CREDENTIALS["caldav-username"]);
  await page.locator("#caldav-password").fill(CREDENTIALS["caldav-password"]);
  await page.getByRole("button", { name: "Connect" }).click();
  await page.getByRole("link", { name: "Import" }).click();
}

test.describe("CSV/JSON import", () => {
  test("uploads a CSV file and creates a CalDAV event for each valid row", async ({ page }) => {
    const server = mockCaldavServer(page, CREDENTIALS["caldav-url"], []);
    await connect(page);

    await page.locator("#import-file").setInputFiles({
      name: "movies.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(CSV_TWO_MOVIES),
    });
    await expect(page.getByRole("row", { name: /Paddington/ }).first()).toBeVisible();

    await page.getByRole("button", { name: "Import checked rows" }).click();

    await expect(page.getByRole("status")).toHaveText("Imported 2, skipped 0, failed 0.");
    expect(server.creates).toHaveLength(2);
  });
});

test.describe("duplicate detection", () => {
  test("flags a row matching the existing calendar and requires confirmation", async ({ page }) => {
    const server = mockCaldavServer(page, CREDENTIALS["caldav-url"], [
      {
        uid: "existing-uid",
        title: "Paddington",
        start: "2026-02-01T18:00:00.000Z",
        end: "2026-02-01T19:40:00.000Z",
        medium: "netflix",
      },
    ]);
    await connect(page);

    await page.locator("#import-file").setInputFiles({
      name: "movies.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(CSV_TWO_MOVIES),
    });

    // Row 1 ("Paddington" on 2026-02-01) matches the existing entry
    // exactly — that's the duplicate. Row 2 ("Paddington in Peru" on
    // 2026-02-15) is a different title on a different day, not a
    // duplicate of anything.
    const duplicateRow = page.locator("tbody tr").filter({ hasText: "2026-02-01" });
    await expect(duplicateRow.getByRole("checkbox")).not.toBeChecked();

    // Confirm without checking the duplicate's box.
    await page.getByRole("button", { name: "Import checked rows" }).click();
    await expect(page.getByRole("status")).toHaveText("Imported 1, skipped 1, failed 0.");
    expect(server.creates).toHaveLength(1);
    expect(server.creates[0]?.title).toBe("Paddington in Peru");
  });

  test("a duplicate can still be imported once explicitly confirmed", async ({ page }) => {
    const server = mockCaldavServer(page, CREDENTIALS["caldav-url"], [
      {
        uid: "existing-uid",
        title: "Paddington",
        start: "2026-02-01T18:00:00.000Z",
        end: "2026-02-01T19:40:00.000Z",
        medium: "netflix",
      },
    ]);
    await connect(page);

    await page.locator("#import-file").setInputFiles({
      name: "movies.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(CSV_TWO_MOVIES),
    });

    await page.locator("tbody tr").filter({ hasText: "2026-02-01" }).getByRole("checkbox").check();
    await page.getByRole("button", { name: "Import checked rows" }).click();

    await expect(page.getByRole("status")).toHaveText("Imported 2, skipped 0, failed 0.");
    expect(server.creates).toHaveLength(2);
  });
});
