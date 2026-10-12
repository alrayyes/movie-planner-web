import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import { mockCaldavServer } from "./support/mock-caldav";

const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

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
  // #436: "Log a viewing" is the header button present on every connected
  // page — wait for it before navigating directly, or credentials aren't
  // stored yet and movie-import-form's connectedCallback throws on an
  // empty store.
  await expect(page.getByRole("button", { name: "Log a viewing" })).toBeVisible();
  // Import moved to the Settings hub, so landing on it directly stands in
  // for that nav click.
  await page.goto("/import");
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

    const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
    expect(results.violations).toEqual([]);

    await page.getByRole("button", { name: "Import checked rows" }).click();

    await expect(page.getByRole("status")).toHaveText("Imported 2, skipped 0, failed 0.");
    expect(server.creates).toHaveLength(2);
  });
});

test.describe("the import page before choosing a file", () => {
  // #843
  test("names the calendar it will write to, without the password", async ({ page }) => {
    mockCaldavServer(page, CREDENTIALS["caldav-url"], []);
    await connect(page);
    const form = page.locator("movie-import-form");
    await expect(form).toContainText(CREDENTIALS["caldav-url"]);
    await expect(form).toContainText("as me");
    await expect(form).not.toContainText(CREDENTIALS["caldav-password"]);
    await expect(form.getByRole("link", { name: "Download a sample CSV" })).toHaveAttribute(
      "download",
      "movie-planner-sample.csv",
    );
  });

  test("says there's nowhere to import to when no calendar is connected", async ({ page }) => {
    await page.goto("/import");
    const alert = page.locator("movie-import-form").getByRole("alert");
    await expect(alert).toContainText("No calendar is connected");
    await expect(alert.getByRole("link", { name: "Connect your CalDAV calendar" })).toHaveAttribute(
      "href",
      "/",
    );
  });

  test("turns away a file that isn't CSV or JSON, before reading it", async ({ page }) => {
    const server = mockCaldavServer(page, CREDENTIALS["caldav-url"], []);
    await connect(page);
    await page.locator("#import-file").setInputFiles({
      name: "movies.ics",
      mimeType: "text/calendar",
      buffer: Buffer.from("BEGIN:VCALENDAR"),
    });
    await expect(page.getByRole("status")).toHaveText("movies.ics isn't a .csv or .json file.");
    expect(server.creates).toHaveLength(0);
  });

  test("accepts a file dropped on the dropzone", async ({ page }) => {
    mockCaldavServer(page, CREDENTIALS["caldav-url"], []);
    await connect(page);
    const dataTransfer = await page.evaluateHandle((csv) => {
      const transfer = new DataTransfer();
      transfer.items.add(new File([csv], "movies.csv", { type: "text/csv" }));
      return transfer;
    }, CSV_TWO_MOVIES);
    await page.locator("#import-file").locator("..").dispatchEvent("drop", { dataTransfer });
    await expect(page.getByRole("row", { name: /Paddington/ }).first()).toBeVisible();
  });

  test("passes the axe-core scan with the dropzone", async ({ page }) => {
    mockCaldavServer(page, CREDENTIALS["caldav-url"], []);
    await connect(page);
    const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
    expect(results.violations).toEqual([]);
  });
});

const LETTERBOXD_DIARY = `Date,Name,Year,Letterboxd URI,Rating,Rewatch,Tags,Watched Date
2026-03-02,Dune: Part Two,2024,https://boxd.it/abc1,4.5,,"imax, epic",2026-03-01
2026-03-05,Anora,2024,https://boxd.it/abc2,,Yes,,2026-03-04
`;

test.describe("a Letterboxd diary", () => {
  // #844
  test("asks for a medium, then imports each entry on the date it was watched", async ({
    page,
  }) => {
    const server = mockCaldavServer(page, CREDENTIALS["caldav-url"], []);
    await connect(page);
    await page.locator("#import-file").setInputFiles({
      name: "diary.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(LETTERBOXD_DIARY),
    });
    await expect(page.getByRole("status")).toContainText("Letterboxd diary");
    await expect(page.getByRole("row", { name: /Anora/ })).toHaveCount(0);

    await page.getByLabel("Medium for these viewings").fill("cinema");
    await page.getByLabel("Medium for these viewings").press("Tab");
    await expect(page.getByRole("row", { name: /Anora/ }).first()).toBeVisible();
    await page.getByRole("button", { name: "Import checked rows" }).click();

    await expect(page.getByRole("status")).toHaveText("Imported 2, skipped 0, failed 0.");
    expect(server.creates.map((v) => v.title).sort()).toEqual(["Anora", "Dune: Part Two"]);
    expect(server.creates.every((v) => v.medium === "cinema")).toBe(true);
  });

  test("doesn't ask for a medium on this app's own format", async ({ page }) => {
    mockCaldavServer(page, CREDENTIALS["caldav-url"], []);
    await connect(page);
    await page.locator("#import-file").setInputFiles({
      name: "movies.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(CSV_TWO_MOVIES),
    });
    await expect(page.getByRole("row", { name: /Paddington/ }).first()).toBeVisible();
    await expect(page.getByLabel("Medium for these viewings")).toBeHidden();
  });
});

const IMDB_RATINGS = `Const,Your Rating,Date Rated,Title,Original Title,URL,Title Type,IMDb Rating,Runtime (mins),Year,Genres,Num Votes,Release Date,Directors
tt15239678,9,2026-03-01,Dune: Part Two,Dune: Part Two,https://www.imdb.com/title/tt15239678/,movie,8.5,166,2024,"Action, Adventure, Drama",600000,2024-02-27,Denis Villeneuve
`;

test.describe("an IMDb ratings export", () => {
  // #844
  test("asks for a medium, then imports each rating on the day it was rated", async ({ page }) => {
    const server = mockCaldavServer(page, CREDENTIALS["caldav-url"], []);
    await connect(page);
    await page.locator("#import-file").setInputFiles({
      name: "ratings.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(IMDB_RATINGS),
    });
    await expect(page.getByRole("status")).toContainText("IMDb ratings export");
    await expect(page.getByRole("status")).toContainText("the day you rated the title");

    await page.getByLabel("Medium for these viewings").fill("netflix");
    await page.getByLabel("Medium for these viewings").press("Tab");
    await expect(page.getByRole("row", { name: /Dune: Part Two/ }).first()).toBeVisible();
    await expect(page.getByRole("row", { name: /2026-03-01/ })).toBeVisible();
    await page.getByRole("button", { name: "Import checked rows" }).click();

    await expect(page.getByRole("status")).toHaveText("Imported 1, skipped 0, failed 0.");
    expect(server.creates[0]).toMatchObject({ title: "Dune: Part Two", medium: "netflix" });
  });
});

test.describe("a busy CalDAV server", () => {
  // #842: a 429 means "slow down", not "this row is bad".
  test("waits out a 429 and still imports the row", async ({ page }) => {
    const server = mockCaldavServer(page, CREDENTIALS["caldav-url"], []);
    let refused = 0;
    await page.route(/\.ics$/, async (route) => {
      if (route.request().method() === "PUT" && refused++ === 0) {
        await route.fulfill({ status: 429, body: "" });
        return;
      }
      await route.fallback();
    });
    await connect(page);
    await page.locator("#import-file").setInputFiles({
      name: "movies.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(CSV_TWO_MOVIES),
    });
    await page.getByRole("button", { name: "Import checked rows" }).click();

    await expect(page.getByRole("status")).toHaveText("Imported 2, skipped 0, failed 0.");
    expect(server.creates).toHaveLength(2);
    expect(refused).toBe(3);
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
