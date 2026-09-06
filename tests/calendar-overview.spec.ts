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
// well inside the component's own wide default range (#188, importCheckRange's
// 15-years-back window) regardless of when the suite runs — DUNE ~1 month
// back, PADDINGTON ~2 months back; a cutoff ~45 days back (below) separates
// them for the explicit-range tests. Plain day-based arithmetic, not
// setMonth — setMonth's fractional-month handling is unreliable, and
// calendar months vary in length anyway.
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

// #221: the filter fields sit inside a <details>, closed by default —
// every test that fills or submits one needs it open first, same as a
// visitor would click "Filters" before typing into it.
async function openFilters(page: Page) {
  await page.getByText("Filters", { exact: true }).click();
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

  // #169
  test("clicking a column header sorts by it, and clicking again reverses", async ({ page }) => {
    mockCaldavServer(page, CREDENTIALS["caldav-url"], [PADDINGTON, DUNE]);
    await connect(page);
    const rows = page.locator("tbody tr");

    await page.getByRole("button", { name: "Title" }).click();
    await expect(rows.nth(0)).toContainText("Dune");
    await expect(rows.nth(1)).toContainText("Paddington");

    await page.getByRole("button", { name: "Title" }).click();
    await expect(rows.nth(0)).toContainText("Paddington");
    await expect(rows.nth(1)).toContainText("Dune");

    await page.getByRole("button", { name: "Venue" }).click();
    // DUNE has a venue, PADDINGTON doesn't — empty values sort first
    // ascending, matching plain string comparison.
    await expect(rows.nth(0)).toContainText("Paddington");
    await expect(rows.nth(1)).toContainText("Dune");

    await page.getByRole("button", { name: "When" }).click();
    // Back to ascending by watch date — Paddington (2 months back) is
    // older than Dune (1 month back).
    await expect(rows.nth(0)).toContainText("Paddington");
    await expect(rows.nth(1)).toContainText("Dune");
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
    // #298: reversed #93's own removal — Edit/Delete are back as
    // icon-only controls, each with a real accessible name.
    await expect(row.getByRole("link", { name: "Edit Dune" })).toHaveAttribute(
      "href",
      "/movie?uid=dune-uid&edit=1",
    );
    await expect(row.getByRole("button", { name: "Delete Dune" })).toBeVisible();

    const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
    expect(results.violations).toEqual([]);
  });

  // #298
  test("the Edit icon opens the details page with its edit form already open", async ({ page }) => {
    mockCaldavServer(page, CREDENTIALS["caldav-url"], [DUNE]);
    await connect(page);

    await page.getByRole("link", { name: "Edit Dune" }).click();

    await expect(page).toHaveURL(/\/movie\/?\?uid=dune-uid&edit=1/);
    await expect(page.getByRole("button", { name: "Save" })).toBeVisible();
  });

  test("the Delete icon asks for confirmation, then removes the row without a full page navigation", async ({
    page,
  }) => {
    const server = mockCaldavServer(page, CREDENTIALS["caldav-url"], [DUNE, PADDINGTON]);
    await connect(page);
    await expect(page.locator("tbody tr")).toHaveCount(2);

    page.once("dialog", (dialog) => dialog.dismiss());
    await page.getByRole("button", { name: "Delete Dune" }).click();
    await page.waitForTimeout(100);
    expect(server.deletes).toHaveLength(0);
    await expect(page.locator("tbody tr")).toHaveCount(2);

    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "Delete Dune" }).click();

    await expect(page.getByText("Deleted.")).toBeVisible();
    expect(server.deletes).toEqual(["dune-uid"]);
    await expect(page.locator("tbody tr")).toHaveCount(1);
    await expect(page).toHaveURL("/");
  });

  // #236
  test("shows a placeholder graphic instead of an empty gap when a viewing has no poster", async ({
    page,
  }) => {
    mockCaldavServer(page, CREDENTIALS["caldav-url"], [PADDINGTON]);
    await connect(page);

    const row = page.locator("tbody tr");
    await expect(row.getByRole("img", { name: "No poster available" })).toBeVisible();
    await expect(row.locator("img")).toHaveCount(0);

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

  // #193: brand marks stand in for the visible label, but the link's own
  // accessible name stays the plain text — every test above keeps working
  // unmodified because of it, so this one just confirms the icon itself
  // renders rather than plain text sitting there instead.
  test("shows the IMDb/RT/Letterboxd cross-links as brand icons, not plain text labels", async ({
    page,
  }) => {
    mockCaldavServer(page, CREDENTIALS["caldav-url"], [DUNE]);
    await connect(page);

    const row = page.locator("tbody tr");
    const imdbLink = row.getByRole("link", { name: "IMDb" });
    await expect(imdbLink).toBeVisible();
    await expect(imdbLink.locator("svg")).toBeVisible();
    // The label text is still in the DOM (it's the link's accessible
    // name), but only inside a visually-hidden span, not as the link's
    // own directly-visible content.
    await expect(imdbLink.locator("span.sr-only")).toHaveText("IMDb");
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

    await openFilters(page);
    await page.locator("#overview-from").fill(toDateInputValue(CUTOFF));
    await page.locator("#overview-to").fill(toDateInputValue(new Date()));
    await page.getByRole("button", { name: "Filter", exact: true }).click();

    await expect(page.locator("tbody tr")).toHaveCount(1);
    await expect(page.locator("tbody tr")).toContainText("Dune");
  });

  // A real intermittent-CORS-looking failure was traced to this: two
  // REPORT requests racing (a slow one still in flight when a second one
  // starts) left the browser cancelling one mid-response, which some
  // browsers surface as a bare, unhelpful CORS-shaped error rather than
  // a clean cancellation. reload() now aborts its own previous in-flight
  // request before starting a new one, rather than letting two race —
  // proven here by making the two requests return genuinely different
  // data, so a stale response winning is actually observable rather
  // than both happening to agree.
  test("a reload triggered while the previous one is still in flight aborts the stale one, not both", async ({
    page,
  }) => {
    const server = mockCaldavServer(page, CREDENTIALS["caldav-url"], [DUNE, PADDINGTON]);
    let reportCount = 0;
    let releaseFirst: (() => void) | undefined;
    const firstReleased = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    await page.route(`${new URL(CREDENTIALS["caldav-url"]).origin}/**`, async (route) => {
      if (route.request().method() === "REPORT") {
        reportCount += 1;
        if (reportCount === 1) await firstReleased;
      }
      await route.fallback();
    });

    await connect(page);
    // The initial mount's own reload() (the wide default range, matching
    // both DUNE and PADDINGTON) is now the deliberately-stalled first
    // REPORT above. Narrow the date range to one that only matches DUNE
    // before triggering the second (superseding) reload — so the two
    // requests' own results genuinely differ, and only releasing the
    // first one *after* the second already resolved proves whether the
    // stale one still clobbers the fresh one.
    await openFilters(page);
    await page.locator("#overview-from").fill(toDateInputValue(CUTOFF));
    await page.locator("#overview-to").fill(toDateInputValue(new Date()));
    await page.getByRole("button", { name: "Filter", exact: true }).click();
    await expect(page.locator("tbody tr")).toHaveCount(1);
    await expect(page.locator("tbody tr")).toContainText("Dune");

    releaseFirst?.();
    // Give the stale first response a moment to resolve and, if it were
    // still wired up, clobber the correct state above.
    await page.waitForTimeout(200);

    await expect(page.locator("tbody tr")).toHaveCount(1);
    await expect(page.locator("tbody tr")).toContainText("Dune");
    await expect(page.getByText(/Failed to load/i)).toHaveCount(0);
    expect(server.listRequests.length).toBeGreaterThanOrEqual(2);
  });

  test("filters by medium client-side, over whatever the date range already returned", async ({
    page,
  }) => {
    const server = mockCaldavServer(page, CREDENTIALS["caldav-url"], [DUNE, PADDINGTON]);
    await connect(page);
    await expect(page.locator("tbody tr")).toHaveCount(2);

    await openFilters(page);
    await page.locator("#overview-medium").fill("cinema");
    await page.getByRole("button", { name: "Filter", exact: true }).click();

    await expect(page.locator("tbody tr")).toHaveCount(1);
    await expect(page.locator("tbody tr")).toContainText("Dune");
    // Medium isn't part of the CalDAV query — clicking Filter just
    // re-sends whatever date range the fields already show (by now
    // auto-populated to the real first/last viewing dates, #188),
    // confirming the medium filter itself is applied to the response
    // rather than sent to the server.
    expect(server.listRequests).toHaveLength(2);
    expect(server.listRequests[1]?.from.toDateString()).toBe(TWO_MONTHS_AGO.toDateString());
    expect(server.listRequests[1]?.to.toDateString()).toBe(ONE_MONTH_AGO.toDateString());
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

  // #179
  test("offers venue, actor and genre autocomplete too", async ({ page }) => {
    mockCaldavServer(page, CREDENTIALS["caldav-url"], [DUNE, PADDINGTON], {
      media: [],
      venues: ["Regal Union Square"],
    });
    await connect(page);

    const venueOptions = await page
      .locator("#overview-venue-choices option")
      .evaluateAll((els) => els.map((el) => el.getAttribute("value")));
    expect(venueOptions.sort()).toEqual(["Grand Vista Cinema", "Regal Union Square"]);
    await expect(page.locator("#overview-venue")).toHaveAttribute("list", "overview-venue-choices");

    const directorOptions = await page
      .locator("#overview-director-choices option")
      .evaluateAll((els) => els.map((el) => el.getAttribute("value")));
    expect(directorOptions).toEqual(["Denis Villeneuve"]);
    await expect(page.locator("#overview-director")).toHaveAttribute(
      "list",
      "overview-director-choices",
    );

    const actorOptions = await page
      .locator("#overview-actor-choices option")
      .evaluateAll((els) => els.map((el) => el.getAttribute("value")));
    expect(actorOptions.sort()).toEqual(["Timothée Chalamet", "Zendaya"]);
    await expect(page.locator("#overview-actor")).toHaveAttribute("list", "overview-actor-choices");

    const genreOptions = await page
      .locator("#overview-genre-choices option")
      .evaluateAll((els) => els.map((el) => el.getAttribute("value")));
    expect(genreOptions.sort()).toEqual(["Action", "Adventure", "Drama"]);
    await expect(page.locator("#overview-genre")).toHaveAttribute("list", "overview-genre-choices");
  });

  // #131
  test("filters by venue client-side, over whatever the date range already returned", async ({
    page,
  }) => {
    const server = mockCaldavServer(page, CREDENTIALS["caldav-url"], [DUNE, PADDINGTON]);
    await connect(page);
    await expect(page.locator("tbody tr")).toHaveCount(2);

    await openFilters(page);
    await page.locator("#overview-venue").fill("Grand Vista Cinema");
    await page.getByRole("button", { name: "Filter", exact: true }).click();

    await expect(page.locator("tbody tr")).toHaveCount(1);
    await expect(page.locator("tbody tr")).toContainText("Dune");
    // Venue isn't part of the CalDAV query either, same as medium — the
    // second request just carries the auto-populated real date range.
    expect(server.listRequests[1]?.from.toDateString()).toBe(TWO_MONTHS_AGO.toDateString());
    expect(server.listRequests[1]?.to.toDateString()).toBe(ONE_MONTH_AGO.toDateString());
  });

  // #289: substring, case-insensitive — not exact match like venue/
  // medium, since a title is free text.
  test("filters by title client-side, matching a partial substring", async ({ page }) => {
    mockCaldavServer(page, CREDENTIALS["caldav-url"], [DUNE, PADDINGTON]);
    await connect(page);
    await expect(page.locator("tbody tr")).toHaveCount(2);

    await openFilters(page);
    await page.locator("#overview-title").fill("dun");
    await page.getByRole("button", { name: "Filter", exact: true }).click();

    await expect(page.locator("tbody tr")).toHaveCount(1);
    await expect(page.locator("tbody tr")).toContainText("Dune");
  });

  test("the title field offers autocomplete drawn from logged titles", async ({ page }) => {
    mockCaldavServer(page, CREDENTIALS["caldav-url"], [DUNE, PADDINGTON]);
    await connect(page);
    await openFilters(page);

    await expect(page.locator("#overview-title-choices option")).toHaveCount(2);
    await expect(page.locator("#overview-title")).toHaveAttribute("list", "overview-title-choices");
  });

  test("a ?venue= query param pre-populates the venue filter on load", async ({ page }) => {
    mockCaldavServer(page, CREDENTIALS["caldav-url"], [DUNE, PADDINGTON]);
    await connect(page);

    await page.goto("/?venue=Grand%20Vista%20Cinema");

    await expect(page.locator("#overview-venue")).toHaveValue("Grand Vista Cinema");
    await expect(page.locator("tbody tr")).toHaveCount(1);
    await expect(page.locator("tbody tr")).toContainText("Dune");
    // #221: a query param means the visitor is clearly already filtering
    // — the section opens automatically rather than hiding the very
    // filter that's currently applied.
    await expect(page.locator("#overview-venue")).toBeVisible();
  });

  // #221
  test("the filter section is closed by default, open only when a filter is already active", async ({
    page,
  }) => {
    mockCaldavServer(page, CREDENTIALS["caldav-url"], [DUNE, PADDINGTON]);
    await connect(page);

    await expect(page.getByRole("button", { name: "Filter", exact: true })).toBeHidden();
    await expect(page.locator("#overview-venue")).toBeHidden();

    await openFilters(page);
    await expect(page.getByRole("button", { name: "Filter", exact: true })).toBeVisible();
    await expect(page.locator("#overview-venue")).toBeVisible();
  });

  // #221: a real regression — submitting the form (any filter, any
  // reload) used to silently re-close the section a visitor had just
  // opened themselves, right after they used it.
  test("the filter section stays open after submitting a filter", async ({ page }) => {
    mockCaldavServer(page, CREDENTIALS["caldav-url"], [DUNE, PADDINGTON]);
    await connect(page);

    await openFilters(page);
    await page.locator("#overview-medium").fill("cinema");
    await page.getByRole("button", { name: "Filter", exact: true }).click();

    await expect(page.locator("tbody tr")).toHaveCount(1);
    await expect(page.locator("#overview-medium")).toBeVisible();
  });

  // #292: confirmed via a real repro — filtering, opening a title, then
  // going Back closed the filter panel and reset every field, because
  // this page remounts fresh (a plain custom element mounting a fresh
  // Svelte instance, not a persisted Astro island) against a bare "/"
  // with nothing in `location.search` to restore from. Fixed by
  // mirroring the active filter into sessionStorage on submit, which
  // survives that remount regardless of how it was triggered — a raw
  // history.replaceState() was tried first and rejected: it bypasses
  // astro:transitions' own history bookkeeping, which then restored
  // stale content (the previous page) on the very next Back.
  test("the filter survives navigating to a title's details page and back", async ({ page }) => {
    mockCaldavServer(page, CREDENTIALS["caldav-url"], [DUNE, PADDINGTON]);
    await connect(page);

    await openFilters(page);
    await page.locator("#overview-title").fill("Dune");
    await page.getByRole("button", { name: "Filter", exact: true }).click();
    await expect(page.locator("tbody tr")).toHaveCount(1);

    await page.getByRole("link", { name: "Dune" }).first().click();
    await expect(page).toHaveURL(/\/movie/);
    await page.goBack();
    await expect(page).toHaveURL("/");

    await expect(page.locator("#overview-title")).toBeVisible();
    await expect(page.locator("#overview-title")).toHaveValue("Dune");
    await expect(page.locator("tbody tr")).toHaveCount(1);
  });

  test("clearing the filter also clears what would otherwise be restored on the next visit", async ({
    page,
  }) => {
    mockCaldavServer(page, CREDENTIALS["caldav-url"], [DUNE, PADDINGTON]);
    await connect(page);

    await openFilters(page);
    await page.locator("#overview-title").fill("Dune");
    await page.getByRole("button", { name: "Filter", exact: true }).click();
    await expect(page.locator("tbody tr")).toHaveCount(1);

    await page.getByRole("button", { name: "Clear filter" }).click();
    await expect(page.locator("tbody tr")).toHaveCount(2);

    await page.getByRole("link", { name: "Dune" }).first().click();
    await expect(page).toHaveURL(/\/movie/);
    await page.goBack();
    await expect(page).toHaveURL("/");

    // Filters closed by default again — nothing left over to restore.
    await expect(page.locator("#overview-title")).toBeHidden();
    await expect(page.locator("tbody tr")).toHaveCount(2);
  });

  // #223: a visitor who deletes a viewing elsewhere (the details page,
  // another tab), then returns here via the browser's Back button, can
  // land on the exact pre-delete DOM the browser restored from its
  // back/forward cache rather than a fresh load — this page's own
  // mount-time reload() never re-runs on its own in that case. Firing a
  // real `pageshow(persisted: true)` (rather than actually navigating,
  // which Playwright/Chromium's automation doesn't reliably bfcache)
  // exercises the same listener a genuine restore would.
  test("a bfcache restore refreshes data that changed while this page was cached", async ({
    page,
  }) => {
    const server = mockCaldavServer(page, CREDENTIALS["caldav-url"], [DUNE, PADDINGTON]);
    await connect(page);
    await expect(page.locator("tbody tr")).toHaveCount(2);

    // Simulates the viewing being deleted by some means other than this
    // page (another tab's details page, say) while this one sat cached.
    server.viewings.delete(DUNE.uid);

    await page.evaluate(() => {
      window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true }));
    });

    await expect(page.locator("tbody tr")).toHaveCount(1);
    await expect(page.locator("tbody tr")).toContainText("Paddington");
  });

  // #163: actor/genre match one exact split value, not a substring of
  // the whole comma-joined field — a viewing with genre "Live Action
  // Adaptation" must not match a filter for "Action".
  test("filters by actor and genre on an exact split value, not a substring of the whole field", async ({
    page,
  }) => {
    mockCaldavServer(page, CREDENTIALS["caldav-url"], [
      DUNE,
      PADDINGTON,
      {
        uid: "not-action-uid",
        title: "Something Else",
        start: ONE_MONTH_AGO.toISOString(),
        end: new Date(ONE_MONTH_AGO.getTime() + 60 * 60 * 1000).toISOString(),
        medium: "cinema",
        genre: "Live Action Adaptation, Comedy",
      },
    ]);
    await connect(page);
    await expect(page.locator("tbody tr")).toHaveCount(3);

    await openFilters(page);
    await page.locator("#overview-genre").fill("Action");
    await page.getByRole("button", { name: "Filter", exact: true }).click();

    await expect(page.locator("tbody tr")).toHaveCount(1);
    await expect(page.locator("tbody tr")).toContainText("Dune");

    await page.locator("#overview-genre").fill("");
    await page.locator("#overview-actor").fill("Zendaya");
    await page.getByRole("button", { name: "Filter", exact: true }).click();

    await expect(page.locator("tbody tr")).toHaveCount(1);
    await expect(page.locator("tbody tr")).toContainText("Dune");
  });

  // #183
  test("filters by director on an exact split value, not a substring of the whole field", async ({
    page,
  }) => {
    mockCaldavServer(page, CREDENTIALS["caldav-url"], [
      DUNE,
      PADDINGTON,
      {
        uid: "other-director-uid",
        title: "Something Else",
        start: ONE_MONTH_AGO.toISOString(),
        end: new Date(ONE_MONTH_AGO.getTime() + 60 * 60 * 1000).toISOString(),
        medium: "cinema",
        director: "A Denis Villeneuve Impersonator",
      },
    ]);
    await connect(page);
    await expect(page.locator("tbody tr")).toHaveCount(3);

    await openFilters(page);
    await page.locator("#overview-director").fill("Denis Villeneuve");
    await page.getByRole("button", { name: "Filter", exact: true }).click();

    await expect(page.locator("tbody tr")).toHaveCount(1);
    await expect(page.locator("tbody tr")).toContainText("Dune");
  });

  test("?actor=, ?genre= and ?director= query params pre-populate their filter fields on load", async ({
    page,
  }) => {
    mockCaldavServer(page, CREDENTIALS["caldav-url"], [DUNE, PADDINGTON]);
    await connect(page);

    await page.goto("/?director=Denis%20Villeneuve");
    await expect(page.locator("#overview-director")).toHaveValue("Denis Villeneuve");
    await expect(page.locator("tbody tr")).toHaveCount(1);
    await expect(page.locator("tbody tr")).toContainText("Dune");

    await page.goto("/?genre=Drama");

    await expect(page.locator("#overview-genre")).toHaveValue("Drama");
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

  // #188: no explicit From/To used to still mean a fixed, hidden
  // 3-months-back/1-year-forward window — the fields looked blank
  // while quietly narrowing what showed. Queries the visitor's whole
  // history instead, and fills the fields in with the real first/last
  // watched dates, so what's shown and what the fields say agree.
  test("defaults to the visitor's whole history, filling From/To with the real first/last dates", async ({
    page,
  }) => {
    const server = mockCaldavServer(page, CREDENTIALS["caldav-url"], [DUNE, PADDINGTON]);
    await connect(page);

    await expect(page.locator("tbody tr")).toHaveCount(2);
    // PADDINGTON (2 months back) is the earliest, DUNE (1 month back)
    // the latest.
    await expect(page.locator("#overview-from")).toHaveValue(toDateInputValue(TWO_MONTHS_AGO));
    await expect(page.locator("#overview-to")).toHaveValue(toDateInputValue(ONE_MONTH_AGO));

    const from = server.listRequests[0]?.from as Date;
    const fifteenYearsAgo = new Date();
    fifteenYearsAgo.setFullYear(fifteenYearsAgo.getFullYear() - 15);
    // Within a day — allows for the test run's own clock drift against
    // the fixed 15-year default computed inside the component.
    expect(Math.abs(from.getTime() - fifteenYearsAgo.getTime())).toBeLessThan(24 * 60 * 60 * 1000);
  });

  test("with no logged viewings at all, From/To stay blank rather than showing a bogus date", async ({
    page,
  }) => {
    mockCaldavServer(page, CREDENTIALS["caldav-url"], []);
    await connect(page);

    await expect(page.getByRole("status").first()).toHaveText("0 logged viewings.");
    await expect(page.locator("#overview-from")).toHaveValue("");
    await expect(page.locator("#overview-to")).toHaveValue("");
  });

  test("clear filter resets the date range, title, medium, venue, director, actor and genre, and reloads", async ({
    page,
  }) => {
    const server = mockCaldavServer(page, CREDENTIALS["caldav-url"], [DUNE, PADDINGTON]);
    await connect(page);
    await expect(page.locator("tbody tr")).toHaveCount(2);

    await openFilters(page);
    await page.locator("#overview-from").fill(toDateInputValue(CUTOFF));
    await page.locator("#overview-to").fill(toDateInputValue(new Date()));
    await page.locator("#overview-title").fill("Dune");
    await page.locator("#overview-medium").fill("cinema");
    await page.locator("#overview-venue").fill("Grand Vista Cinema");
    await page.locator("#overview-director").fill("Denis Villeneuve");
    await page.locator("#overview-actor").fill("Zendaya");
    await page.locator("#overview-genre").fill("Drama");
    await page.getByRole("button", { name: "Filter", exact: true }).click();
    await expect(page.locator("tbody tr")).toHaveCount(1);

    await page.getByRole("button", { name: "Clear filter" }).click();

    // #188: From/To land back on the real first/last watched dates, not
    // blank — clearing means "show me everything", and these fields now
    // always say what's actually being shown, not "nothing typed".
    await expect(page.locator("#overview-from")).toHaveValue(toDateInputValue(TWO_MONTHS_AGO));
    await expect(page.locator("#overview-to")).toHaveValue(toDateInputValue(ONE_MONTH_AGO));
    await expect(page.locator("#overview-title")).toHaveValue("");
    await expect(page.locator("#overview-medium")).toHaveValue("");
    await expect(page.locator("#overview-venue")).toHaveValue("");
    await expect(page.locator("#overview-director")).toHaveValue("");
    await expect(page.locator("#overview-actor")).toHaveValue("");
    await expect(page.locator("#overview-genre")).toHaveValue("");
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

    await openFilters(page);
    await page.locator("#overview-medium").fill("cinema");
    await page.getByRole("button", { name: "Filter", exact: true }).click();

    await expect(page.getByText("Page 1 of 2")).toBeVisible();
    await expect(page.locator("tbody tr")).toHaveCount(25);
  });

  // #300
  test("clicking a page number jumps straight to it", async ({ page }) => {
    mockCaldavServer(page, CREDENTIALS["caldav-url"], manyViewings(30));
    await connect(page);

    await page.getByRole("button", { name: "Go to page 2" }).click();

    await expect(page.getByText("Page 2 of 2")).toBeVisible();
    await expect(page.locator("tbody tr")).toHaveCount(5);
    await expect(page.getByRole("button", { name: "Go to page 2" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  test("First and Last jump to the first and last page", async ({ page }) => {
    mockCaldavServer(page, CREDENTIALS["caldav-url"], manyViewings(30));
    await connect(page);

    await page.getByRole("button", { name: "Last" }).click();
    await expect(page.getByText("Page 2 of 2")).toBeVisible();
    await expect(page.getByRole("button", { name: "Last" })).toBeDisabled();

    await page.getByRole("button", { name: "First" }).click();
    await expect(page.getByText("Page 1 of 2")).toBeVisible();
    await expect(page.getByRole("button", { name: "First" })).toBeDisabled();
  });

  test("a large page count collapses to first/last plus a window around the current page", async ({
    page,
  }) => {
    mockCaldavServer(page, CREDENTIALS["caldav-url"], manyViewings(300));
    await connect(page);
    // 300 viewings / 10 per page (the smallest option) = 30 pages.
    await page.selectOption("#overview-page-size", "10");
    for (let i = 0; i < 14; i++) {
      await page.getByRole("button", { name: "Next page" }).click();
    }
    await expect(page.getByText("Page 15 of 30")).toBeVisible();

    const pagination = page.getByLabel("Pagination");
    await expect(
      pagination.getByRole("button", { name: "Go to page 1", exact: true }),
    ).toBeVisible();
    await expect(pagination.getByRole("button", { name: "Go to page 30" })).toBeVisible();
    await expect(pagination.getByRole("button", { name: "Go to page 13" })).toBeVisible();
    await expect(pagination.getByRole("button", { name: "Go to page 17" })).toBeVisible();
    // Not every page in between — just the window plus first/last.
    await expect(pagination.getByRole("button", { name: "Go to page 5" })).toHaveCount(0);
    await expect(pagination.getByRole("button", { name: "Go to page 25" })).toHaveCount(0);
  });

  test("changing results per page re-paginates and returns to the first page", async ({ page }) => {
    mockCaldavServer(page, CREDENTIALS["caldav-url"], manyViewings(30));
    await connect(page);
    await page.getByRole("button", { name: "Next page" }).click();
    await expect(page.getByText("Page 2 of 2")).toBeVisible();

    await page.selectOption("#overview-page-size", "50");

    await expect(page.locator("tbody tr")).toHaveCount(30);
    await expect(page.getByRole("button", { name: "Next page" })).toHaveCount(0);
  });

  test("pagination controls introduce no accessibility violations", async ({ page }) => {
    mockCaldavServer(page, CREDENTIALS["caldav-url"], manyViewings(30));
    await connect(page);
    await expect(page.getByText("Page 1 of 2")).toBeVisible();

    const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
    expect(results.violations).toEqual([]);
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
