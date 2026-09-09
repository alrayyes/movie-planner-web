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

async function connect(page: Page) {
  await page.goto("/");
  await page.locator("#caldav-url").fill(CREDENTIALS["caldav-url"]);
  await page.locator("#caldav-username").fill(CREDENTIALS["caldav-username"]);
  await page.locator("#caldav-password").fill(CREDENTIALS["caldav-password"]);
  await page.getByRole("button", { name: "Connect" }).click();
  // #435: was `getByRole("status").first()` — that's the overview's
  // count line, which no longer holds text once loading finishes, so
  // it's no longer a safe signal that the connect actually landed.
  await expect(page.getByRole("link", { name: "Log a viewing" })).toBeVisible();
}

// #389: replaces the overview's own whole-list share (#335), removed
// once it hit a hard "too big to fit in a link" wall for a large
// filtered set — sharing one viewing at a time has no realistic size
// problem to hit in the first place.
test.describe("sharing a single viewing", () => {
  // #362: deliberately grants NO clipboard permission — the default
  // state for a real, fresh visitor, and the exact condition that
  // reproduced the real bug the whole-list feature originally shipped
  // with (clipboard-write throwing NotAllowedError, silently making
  // Share look like it did nothing). The visible link box is the fix:
  // it has to work regardless of clipboard/share permissions, not just
  // when a test grants them upfront.
  test("shows the link as visible, selectable text — the reliable path when clipboard/share aren't available", async ({
    page,
    context,
  }) => {
    mockCaldavServer(page, CREDENTIALS["caldav-url"], [DUNE]);
    await connect(page);
    await page.getByRole("link", { name: "Dune (2021)" }).first().click();

    await page.getByRole("button", { name: "Share" }).click();
    await expect(page.getByText(/^Read-only, frozen as of now\.$/)).toBeVisible();

    const linkBox = page.getByRole("textbox", { name: "Shareable link" });
    await expect(linkBox).toBeVisible();
    const sharedUrl = await linkBox.inputValue();
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
    await expect(freshPage.getByRole("link", { name: "map", exact: true })).toBeVisible();

    // Structurally read-only: none of the details page's own write
    // controls exist on this page at all, not just hidden.
    await expect(freshPage.getByRole("button", { name: "Edit" })).toHaveCount(0);
    await expect(freshPage.getByRole("button", { name: "Delete" })).toHaveCount(0);

    const results = await new AxeBuilder({ page: freshPage }).withTags(WCAG_TAGS).analyze();
    expect(results.violations).toEqual([]);
  });

  test("the Copy button copies the shown link, when clipboard permission is actually granted", async ({
    page,
    context,
  }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    mockCaldavServer(page, CREDENTIALS["caldav-url"], [DUNE]);
    await connect(page);
    await page.getByRole("link", { name: "Dune (2021)" }).first().click();

    await page.getByRole("button", { name: "Share" }).click();
    const linkBox = page.getByRole("textbox", { name: "Shareable link" });
    await expect(linkBox).toBeVisible();
    const shownUrl = await linkBox.inputValue();

    await page.getByRole("button", { name: "Copy" }).click();
    await expect(page.getByText(/^Copied — Read-only/)).toBeVisible();

    const clipboardValue = await page.evaluate(() => navigator.clipboard.readText());
    expect(clipboardValue).toBe(shownUrl);
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
    await page.getByRole("link", { name: "Dune (2021)" }).first().click();

    await page.getByRole("button", { name: "Share" }).click();
    await expect(page.getByText(/^Shared — read-only, frozen as of now\.$/)).toBeVisible();

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
    await page.getByRole("link", { name: "Dune (2021)" }).first().click();

    const shareButton = page.getByRole("button", { name: "Share" });
    await shareButton.click();

    // Busy only while the (mocked, instantly-rejecting) share sheet is
    // "open" — back to normal once the cancellation is handled, with
    // nothing shown that reads like a failure.
    await expect(shareButton).toBeEnabled();
    await expect(page.getByText(/AbortError|Share canceled|Failed to prepare/)).toHaveCount(0);
  });

  test("shows a clear error for a corrupted shared link instead of a blank page", async ({
    page,
  }) => {
    await page.goto("/shared?state=not-a-real-payload");
    const toast = page.getByRole("alert");
    await expect(toast).toContainText(/couldn't be read/);

    // #442: adopts the same shared error-toast component every other
    // component's genuine error uses, not just the correct role.
    const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
    expect(results.violations).toEqual([]);

    await page.getByRole("button", { name: "Dismiss error" }).click();
    await expect(toast).toHaveCount(0);
  });
});
