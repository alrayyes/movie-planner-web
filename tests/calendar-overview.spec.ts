import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, type Route, test } from "@playwright/test";
import { mockCaldavServer } from "./support/mock-caldav";

const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

const CREDENTIALS = {
  "caldav-url": "https://caldav.example.com/calendars/me/movies/",
  "caldav-username": "me",
  "caldav-password": "secret",
};

// Relative to `now` rather than fixed calendar dates, so the fixtures stay
// inside the component's own "last 3 months" default window regardless of
// when the suite runs — DUNE ~1 month back, PADDINGTON ~2 months back, both
// inside the default; a cutoff ~45 days back (below) separates them for
// the explicit-range tests. Plain day-based arithmetic, not setMonth —
// setMonth's fractional-month handling is unreliable, and calendar months
// vary in length anyway.
function daysAgo(n: number): Date {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000);
}
const ONE_MONTH_AGO = daysAgo(30);
const TWO_MONTHS_AGO = daysAgo(60);
const CUTOFF = daysAgo(45);

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
  ratingRottenTomatoes: "83%",
  ratingMetacritic: "74",
  genre: "Action, Adventure, Drama",
  year: "2021",
  posterUrl: "https://example.com/dune-poster.jpg",
  imdbId: "tt1160419",
};

const PADDINGTON = {
  uid: "paddington-uid",
  title: "Paddington",
  start: TWO_MONTHS_AGO.toISOString(),
  end: new Date(TWO_MONTHS_AGO.getTime() + 1.5 * 60 * 60 * 1000).toISOString(),
  medium: "netflix",
};

function toDateInputValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// #59: PAGE_SIZE (calendar-overview.ts) is 25 — one more than that forces
// a second page without a magic number repeated in both places.
function manyViewings(count: number, medium = "cinema") {
  return Array.from({ length: count }, (_, i) => ({
    uid: `viewing-${i}`,
    title: `Movie ${String(i).padStart(2, "0")}`,
    start: daysAgo(i).toISOString(),
    end: new Date(daysAgo(i).getTime() + 60 * 60 * 1000).toISOString(),
    medium,
  }));
}

async function connect(page: Page) {
  await page.goto("/");
  await page.locator("#caldav-url").fill(CREDENTIALS["caldav-url"]);
  await page.locator("#caldav-username").fill(CREDENTIALS["caldav-username"]);
  await page.locator("#caldav-password").fill(CREDENTIALS["caldav-password"]);
  await page.getByRole("button", { name: "Connect" }).click();
  // Credential storage is async — wait for its result to actually
  // render before doing anything else, so a test that navigates away
  // (a full page.goto, not just waiting on an element) right after
  // connect() isn't racing the write (same pattern every other spec
  // file's own connect() helper already uses).
  await expect(page.getByRole("status").first()).toBeVisible();
}

test.describe("calendar overview", () => {
  test("defaults to most-recently-watched first", async ({ page }) => {
    // PADDINGTON (2 months back) is older than DUNE (1 month back) —
    // seeded in that order so the assertion actually proves sorting
    // happened rather than just preserving fixture/response order.
    mockCaldavServer(page, CREDENTIALS["caldav-url"], [PADDINGTON, DUNE]);
    await connect(page);

    const rows = page.locator("tbody tr");
    await expect(rows).toHaveCount(2);
    await expect(rows.nth(0)).toContainText("Dune");
    await expect(rows.nth(1)).toContainText("Paddington");
  });

  test("renders its own columns for a logged viewing, and leaves the rest to the details page", async ({
    page,
  }) => {
    mockCaldavServer(page, CREDENTIALS["caldav-url"], [DUNE]);
    await connect(page);

    const row = page.locator("tbody tr");
    await expect(row).toContainText("Dune (2021)");
    await expect(row).toContainText("Grand Vista Cinema");
    await expect(row.locator("img")).toHaveAttribute("src", DUNE.posterUrl);
    // #64/#166: a UX audit flagged the old h-16 (64px) thumbnail as too
    // small to recognize a poster by, and #166 grew it again from h-32
    // (128px) to h-40 (160px) — this asserts the fix actually rendered
    // large enough, not just that a size class changed name.
    const posterBox = await row.locator("img").boundingBox();
    expect(posterBox?.height).toBeGreaterThanOrEqual(150);
    // #38/#93: director/actors/genre/ratings/medium live on the details
    // page (one click away via the title link), not as their own
    // overview columns — that's what keeps this table to a fixed,
    // narrow column count that fits a phone screen without horizontal
    // scroll.
    await expect(row).not.toContainText("Denis Villeneuve");
    await expect(row).not.toContainText("Action, Adventure, Drama");
    await expect(row).not.toContainText("cinema");
    // #93: editing/deleting also moved to the details page.
    await expect(row.getByRole("button", { name: "Edit" })).toHaveCount(0);
    await expect(row.getByRole("button", { name: "Delete" })).toHaveCount(0);

    const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
    expect(results.violations).toEqual([]);
  });

  // #133
  test("the poster thumbnail links to the details page, same as the title", async ({ page }) => {
    mockCaldavServer(page, CREDENTIALS["caldav-url"], [DUNE]);
    await connect(page);

    await page.locator("tbody tr img").click();

    await expect(page).toHaveURL(/\/movie\/?\?uid=dune-uid/);
    await expect(page.getByRole("heading", { name: "Dune (2021)" })).toBeVisible();
  });

  test("cross-links the title out to IMDb, Rotten Tomatoes and Letterboxd", async ({ page }) => {
    mockCaldavServer(page, CREDENTIALS["caldav-url"], [DUNE]);
    await connect(page);

    const row = page.locator("tbody tr");
    await expect(row.getByRole("link", { name: "IMDb" })).toHaveAttribute(
      "href",
      "https://www.imdb.com/title/tt1160419/",
    );
    await expect(row.getByRole("link", { name: "RT" })).toHaveAttribute(
      "href",
      "https://www.rottentomatoes.com/search?search=Dune",
    );
    await expect(row.getByRole("link", { name: "Letterboxd" })).toHaveAttribute(
      "href",
      "https://letterboxd.com/search/Dune/",
    );
  });

  test("omits the IMDb link (but still shows the search links) without an imdbId", async ({
    page,
  }) => {
    mockCaldavServer(page, CREDENTIALS["caldav-url"], [PADDINGTON]);
    await connect(page);

    const row = page.locator("tbody tr");
    await expect(row.getByRole("link", { name: "IMDb" })).toHaveCount(0);
    await expect(row.getByRole("link", { name: "RT" })).toBeVisible();
    await expect(row.getByRole("link", { name: "Letterboxd" })).toBeVisible();
  });

  test("filters to a date range by re-querying the CalDAV server", async ({ page }) => {
    mockCaldavServer(page, CREDENTIALS["caldav-url"], [DUNE, PADDINGTON]);
    await connect(page);

    await expect(page.locator("tbody tr")).toHaveCount(2);

    await page.locator("#overview-from").fill(toDateInputValue(CUTOFF));
    await page.locator("#overview-to").fill(toDateInputValue(new Date()));
    await page.getByRole("button", { name: "Filter", exact: true }).click();

    await expect(page.locator("tbody tr")).toHaveCount(1);
    await expect(page.locator("tbody tr")).toContainText("Dune");
  });

  test("filters by medium client-side, over whatever the date range already returned", async ({
    page,
  }) => {
    const server = mockCaldavServer(page, CREDENTIALS["caldav-url"], [DUNE, PADDINGTON]);
    await connect(page);
    await expect(page.locator("tbody tr")).toHaveCount(2);

    await page.locator("#overview-medium").fill("cinema");
    await page.getByRole("button", { name: "Filter", exact: true }).click();

    await expect(page.locator("tbody tr")).toHaveCount(1);
    await expect(page.locator("tbody tr")).toContainText("Dune");
    // Medium isn't part of the CalDAV query — both requests carry the same
    // (unchanged, to-the-day) default date range, confirming the medium
    // filter is applied to the response rather than sent to the server.
    expect(server.listRequests).toHaveLength(2);
    expect(server.listRequests[0]?.from.toDateString()).toBe(
      server.listRequests[1]?.from.toDateString(),
    );
    expect(server.listRequests[0]?.to.toDateString()).toBe(
      server.listRequests[1]?.to.toDateString(),
    );
  });

  // #140: sourced from the union of the location-management picklist and
  // whatever medium values are actually on the loaded viewings — a
  // CLI-logged medium never typed into this app's log form is still real
  // data worth suggesting, same reasoning as #116's venue-count fix.
  test("offers medium autocomplete from the picklist and from loaded viewings", async ({
    page,
  }) => {
    mockCaldavServer(page, CREDENTIALS["caldav-url"], [DUNE, PADDINGTON], {
      media: ["blu-ray"],
      venues: [],
    });
    await connect(page);

    const options = await page
      .locator("#overview-medium-choices option")
      .evaluateAll((els) => els.map((el) => el.getAttribute("value")));
    expect(options.sort()).toEqual(["blu-ray", "cinema", "netflix"]);
    await expect(page.locator("#overview-medium")).toHaveAttribute(
      "list",
      "overview-medium-choices",
    );
  });

  // #131
  test("filters by venue client-side, over whatever the date range already returned", async ({
    page,
  }) => {
    const server = mockCaldavServer(page, CREDENTIALS["caldav-url"], [DUNE, PADDINGTON]);
    await connect(page);
    await expect(page.locator("tbody tr")).toHaveCount(2);

    await page.locator("#overview-venue").fill("Grand Vista Cinema");
    await page.getByRole("button", { name: "Filter", exact: true }).click();

    await expect(page.locator("tbody tr")).toHaveCount(1);
    await expect(page.locator("tbody tr")).toContainText("Dune");
    // Venue isn't part of the CalDAV query either, same as medium.
    expect(server.listRequests[0]?.from.toDateString()).toBe(
      server.listRequests[1]?.from.toDateString(),
    );
  });

  test("a ?venue= query param pre-populates the venue filter on load", async ({ page }) => {
    mockCaldavServer(page, CREDENTIALS["caldav-url"], [DUNE, PADDINGTON]);
    await connect(page);

    await page.goto("/?venue=Grand%20Vista%20Cinema");

    await expect(page.locator("#overview-venue")).toHaveValue("Grand Vista Cinema");
    await expect(page.locator("tbody tr")).toHaveCount(1);
    await expect(page.locator("tbody tr")).toContainText("Dune");
  });

  // #146: a link carrying only `venue` used to still fall back to this
  // page's own ~3-month default window, hiding anything older even
  // though the venues page's count (over its own much wider window)
  // said it should be there.
  test("?from= and ?to= query params pre-populate the date range on load, not just venue", async ({
    page,
  }) => {
    const fiveYearsAgo = daysAgo(5 * 365);
    mockCaldavServer(page, CREDENTIALS["caldav-url"], [
      {
        uid: "old-uid",
        title: "An Old Favourite",
        start: fiveYearsAgo.toISOString(),
        end: new Date(fiveYearsAgo.getTime() + 60 * 60 * 1000).toISOString(),
        medium: "cinema",
        venue: "Grand Vista Cinema",
      },
    ]);
    await connect(page);

    const from = toDateInputValue(daysAgo(5 * 365 + 5));
    const to = toDateInputValue(daysAgo(0));
    await page.goto(`/?venue=Grand%20Vista%20Cinema&from=${from}&to=${to}`);

    await expect(page.locator("#overview-from")).toHaveValue(from);
    await expect(page.locator("#overview-to")).toHaveValue(to);
    await expect(page.locator("tbody tr")).toHaveCount(1);
    await expect(page.locator("tbody tr")).toContainText("An Old Favourite");
  });

  test("sends the visitor's own stored credentials, not anyone else's", async ({ page }) => {
    const server = mockCaldavServer(page, CREDENTIALS["caldav-url"], [DUNE]);
    await connect(page);
    await expect(page.locator("tbody tr")).toHaveCount(1);

    expect(server.authHeaders[0]).toBe(
      `Basic ${Buffer.from(`${CREDENTIALS["caldav-username"]}:${CREDENTIALS["caldav-password"]}`).toString("base64")}`,
    );
  });

  test("defaults to roughly the last 3 months", async ({ page }) => {
    const server = mockCaldavServer(page, CREDENTIALS["caldav-url"], []);
    await connect(page);
    await expect(page.getByRole("status").first()).toHaveText("0 logged viewings.");

    const from = server.listRequests[0]?.from as Date;
    const now = new Date();
    const expectedFrom = new Date(now);
    expectedFrom.setMonth(now.getMonth() - 3);

    // Within a day of "3 months back" — allows for the test run's own clock
    // drift against the fixed default computed inside the component.
    expect(Math.abs(from.getTime() - expectedFrom.getTime())).toBeLessThan(24 * 60 * 60 * 1000);
  });

  test("clear filter resets the date range, medium and venue, and reloads", async ({ page }) => {
    const server = mockCaldavServer(page, CREDENTIALS["caldav-url"], [DUNE, PADDINGTON]);
    await connect(page);
    await expect(page.locator("tbody tr")).toHaveCount(2);

    await page.locator("#overview-from").fill(toDateInputValue(CUTOFF));
    await page.locator("#overview-to").fill(toDateInputValue(new Date()));
    await page.locator("#overview-medium").fill("cinema");
    await page.locator("#overview-venue").fill("Grand Vista Cinema");
    await page.getByRole("button", { name: "Filter", exact: true }).click();
    await expect(page.locator("tbody tr")).toHaveCount(1);

    await page.getByRole("button", { name: "Clear filter" }).click();

    await expect(page.locator("#overview-from")).toHaveValue("");
    await expect(page.locator("#overview-to")).toHaveValue("");
    await expect(page.locator("#overview-medium")).toHaveValue("");
    await expect(page.locator("#overview-venue")).toHaveValue("");
    await expect(page.locator("tbody tr")).toHaveCount(2);

    const lastRequest = server.listRequests.at(-1);
    expect(lastRequest?.from.toDateString()).not.toBe(CUTOFF.toDateString());
  });

  test("paginates when there are more logged viewings than fit on one page", async ({ page }) => {
    mockCaldavServer(page, CREDENTIALS["caldav-url"], manyViewings(30));
    await connect(page);

    await expect(page.locator("tbody tr")).toHaveCount(25);
    await expect(page.getByText("Page 1 of 2")).toBeVisible();
    await expect(page.getByRole("button", { name: "Previous page" })).toBeDisabled();

    await page.getByRole("button", { name: "Next page" }).click();

    await expect(page.locator("tbody tr")).toHaveCount(5);
    await expect(page.getByText("Page 2 of 2")).toBeVisible();
    await expect(page.getByRole("button", { name: "Next page" })).toBeDisabled();

    await page.getByRole("button", { name: "Previous page" }).click();
    await expect(page.locator("tbody tr")).toHaveCount(25);
  });

  test("no pagination controls appear when everything fits on one page", async ({ page }) => {
    mockCaldavServer(page, CREDENTIALS["caldav-url"], [DUNE, PADDINGTON]);
    await connect(page);

    await expect(page.getByRole("button", { name: "Next page" })).toHaveCount(0);
  });

  test("changing the filter resets pagination to the first page", async ({ page }) => {
    mockCaldavServer(page, CREDENTIALS["caldav-url"], manyViewings(30));
    await connect(page);

    await page.getByRole("button", { name: "Next page" }).click();
    await expect(page.getByText("Page 2 of 2")).toBeVisible();

    await page.locator("#overview-medium").fill("cinema");
    await page.getByRole("button", { name: "Filter", exact: true }).click();

    await expect(page.getByText("Page 1 of 2")).toBeVisible();
    await expect(page.locator("tbody tr")).toHaveCount(25);
  });

  // #76: a landscape or square source poster used to squeeze into
  // whatever width the table column happened to have while height stayed
  // fixed (h-32 w-auto) — the resulting box's aspect ratio depended on
  // the table's own layout, not the intended poster shape, and matched
  // neither the source image nor a normal portrait poster. A fixed
  // aspect-ratio box + object-cover renders every source shape as the
  // same predictable poster-shaped box instead.
  test("crops the poster to a consistent poster-shaped box regardless of the source image's aspect ratio", async ({
    page,
  }) => {
    const svg = (w: number, h: number) =>
      `data:image/svg+xml;base64,${Buffer.from(
        `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="100%" height="100%"/></svg>`,
      ).toString("base64")}`;
    mockCaldavServer(page, CREDENTIALS["caldav-url"], [
      { ...DUNE, uid: "portrait", posterUrl: svg(300, 445) },
      { ...PADDINGTON, uid: "landscape", posterUrl: svg(800, 300) },
    ]);
    await connect(page);

    const images = page.locator("tbody tr img");
    await expect(images).toHaveCount(2);
    for (let i = 0; i < 2; i++) {
      const box = await images.nth(i).boundingBox();
      // A normal poster-shaped box (portrait, not extreme) — the
      // landscape source above is 2.67 on its own and the previous,
      // table-squeezed implementation measured 0.35, so this range only
      // holds once the box itself is a fixed size rather than derived
      // from the source image or the table's own column layout.
      const ratio = (box?.width ?? 0) / (box?.height ?? 1);
      expect(ratio).toBeGreaterThan(0.5);
      expect(ratio).toBeLessThan(0.8);
    }
  });

  // #79: a viewing logged by the movie-planner CLI carries its ratings
  // and links as DESCRIPTION text, not this app's own X-* properties —
  // this proves the whole pipeline (REPORT response -> parse -> render)
  // shows that data without ever calling OMDb, not just the parser in
  // isolation (already covered in ical.test.ts).
  test("shows metadata from a CLI-logged viewing's DESCRIPTION, with no OMDb call", async ({
    page,
  }) => {
    mockCaldavServer(page, CREDENTIALS["caldav-url"], []);
    let omdbCalls = 0;
    await page.route("https://www.omdbapi.com/**", async (route: Route) => {
      omdbCalls++;
      await route.fulfill({ status: 200, body: "" });
    });
    const cliVEvent = [
      "BEGIN:VCALENDAR",
      "BEGIN:VEVENT",
      "UID:cli-uid",
      "SUMMARY:Dune: Part Two",
      "DTSTART:20260101T190000Z",
      "DTEND:20260101T213000Z",
      "DESCRIPTION:IMDb: 8.5/10 (https://www.imdb.com/title/tt1160419/)\\nRotten Tomatoes: 91%\\nLetterboxd: https://letterboxd.com/film/dune-part-two/ (4.2)",
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n");
    // Overrides mockCaldavServer's own REPORT handling — registered
    // after it, so this one wins.
    await page.route(`${CREDENTIALS["caldav-url"]}**`, async (route: Route) => {
      if (route.request().method() !== "REPORT") return route.fallback();
      await route.fulfill({
        status: 207,
        contentType: "application/xml",
        body: `<D:multistatus xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav"><D:response><D:propstat><D:prop><C:calendar-data>${cliVEvent
          .replace(/&/g, "&amp;")
          .replace(
            /</g,
            "&lt;",
          )}</C:calendar-data></D:prop></D:propstat></D:response></D:multistatus>`,
      });
    });

    await connect(page);

    const row = page.locator("tbody tr");
    await expect(row).toContainText("Dune: Part Two");
    await expect(row.getByRole("link", { name: "IMDb" })).toHaveAttribute(
      "href",
      "https://www.imdb.com/title/tt1160419/",
    );
    await expect(row.getByRole("link", { name: "Letterboxd" })).toHaveAttribute(
      "href",
      "https://letterboxd.com/film/dune-part-two/",
    );
    expect(omdbCalls).toBe(0);
  });
});
