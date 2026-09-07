import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import { mockCaldavServer } from "./support/mock-caldav";

const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

const CREDENTIALS = {
  "caldav-url": "https://caldav.example.com/calendars/me/movies/",
  "caldav-username": "me",
  "caldav-password": "secret",
};

function daysAgo(n: number): Date {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000);
}

const DUNE = {
  uid: "dune-uid",
  title: "Dune",
  start: daysAgo(30).toISOString(),
  end: new Date(daysAgo(30).getTime() + 2.5 * 60 * 60 * 1000).toISOString(),
  medium: "cinema",
  venue: "Grand Vista Cinema",
  geo: { lat: 52.3665062, lon: 4.8947073 },
  posterUrl: "https://example.com/dune-poster.jpg",
  imdbId: "tt1160419",
  year: "2021",
};

const PADDINGTON = {
  uid: "paddington-uid",
  title: "Paddington",
  start: daysAgo(60).toISOString(),
  end: new Date(daysAgo(60).getTime() + 1.5 * 60 * 60 * 1000).toISOString(),
  medium: "netflix",
};

// High-entropy per entry (random-looking venue/poster/uid) so the
// gzip+base64url payload can't be compressed away — a realistic large
// history wouldn't be this random, but the point here is proving the
// length guard actually trips, not modelling real data. Measured: ~85
// encoded chars/entry at this shape, so 100 comfortably clears
// MAX_SHARE_URL_LENGTH's 6000 with real margin for a different gzip
// implementation making a slightly different call.
function hex(n: number): string {
  let s = "";
  for (let i = 0; i < n; i++) s += Math.floor(Math.random() * 16).toString(16);
  return s;
}

function tooManyToShare(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    uid: `viewing-${i}-${hex(8)}`,
    title: `Movie ${i} ${hex(12)}`,
    start: daysAgo(i).toISOString(),
    end: new Date(daysAgo(i).getTime() + 60 * 60 * 1000).toISOString(),
    medium: "cinema",
    venue: `Venue ${hex(16)}`,
    posterUrl: `https://example.com/poster-${hex(32)}.jpg`,
  }));
}

async function connect(page: Page) {
  await page.goto("/");
  await page.locator("#caldav-url").fill(CREDENTIALS["caldav-url"]);
  await page.locator("#caldav-username").fill(CREDENTIALS["caldav-username"]);
  await page.locator("#caldav-password").fill(CREDENTIALS["caldav-password"]);
  await page.getByRole("button", { name: "Connect" }).click();
  await expect(page.getByRole("status").first()).toBeVisible();
}

test.describe("sharing a read-only snapshot", () => {
  test("copies a link that renders the same viewings read-only, with no credentials involved", async ({
    page,
    context,
  }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    mockCaldavServer(page, CREDENTIALS["caldav-url"], [PADDINGTON, DUNE]);
    await connect(page);

    await page.getByRole("button", { name: "Share" }).click();
    await expect(page.getByText(/Link copied — 2 viewings/)).toBeVisible();

    const sharedUrl = await page.evaluate(() => navigator.clipboard.readText());
    expect(sharedUrl).toContain("/shared?state=");
    expect(sharedUrl).not.toContain(CREDENTIALS["caldav-username"]);
    expect(sharedUrl).not.toContain(CREDENTIALS["caldav-password"]);

    // A fresh, unauthenticated context — no stored credentials, no
    // mocked CalDAV routes at all — proving this page never calls out
    // to any server to render.
    const freshPage = await context.newPage();
    await freshPage.goto(sharedUrl);

    await expect(freshPage.getByText(/frozen as of/)).toBeVisible();
    await expect(freshPage.getByText("Dune (2021)")).toBeVisible();
    await expect(freshPage.getByText("Paddington")).toBeVisible();
    await expect(freshPage.getByRole("link", { name: "map", exact: true })).toBeVisible();

    // Structurally read-only: none of the overview's own write controls
    // exist on this page at all, not just hidden.
    await expect(freshPage.getByRole("button", { name: "Edit" })).toHaveCount(0);
    await expect(freshPage.getByRole("button", { name: "Delete" })).toHaveCount(0);
    await expect(freshPage.getByRole("link", { name: "Edit" })).toHaveCount(0);

    const results = await new AxeBuilder({ page: freshPage }).withTags(WCAG_TAGS).analyze();
    expect(results.violations).toEqual([]);
  });

  test("warns instead of producing a link when the filtered set is too big to fit", async ({
    page,
  }) => {
    mockCaldavServer(page, CREDENTIALS["caldav-url"], tooManyToShare(100));
    await connect(page);

    await page.getByRole("button", { name: "Share" }).click();
    await expect(page.getByText(/too much to fit in a link/)).toBeVisible();
    await expect(page.getByText(/Narrow the filter/)).toBeVisible();
  });

  test("shows a clear error for a corrupted shared link instead of a blank page", async ({
    page,
  }) => {
    await page.goto("/shared?state=not-a-real-payload");
    await expect(page.getByRole("alert")).toContainText(/couldn't be read/);
  });
});
