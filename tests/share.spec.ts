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

  // #345: Brave/Android reported doing nothing at all on tap — the Web
  // Share API is the mobile-native path, tried before falling back to
  // the clipboard (which the test above already covers, since desktop
  // Chromium — what Playwright drives — doesn't implement
  // navigator.share at all, so that test already exercises the
  // fallback branch on its own).
  test("uses the native share sheet instead of the clipboard when the browser supports it", async ({
    page,
  }) => {
    mockCaldavServer(page, CREDENTIALS["caldav-url"], [DUNE]);
    await page.addInitScript(() => {
      // biome-ignore lint/suspicious/noExplicitAny: stubbing a browser API this test environment doesn't implement
      (navigator as any).share = async (data: { url: string }) => {
        // biome-ignore lint/suspicious/noExplicitAny: stashing on window for the test to read back
        (window as any).__sharedUrl = data.url;
      };
    });
    await connect(page);

    await page.getByRole("button", { name: "Share" }).click();
    await expect(page.getByText(/Shared — 1 viewing/)).toBeVisible();

    const sharedUrl = await page.evaluate(
      () => (window as unknown as { __sharedUrl: string }).__sharedUrl,
    );
    expect(sharedUrl).toContain("/shared?state=");
  });

  test("a visitor closing the native share sheet without picking anything isn't shown as an error", async ({
    page,
  }) => {
    mockCaldavServer(page, CREDENTIALS["caldav-url"], [DUNE]);
    await page.addInitScript(() => {
      // biome-ignore lint/suspicious/noExplicitAny: stubbing a browser API this test environment doesn't implement
      (navigator as any).share = async () => {
        throw new DOMException("Share canceled", "AbortError");
      };
    });
    await connect(page);

    const shareButton = page.getByRole("button", { name: "Share" });
    await shareButton.click();

    // Busy only while the (mocked, instantly-rejecting) share sheet is
    // "open" — back to normal once the cancellation is handled, with
    // nothing shown that reads like a failure.
    await expect(shareButton).toBeEnabled();
    await expect(page.getByText(/AbortError|Share canceled|Failed to prepare/)).toHaveCount(0);
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
