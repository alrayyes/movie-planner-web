import { expect, type Page, test } from "@playwright/test";
import { mockCaldavServer } from "./support/mock-caldav";

const CREDENTIALS = {
  "caldav-url": "https://caldav.example.com/calendars/me/movies/",
  "caldav-username": "me",
  "caldav-password": "secret",
};

// Rounded to a whole second — the mock CalDAV server round-trips a
// viewing through iCalendar's own DTSTART/DTEND (second precision, no
// milliseconds) whenever it's read back, same as a real server. A
// fixture built with real sub-second milliseconds would come back from
// fetchExistingForImportCheck with them zeroed, which planUpdates would
// then (correctly) read as a genuine, if spurious, difference from a
// hand-built export row that still has the original milliseconds.
const ONE_MONTH_AGO = new Date(Math.floor((Date.now() - 30 * 24 * 60 * 60 * 1000) / 1000) * 1000);

// The calendar's own copy — LoggedViewing shape.
const DUNE = {
  uid: "dune-uid",
  title: "Dune",
  start: ONE_MONTH_AGO.toISOString(),
  end: new Date(ONE_MONTH_AGO.getTime() + 2.5 * 60 * 60 * 1000).toISOString(),
  medium: "cinema",
  venue: "Grand Vista Cinema",
  director: "Denis Villeneuve",
  actors: "Timothée Chalamet, Zendaya",
  ratingImdb: "8.0",
  genre: "Action, Adventure, Drama",
  year: "2021",
  posterUrl: "https://example.com/dune-poster.jpg",
  imdbId: "tt1160419",
};

// What "Export as JSON" would produce for DUNE — the CLI's own
// canonical snake_case field names (movie-log/export-viewings.ts).
// Built by hand here rather than by calling the export function
// (browser-side, not reachable from a Playwright test directly) so
// import tests can upload a file shaped exactly like a real export
// without depending on connect()/the overview ever having run.
const DUNE_EXPORT_ROW = {
  uid: DUNE.uid,
  title: DUNE.title,
  start: DUNE.start,
  end: DUNE.end,
  medium: DUNE.medium,
  venue: DUNE.venue,
  director: DUNE.director,
  actors: DUNE.actors,
  imdb_rating: DUNE.ratingImdb,
  genre: DUNE.genre,
  release_year: DUNE.year,
  poster_url: DUNE.posterUrl,
  imdb_url: `https://www.imdb.com/title/${DUNE.imdbId}/`,
};

async function connect(page: Page) {
  await page.goto("/");
  await page.locator("#caldav-url").fill(CREDENTIALS["caldav-url"]);
  await page.locator("#caldav-username").fill(CREDENTIALS["caldav-username"]);
  await page.locator("#caldav-password").fill(CREDENTIALS["caldav-password"]);
  await page.getByRole("button", { name: "Connect" }).click();
  await expect(page.getByRole("link", { name: "Import" })).toBeVisible();
}

test.describe("Export as JSON", () => {
  test("downloads every viewing in the whole history with every field, using the CLI's own snake_case names", async ({
    page,
  }) => {
    mockCaldavServer(page, CREDENTIALS["caldav-url"], [DUNE]);
    await connect(page);
    // Filter down to nothing shown on screen — export should still
    // cover the visitor's whole history, not this filtered view.
    await page.locator("#overview-medium").fill("netflix");
    await page.getByRole("button", { name: "Filter", exact: true }).click();
    await expect(page.locator("tbody tr")).toHaveCount(0);

    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: "Export as JSON" }).click(),
    ]);

    expect(download.suggestedFilename()).toMatch(/^movie-planner-export-\d{4}-\d{2}-\d{2}\.json$/);
    const stream = await download.createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(chunk as Buffer);
    const [row] = JSON.parse(Buffer.concat(chunks).toString("utf-8"));

    expect(row.uid).toBe("dune-uid");
    expect(row.title).toBe("Dune");
    expect(row.medium).toBe("cinema");
    expect(row.venue).toBe("Grand Vista Cinema");
    expect(row.director).toBe("Denis Villeneuve");
    expect(row.actors).toBe("Timothée Chalamet, Zendaya");
    expect(row.imdb_rating).toBe("8.0");
    expect(row.genre).toBe("Action, Adventure, Drama");
    expect(row.release_year).toBe("2021");
    expect(row.poster_url).toBe("https://example.com/dune-poster.jpg");
    expect(row.imdb_url).toBe("https://www.imdb.com/title/tt1160419/");
    expect(row.start).toBe(DUNE.start);
    expect(row.end).toBe(DUNE.end);
    expect(row.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  // #174: previously only ever offered on the overview itself, so
  // exporting from anywhere else meant navigating to "/" first.
  test("is reachable from any connected page, not just the overview", async ({ page }) => {
    mockCaldavServer(page, CREDENTIALS["caldav-url"], [DUNE]);
    await connect(page);

    await page.goto("/settings");

    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: "Export as JSON" }).click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/^movie-planner-export-\d{4}-\d{2}-\d{2}\.json$/);
  });

  test("doesn't appear before a visitor has connected", async ({ page }) => {
    await page.goto("/privacy");

    await expect(page.getByRole("button", { name: "Export as JSON" })).toHaveCount(0);
  });
});

test.describe("importing the exported format", () => {
  test("re-importing an export creates a new entry with every OMDb field intact, no OMDb call needed", async ({
    page,
  }) => {
    const server = mockCaldavServer(page, CREDENTIALS["caldav-url"], []);
    await connect(page);
    let omdbCalls = 0;
    await page.route("https://www.omdbapi.com/**", () => {
      omdbCalls++;
    });

    await page.getByRole("link", { name: "Import" }).click();
    await page.locator("#import-file").setInputFiles({
      name: "export.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify([DUNE_EXPORT_ROW])),
    });
    await expect(page.getByRole("row", { name: /Dune/ })).toBeVisible();

    await page.getByRole("button", { name: "Import checked rows" }).click();

    await expect(page.getByRole("status")).toHaveText("Imported 1, skipped 0, failed 0.");
    expect(server.creates).toHaveLength(1);
    expect(server.creates[0]?.director).toBe("Denis Villeneuve");
    expect(server.creates[0]?.posterUrl).toBe("https://example.com/dune-poster.jpg");
    expect(server.creates[0]?.imdbId).toBe("tt1160419");
    expect(omdbCalls).toBe(0);
  });

  test("a minimal-format file (no uid, no OMDb fields) keeps working exactly as before", async ({
    page,
  }) => {
    const server = mockCaldavServer(page, CREDENTIALS["caldav-url"], []);
    await connect(page);

    await page.getByRole("link", { name: "Import" }).click();
    await page.locator("#import-file").setInputFiles({
      name: "movies.json",
      mimeType: "application/json",
      buffer: Buffer.from(
        JSON.stringify([{ title: "Paddington", date: "2026-02-01", medium: "netflix" }]),
      ),
    });
    await expect(page.getByRole("row", { name: /Paddington/ })).toBeVisible();

    await page.getByRole("button", { name: "Import checked rows" }).click();

    await expect(page.getByRole("status")).toHaveText("Imported 1, skipped 0, failed 0.");
    expect(server.creates).toHaveLength(1);
  });
});

test.describe("updating an existing entry by uid", () => {
  test("shows a per-field diff and only writes the fields the visitor approved", async ({
    page,
  }) => {
    const server = mockCaldavServer(page, CREDENTIALS["caldav-url"], [DUNE]);
    await connect(page);

    const reimported = {
      ...DUNE_EXPORT_ROW,
      director: "Someone Else", // changed
      poster_url: "https://example.com/new-poster.jpg", // changed
      // venue, actors, etc. all unchanged
    };
    await page.getByRole("link", { name: "Import" }).click();
    await page.locator("#import-file").setInputFiles({
      name: "export.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify([reimported])),
    });

    await expect(page.getByRole("heading", { name: "Updates to existing entries" })).toBeVisible();
    const block = page.getByLabel("Changes for Dune");
    await expect(block).toContainText("Director: Denis Villeneuve → Someone Else");
    await expect(block).toContainText(
      "Poster: https://example.com/dune-poster.jpg → https://example.com/new-poster.jpg",
    );
    // Nothing in the "new entry" create table — this is purely an update.
    await expect(page.locator("tbody tr")).toHaveCount(0);

    // Reject the poster change, keep the director change.
    await block
      .getByText(/^Poster:/)
      .locator("..")
      .getByRole("checkbox")
      .uncheck();

    await page.getByRole("button", { name: "Import checked rows" }).click();

    await expect(page.getByRole("status")).toHaveText(
      "Imported 0, updated 1, skipped 0, failed 0.",
    );
    expect(server.creates).toHaveLength(0);
    expect(server.updates).toHaveLength(1);
    expect(server.updates[0]?.director).toBe("Someone Else");
    expect(server.updates[0]?.posterUrl).toBe("https://example.com/dune-poster.jpg");
    // Every field the row didn't touch stays exactly as it was.
    expect(server.updates[0]?.venue).toBe("Grand Vista Cinema");
    expect(server.updates[0]?.actors).toBe("Timothée Chalamet, Zendaya");
  });

  test("a uid match with no actual differences makes no request at all", async ({ page }) => {
    const server = mockCaldavServer(page, CREDENTIALS["caldav-url"], [DUNE]);
    await connect(page);

    await page.getByRole("link", { name: "Import" }).click();
    await page.locator("#import-file").setInputFiles({
      name: "export.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify([DUNE_EXPORT_ROW])),
    });

    await expect(page.getByRole("heading", { name: "Updates to existing entries" })).toHaveCount(0);
    await expect(page.getByRole("status")).toHaveText("0 new row(s) ready to review.");

    await expect(page.getByRole("button", { name: "Import checked rows" })).toHaveCount(0);
    expect(server.creates).toHaveLength(0);
    expect(server.updates).toHaveLength(0);
  });
});
