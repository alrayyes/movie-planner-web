import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, type Route, test } from "@playwright/test";
import { mockCaldavServer } from "./support/mock-caldav";

const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

const CREDENTIALS = {
  "caldav-url": "https://caldav.example.com/calendars/me/movies/",
  "caldav-username": "me",
  "caldav-password": "secret",
};

const PATHE_EMAIL = `Booking Confirmation

Dune: Part Two
==============

English, subtitled

Wednesday 15/01/25, 19:30 Expected to end at 21:50

Auditorium 3, Seat A12

Pathé Tuschinski
Reguliersbreestraat 26
Amsterdam

Booking number

N°ABC123456
`;

async function connect(page: Page, omdbApiKey?: string, omdbPaused = false) {
  const server = mockCaldavServer(page, CREDENTIALS["caldav-url"], []);
  await page.goto("/");
  await page.locator("#caldav-url").fill(CREDENTIALS["caldav-url"]);
  await page.locator("#caldav-username").fill(CREDENTIALS["caldav-username"]);
  await page.locator("#caldav-password").fill(CREDENTIALS["caldav-password"]);
  if (omdbApiKey) await page.locator("#omdb-api-key").fill(omdbApiKey);
  if (omdbPaused) await page.locator("#omdb-paused").check();
  await page.getByRole("button", { name: "Connect" }).click();
  await expect(page.getByRole("button", { name: "Log a viewing" })).toBeVisible();
  // #603: the header button now opens the wizard dialog, not /log —
  // this file's own "manual log form"/"Pathé email parsing" describes
  // exercise /log's own LogViewingForm.svelte directly, which stays
  // unaffected and reachable by URL; the wizard's own tests are below.
  await page.goto("/log");
  return server;
}

test.describe("manual log form", () => {
  test("submits and creates the resulting CalDAV event", async ({ page }) => {
    const server = await connect(page);

    await page.locator("#log-title").fill("Paddington");
    await page.locator("#log-date").fill("2026-02-01");
    await page.locator("#log-start-time").fill("18:00");
    await page.locator("#log-end-time").fill("19:40");
    // #600: a real selection, not just the default "Cinema" — proves the
    // select actually drives what gets logged, not just its own default.
    await page.getByRole("button", { name: "Add medium" }).click();
    await page.locator("#log-add-medium-name").fill("Netflix");
    await page.getByRole("button", { name: "Add", exact: true }).click();
    await expect(page.locator("#log-medium")).toHaveValue("Netflix");
    await page.getByRole("button", { name: "Log viewing" }).click();

    await expect(page.getByRole("status")).toHaveText("Logged.");
    expect(server.creates).toHaveLength(1);
    expect(server.creates[0]?.title).toBe("Paddington");
    expect(server.creates[0]?.medium).toBe("Netflix");
  });

  test("logs with just a date — start and end time are both optional", async ({ page }) => {
    const server = await connect(page);

    await page.locator("#log-title").fill("Paddington");
    await page.locator("#log-date").fill("2026-02-01");
    await page.locator("#log-medium").selectOption("Cinema");
    await page.getByRole("button", { name: "Log viewing" }).click();

    await expect(page.getByRole("status")).toHaveText("Logged.");
    expect(server.creates).toHaveLength(1);
    // No time given defaults to midnight; no end time given defaults to
    // the (also-defaulted) start time — same rule the CSV/JSON importer
    // already applies to a row with no times at all.
    expect(server.creates[0]?.start).toBe(new Date("2026-02-01T00:00:00").toISOString());
    expect(server.creates[0]?.end).toBe(server.creates[0]?.start);
  });

  test("a11y scan on the log screen", async ({ page }) => {
    await connect(page);
    const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
    expect(results.violations).toEqual([]);
  });
});

test.describe("Pathé email parsing", () => {
  test("shows the parsed result for confirmation before writing", async ({ page }) => {
    const server = await connect(page);

    await page.locator("#pathe-email-text").fill(PATHE_EMAIL);
    await page.getByRole("button", { name: "Parse" }).click();

    await expect(page.getByText("Dune: Part Two")).toBeVisible();
    await expect(page.getByText("N°ABC123456")).toBeVisible();
    // Not written yet — only Parse was clicked, not Confirm.
    expect(server.creates).toHaveLength(0);

    await page.getByRole("button", { name: "Confirm and log" }).click();
    await expect(page.getByRole("status")).toHaveText("Logged.");
    expect(server.creates).toHaveLength(1);
  });

  test("a re-submitted booking number updates the existing entry instead of duplicating", async ({
    page,
  }) => {
    await page.goto("/");
    await page.locator("#caldav-url").fill(CREDENTIALS["caldav-url"]);
    await page.locator("#caldav-username").fill(CREDENTIALS["caldav-username"]);
    await page.locator("#caldav-password").fill(CREDENTIALS["caldav-password"]);

    // The dedup check lists the booking's own day looking for a matching
    // bookingRef — seed an existing viewing on that same day with the
    // booking's own reference already logged.
    const server = mockCaldavServer(page, CREDENTIALS["caldav-url"], [
      {
        uid: "existing-uid",
        title: "Dune: Part Two",
        start: "2025-01-15T18:30:00.000Z",
        end: "2025-01-15T20:50:00.000Z",
        medium: "cinema",
        bookingRef: "N°ABC123456",
      },
    ]);
    await page.getByRole("button", { name: "Connect" }).click();
    await expect(page.getByRole("button", { name: "Log a viewing" })).toBeVisible();
    await page.goto("/log");

    await page.locator("#pathe-email-text").fill(PATHE_EMAIL);
    await page.getByRole("button", { name: "Parse" }).click();
    await page.getByRole("button", { name: "Confirm and log" }).click();

    await expect(page.getByRole("status")).toHaveText("Updated the existing entry.");
    expect(server.creates).toHaveLength(0);
    expect(server.updates).toHaveLength(1);
    expect(server.updates[0]?.uid).toBe("existing-uid");
  });
});

test.describe("OMDb enrichment", () => {
  test("attaches a best-effort match when a key is set, without a disambiguation prompt", async ({
    page,
  }) => {
    const server = await connect(page, "test-omdb-key");
    page.route("https://www.omdbapi.com/**", async (route: Route) => {
      const url = new URL(route.request().url());
      expect(url.searchParams.get("apikey")).toBe("test-omdb-key");
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          Response: "True",
          Director: "Denis Villeneuve",
          Ratings: [{ Source: "Internet Movie Database", Value: "8.0/10" }],
        }),
      });
    });

    await page.locator("#log-title").fill("Dune");
    await page.locator("#log-date").fill("2026-01-01");
    await page.locator("#log-start-time").fill("19:00");
    await page.locator("#log-end-time").fill("21:30");
    await page.locator("#log-medium").selectOption("Cinema");
    await page.getByRole("button", { name: "Log viewing" }).click();

    await expect(page.getByRole("status")).toHaveText("Logged.");
    expect(server.creates[0]?.ratingImdb).toBe("8.0/10");
    expect(server.creates[0]?.director).toBe("Denis Villeneuve");
    // No disambiguation UI of any kind should appear.
    await expect(page.getByText(/which movie/i)).toHaveCount(0);
  });

  test("logs successfully with no OMDb key set", async ({ page }) => {
    const server = await connect(page);

    await page.locator("#log-title").fill("Paddington");
    await page.locator("#log-date").fill("2026-02-01");
    await page.locator("#log-start-time").fill("18:00");
    await page.locator("#log-end-time").fill("19:40");
    await page.locator("#log-medium").selectOption("Cinema");
    await page.getByRole("button", { name: "Log viewing" }).click();

    await expect(page.getByRole("status")).toHaveText("Logged.");
    expect(server.creates[0]?.ratingImdb).toBeUndefined();
  });

  // #80: a stored key that's paused makes no OMDb call at all — this
  // asserts the network side, not just the resulting fields, since a
  // fetch that happens to find nothing would look identical from the
  // saved viewing alone.
  test("makes no OMDb request while lookups are paused, even with a key set", async ({ page }) => {
    const server = await connect(page, "test-omdb-key", true);
    let omdbCalls = 0;
    await page.route("https://www.omdbapi.com/**", async (route: Route) => {
      omdbCalls++;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ Response: "False" }),
      });
    });

    await page.locator("#log-title").fill("Dune");
    await page.locator("#log-date").fill("2026-01-01");
    await page.locator("#log-medium").selectOption("Cinema");
    await page.getByRole("button", { name: "Log viewing" }).click();

    await expect(page.getByRole("status")).toHaveText("Logged.");
    expect(omdbCalls).toBe(0);
    expect(server.creates[0]?.ratingImdb).toBeUndefined();
    await expect(page.getByLabel("Choose the matching title")).toHaveCount(0);
  });

  test("offers a disambiguation picker when there's no confident match, and attaches the chosen candidate", async ({
    page,
  }) => {
    const server = await connect(page, "test-omdb-key");
    page.route("https://www.omdbapi.com/**", async (route: Route) => {
      const url = new URL(route.request().url());
      if (url.searchParams.get("t")) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ Response: "False" }),
        });
        return;
      }
      if (url.searchParams.get("s")) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            Response: "True",
            Search: [
              {
                Title: "Dune",
                Year: "2021",
                imdbID: "tt1160419",
                Poster: "https://example.com/dune-2021.jpg",
              },
              {
                Title: "Dune",
                Year: "1984",
                imdbID: "tt0087182",
                Poster: "https://example.com/dune-1984.jpg",
              },
            ],
          }),
        });
        return;
      }
      // i=<imdbID>: the chosen candidate's full details.
      expect(url.searchParams.get("i")).toBe("tt1160419");
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          Response: "True",
          Director: "Denis Villeneuve",
          Year: "2021",
          imdbID: "tt1160419",
          Ratings: [{ Source: "Internet Movie Database", Value: "8.0/10" }],
        }),
      });
    });

    await page.locator("#log-title").fill("Dune");
    await page.locator("#log-date").fill("2026-01-01");
    await page.locator("#log-medium").selectOption("Cinema");
    await page.getByRole("button", { name: "Log viewing" }).click();

    await expect(page.getByRole("status")).toHaveText("Logged.");
    expect(server.creates[0]?.ratingImdb).toBeUndefined();

    const picker = page.getByLabel("Choose the matching title");
    await expect(picker.getByRole("button", { name: "Dune (2021)" })).toBeVisible();
    await expect(picker.getByRole("button", { name: "Dune (1984)" })).toBeVisible();
    await picker.getByRole("button", { name: "Dune (2021)" }).click();

    await expect(page.getByRole("status")).toHaveText("Logged and matched.");
    expect(server.updates).toHaveLength(1);
    expect(server.updates[0]?.director).toBe("Denis Villeneuve");
    expect(server.updates[0]?.ratingImdb).toBe("8.0/10");
    await expect(picker).toHaveCount(0);
  });

  test("dismissing the disambiguation picker leaves the entry without metadata", async ({
    page,
  }) => {
    const server = await connect(page, "test-omdb-key");
    page.route("https://www.omdbapi.com/**", async (route: Route) => {
      const url = new URL(route.request().url());
      if (url.searchParams.get("s")) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            Response: "True",
            Search: [
              {
                Title: "Dune",
                Year: "2021",
                imdbID: "tt1160419",
                Poster: "https://example.com/dune.jpg",
              },
            ],
          }),
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ Response: "False" }),
      });
    });

    await page.locator("#log-title").fill("Dune");
    await page.locator("#log-date").fill("2026-01-01");
    await page.locator("#log-medium").selectOption("Cinema");
    await page.getByRole("button", { name: "Log viewing" }).click();

    const picker = page.getByLabel("Choose the matching title");
    await expect(picker).toBeVisible();
    await picker.getByRole("button", { name: "Continue without metadata" }).click();

    await expect(picker).toHaveCount(0);
    expect(server.updates).toHaveLength(0);
    expect(server.creates[0]?.ratingImdb).toBeUndefined();
  });

  test("no picker appears when OMDb's search also finds no candidates", async ({ page }) => {
    const server = await connect(page, "test-omdb-key");
    page.route("https://www.omdbapi.com/**", async (route: Route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ Response: "False" }),
      });
    });

    await page.locator("#log-title").fill("Not A Real Movie");
    await page.locator("#log-date").fill("2026-01-01");
    await page.locator("#log-medium").selectOption("Cinema");
    await page.getByRole("button", { name: "Log viewing" }).click();

    await expect(page.getByRole("status")).toHaveText("Logged.");
    await expect(page.getByLabel("Choose the matching title")).toHaveCount(0);
    expect(server.creates[0]?.ratingImdb).toBeUndefined();
  });
});

// #593: unlike the automatic best-effort lookup above (which only offers
// a picker after logging, and only when it found no single confident
// match), this lets a visitor search and pick the exact title *before*
// logging — the same "Search OMDb" pattern movie-details.spec.ts already
// covers for fixing an existing match.
test.describe("Search OMDb before logging", () => {
  test("no Search OMDb button appears without an OMDb key set", async ({ page }) => {
    await connect(page);
    await expect(page.getByRole("button", { name: "Search OMDb" })).toHaveCount(0);
  });

  test("no Search OMDb button appears while OMDb lookups are paused", async ({ page }) => {
    await connect(page, "test-omdb-key", true);
    await expect(page.getByRole("button", { name: "Search OMDb" })).toHaveCount(0);
  });

  test("searching and picking a match attaches it directly, with no post-log disambiguation", async ({
    page,
  }) => {
    const server = await connect(page, "test-omdb-key");
    await page.route("https://www.omdbapi.com/**", async (route: Route) => {
      const url = new URL(route.request().url());
      if (url.searchParams.get("s") === "Dune 1984") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            Response: "True",
            Search: [
              {
                Title: "Dune",
                Year: "1984",
                imdbID: "tt0087182",
                Poster: "https://example.com/dune-1984.jpg",
              },
            ],
          }),
        });
        return;
      }
      // The automatic t= lookup must never run for this submission — only
      // the chosen candidate's own i=<imdbID> detail fetch.
      expect(url.searchParams.get("i")).toBe("tt0087182");
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          Response: "True",
          Director: "David Lynch",
          Year: "1984",
          imdbID: "tt0087182",
          Poster: "https://example.com/dune-1984.jpg",
          Ratings: [{ Source: "Internet Movie Database", Value: "7.6/10" }],
        }),
      });
    });

    const dialog = page.getByRole("dialog", { name: "Search OMDb" });
    await expect(dialog).toBeHidden();
    await page.getByRole("button", { name: "Search OMDb" }).click();
    await expect(dialog).toBeVisible();

    await page.locator("#omdb-search-query").fill("Dune 1984");
    await page.getByRole("button", { name: "Search", exact: true }).click();

    const picker = page.getByLabel("Choose the matching title");
    await expect(picker.getByRole("button", { name: "Dune (1984)" })).toBeVisible();

    const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
    expect(results.violations).toEqual([]);

    await picker.getByRole("button", { name: "Dune (1984)" }).click();
    await expect(dialog).toBeHidden();
    await expect(picker).toHaveCount(0);
    await expect(page.locator("#log-title")).toHaveValue("Dune");

    await page.locator("#log-date").fill("2026-01-01");
    await page.locator("#log-medium").selectOption("Cinema");
    await page.getByRole("button", { name: "Log viewing" }).click();

    await expect(page.getByRole("status")).toHaveText("Logged.");
    expect(server.creates).toHaveLength(1);
    expect(server.creates[0]?.director).toBe("David Lynch");
    expect(server.creates[0]?.ratingImdb).toBe("7.6/10");
    expect(server.creates[0]?.posterUrl).toBe("https://example.com/dune-1984.jpg");
    expect(server.updates).toHaveLength(0);
    await expect(page.getByLabel("Choose the matching title")).toHaveCount(0);
  });

  test("canceling the search dialog makes no OMDb request and leaves the title untouched", async ({
    page,
  }) => {
    await connect(page, "test-omdb-key");
    let omdbCalls = 0;
    await page.route("https://www.omdbapi.com/**", async (route: Route) => {
      omdbCalls++;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ Response: "False" }),
      });
    });

    const dialog = page.getByRole("dialog", { name: "Search OMDb" });
    await page.locator("#log-title").fill("Dune");
    await page.getByRole("button", { name: "Search OMDb" }).click();
    await expect(page.locator("#omdb-search-query")).toHaveValue("Dune");
    await dialog.getByRole("button", { name: "Cancel" }).click();

    await expect(dialog).toBeHidden();
    expect(omdbCalls).toBe(0);
    await expect(page.locator("#log-title")).toHaveValue("Dune");

    // #596: the query resets, ready for a fresh search — not left
    // showing whatever was typed (or searched for) last time.
    await page.getByRole("button", { name: "Search OMDb" }).click();
    await expect(page.locator("#omdb-search-query")).toHaveValue("Dune");
  });

  test("pressing Escape closes the search dialog the same as Cancel", async ({ page }) => {
    await connect(page, "test-omdb-key");
    const dialog = page.getByRole("dialog", { name: "Search OMDb" });
    await page.getByRole("button", { name: "Search OMDb" }).click();
    await expect(dialog).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
  });

  test("dismissing the picker falls back to normal automatic enrichment on submit", async ({
    page,
  }) => {
    const server = await connect(page, "test-omdb-key");
    await page.route("https://www.omdbapi.com/**", async (route: Route) => {
      const url = new URL(route.request().url());
      if (url.searchParams.get("s")) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            Response: "True",
            Search: [
              {
                Title: "Dune",
                Year: "1984",
                imdbID: "tt0087182",
                Poster: "https://example.com/dune-1984.jpg",
              },
            ],
          }),
        });
        return;
      }
      // The normal automatic t= lookup that runs on submit, since no
      // candidate was picked.
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ Response: "False" }),
      });
    });

    await page.getByRole("button", { name: "Search OMDb" }).click();
    await page.locator("#omdb-search-query").fill("Dune 1984");
    await page.getByRole("button", { name: "Search", exact: true }).click();

    const picker = page.getByLabel("Choose the matching title");
    await expect(picker).toBeVisible();
    await picker.getByRole("button", { name: "Cancel" }).click();
    await expect(picker).toHaveCount(0);

    await page.locator("#log-title").fill("Dune");
    await page.locator("#log-date").fill("2026-01-01");
    await page.locator("#log-medium").selectOption("Cinema");
    await page.getByRole("button", { name: "Log viewing" }).click();

    await expect(page.getByRole("status")).toHaveText("Logged.");
    expect(server.creates[0]?.director).toBeUndefined();
  });
});

// #8/#203/#452: a venue's own coordinates now live on its picklist
// entry, attached automatically when it's selected, or captured via an
// address-search lookup while adding a genuinely new venue — this
// form's venue field is a closed <select> (structured-venue-picklist),
// not free text, so that coverage now lives in
// location-management.spec.ts's "structured venue picklist" describe,
// alongside the rest of the picklist behaviour it exercises.

// #442: a genuine log failure gets a distinct, assertively announced
// error toast — not the same quiet role="status" line "Logged." uses.
test.describe("error toasts", () => {
  test("a failed manual log shows a distinct error toast, unaffected routine status, no auto-dismiss", async ({
    page,
  }) => {
    await connect(page);

    await page.route(`${new URL(CREDENTIALS["caldav-url"]).origin}/**`, async (route: Route) => {
      if (route.request().method() === "PUT") {
        await route.fulfill({ status: 500, body: "Internal Server Error" });
        return;
      }
      await route.fallback();
    });

    await page.locator("#log-title").fill("Paddington");
    await page.locator("#log-date").fill("2026-02-01");
    await page.locator("#log-medium").selectOption("Cinema");
    await page.getByRole("button", { name: "Log viewing" }).click();

    const toast = page.getByRole("alert");
    await expect(toast).toBeVisible();
    await expect(toast).toContainText(/the CalDAV server responded 500/);
    await expect(page.getByRole("status")).not.toHaveText("Logged.");

    await page.waitForTimeout(1000);
    await expect(toast).toBeVisible();

    const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
    expect(results.violations).toEqual([]);

    await page.getByRole("button", { name: "Dismiss error" }).click();
    await expect(toast).toHaveCount(0);
  });
});

// #603: the header's "Log a viewing" button no longer navigates to /log
// (that stays reachable directly, unaffected, for the Pathé-email flow
// covered above) — it opens LogViewingWizard.svelte's own two-step
// <dialog> in place instead: step one is search-and-select-first (a
// title has to be picked before date/medium/venue even appear), step
// two is everything else, reusing MediumPicker/VenuePicker and
// logManualViewing exactly as /log's own form does.
test.describe("log a viewing wizard (header button)", () => {
  async function connectOnCurrentPage(page: Page, omdbApiKey?: string) {
    const server = mockCaldavServer(page, CREDENTIALS["caldav-url"], []);
    await page.goto("/");
    await page.locator("#caldav-url").fill(CREDENTIALS["caldav-url"]);
    await page.locator("#caldav-username").fill(CREDENTIALS["caldav-username"]);
    await page.locator("#caldav-password").fill(CREDENTIALS["caldav-password"]);
    if (omdbApiKey) await page.locator("#omdb-api-key").fill(omdbApiKey);
    await page.getByRole("button", { name: "Connect" }).click();
    await expect(page.getByRole("button", { name: "Log a viewing" })).toBeVisible();
    return server;
  }

  test("step one is search-and-select only — date/medium/venue don't appear until Next", async ({
    page,
  }) => {
    await connectOnCurrentPage(page);
    await page.getByRole("button", { name: "Log a viewing" }).click();

    const dialog = page.getByRole("dialog", { name: "Log a viewing" });
    await expect(dialog).toBeVisible();
    await expect(page.locator("#wizard-title")).toBeVisible();
    await expect(page.locator("#wizard-date")).toHaveCount(0);
    await expect(dialog.getByRole("combobox", { name: "Medium" })).toHaveCount(0);

    await expect(dialog.getByRole("button", { name: "Next" })).toBeDisabled();
    await page.locator("#wizard-title").fill("Paddington");
    await expect(dialog.getByRole("button", { name: "Next" })).toBeEnabled();

    await dialog.getByRole("button", { name: "Next" }).click();
    await expect(page.locator("#wizard-date")).toBeVisible();
    await expect(dialog.getByRole("combobox", { name: "Medium" })).toBeVisible();
  });

  test("searching OMDb and picking a candidate carries the exact match into step two", async ({
    page,
  }) => {
    const server = await connectOnCurrentPage(page, "test-omdb-key");
    await page.route("https://www.omdbapi.com/**", async (route: Route) => {
      const url = new URL(route.request().url());
      if (url.searchParams.get("s") === "Dune 1984") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            Response: "True",
            Search: [{ Title: "Dune", Year: "1984", imdbID: "tt0087182", Poster: "N/A" }],
          }),
        });
        return;
      }
      // No automatic t= best-guess lookup should ever run for this
      // submission — only the picked candidate's own i=<imdbID> fetch.
      expect(url.searchParams.get("i")).toBe("tt0087182");
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          Response: "True",
          Director: "David Lynch",
          Year: "1984",
          imdbID: "tt0087182",
          Ratings: [{ Source: "Internet Movie Database", Value: "7.6/10" }],
        }),
      });
    });

    await page.getByRole("button", { name: "Log a viewing" }).click();
    const dialog = page.getByRole("dialog", { name: "Log a viewing" });

    await page.locator("#wizard-title").fill("Dune 1984");
    await dialog.getByRole("button", { name: "Search OMDb" }).click();
    const picker = dialog.getByLabel("Choose the matching title");
    await expect(picker.getByRole("button", { name: "Dune (1984)" })).toBeVisible();
    await picker.getByRole("button", { name: "Dune (1984)" }).click();

    await expect(page.locator("#wizard-title")).toHaveValue("Dune");
    await dialog.getByRole("button", { name: "Next" }).click();
    await page.locator("#wizard-date").fill("2026-01-01");
    await dialog.getByRole("combobox", { name: "Medium" }).selectOption("Cinema");
    await dialog.getByRole("button", { name: "Log viewing" }).click();

    await expect(dialog).toBeHidden();
    expect(server.creates).toHaveLength(1);
    expect(server.creates[0]?.title).toBe("Dune");
    expect(server.creates[0]?.director).toBe("David Lynch");
    expect(server.creates[0]?.ratingImdb).toBe("7.6/10");
  });

  test("Back returns to step one without losing anything already typed in step two", async ({
    page,
  }) => {
    await connectOnCurrentPage(page);
    await page.getByRole("button", { name: "Log a viewing" }).click();
    const dialog = page.getByRole("dialog", { name: "Log a viewing" });

    await page.locator("#wizard-title").fill("Paddington");
    await dialog.getByRole("button", { name: "Next" }).click();
    await page.locator("#wizard-date").fill("2026-02-01");
    await page.locator("#wizard-start-time").fill("18:00");

    await dialog.getByRole("button", { name: "Back" }).click();
    await expect(page.locator("#wizard-title")).toBeVisible();
    await expect(page.locator("#wizard-title")).toHaveValue("Paddington");

    await dialog.getByRole("button", { name: "Next" }).click();
    await expect(page.locator("#wizard-date")).toHaveValue("2026-02-01");
    await expect(page.locator("#wizard-start-time")).toHaveValue("18:00");
  });

  test("stays on whatever page it was opened from, after logging", async ({ page }) => {
    const server = await connectOnCurrentPage(page);
    await page.goto("/venues");

    await page.getByRole("button", { name: "Log a viewing" }).click();
    const dialog = page.getByRole("dialog", { name: "Log a viewing" });
    await page.locator("#wizard-title").fill("Paddington");
    await dialog.getByRole("button", { name: "Next" }).click();
    await page.locator("#wizard-date").fill("2026-02-01");
    await dialog.getByRole("combobox", { name: "Medium" }).selectOption("Cinema");
    await dialog.getByRole("button", { name: "Log viewing" }).click();

    await expect(dialog).toBeHidden();
    await expect(page).toHaveURL(/\/venues\/?$/);
    expect(server.creates).toHaveLength(1);
  });

  test("a11y scan of both steps", async ({ page }) => {
    await connectOnCurrentPage(page);
    await page.getByRole("button", { name: "Log a viewing" }).click();

    let results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
    expect(results.violations).toEqual([]);

    await page.locator("#wizard-title").fill("Paddington");
    await page
      .getByRole("dialog", { name: "Log a viewing" })
      .getByRole("button", { name: "Next" })
      .click();

    results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
    expect(results.violations).toEqual([]);
  });
});
