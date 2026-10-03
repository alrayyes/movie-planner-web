import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import { openOptionalIntegrations } from "./support/connect-form";
import { mockCaldavServer } from "./support/mock-caldav";

const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

const CREDENTIALS = {
  "caldav-url": "https://caldav.example.com/dav.php/calendars/me/movies/",
  "caldav-username": "me",
  "caldav-password": "secret",
};

// Connecting hands off to <calendar-overview>, which loads real calendar
// data — mocked here the same way calendar-overview.spec.ts does, so these
// credentials-focused tests don't also need a real (or fake) CalDAV server
// to reach a stable, testable "connected" state.
function mockEmptyEventList(page: Page) {
  mockCaldavServer(page, CREDENTIALS["caldav-url"], []);
}

async function connect(page: Page, omdbApiKey?: string) {
  mockEmptyEventList(page);
  await page.goto("/");
  await page.locator("#caldav-url").fill(CREDENTIALS["caldav-url"]);
  await page.locator("#caldav-username").fill(CREDENTIALS["caldav-username"]);
  await page.locator("#caldav-password").fill(CREDENTIALS["caldav-password"]);
  if (omdbApiKey) {
    await openOptionalIntegrations(page);
    await page.locator("#omdb-api-key").fill(omdbApiKey);
  }
  await page.getByRole("button", { name: "Connect" }).click();
  await expect(page.getByRole("button", { name: "Log a viewing" })).toBeVisible();
}

test.describe("first-load credentials capture", () => {
  test("shows the credentials form and nothing else when no credentials are stored", async ({
    page,
  }) => {
    await page.goto("/");

    await expect(page.locator("#caldav-url")).toBeVisible();
    await expect(page.locator("#caldav-username")).toBeVisible();
    await expect(page.locator("#caldav-password")).toBeVisible();
    await expect(page.getByText("Optional integrations")).toBeVisible();
    // #677: only Settings and About before connecting, not the pages that need credentials.
    await expect(page.locator("site-nav").getByRole("link", { name: "Venues" })).toHaveCount(0);
    await expect(page.locator("site-nav").getByRole("link", { name: "Calendar" })).toHaveCount(0);

    const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
    expect(results.violations).toEqual([]);
  });

  // #269: a brand-new visitor's very first screen used to be the bare
  // form with no context for what CalDAV is or why this app wants it.
  test("explains what the app is and why it's asking for CalDAV credentials, before the form fields", async ({
    page,
  }) => {
    await page.goto("/");

    await expect(page.getByText(/same standard protocol most calendar apps/)).toBeVisible();
    const docsLink = page.getByRole("link", { name: "connecting your CalDAV server" });
    await expect(docsLink).toHaveAttribute("href", "/docs/connecting/");
    const privacyLink = page.getByRole("link", { name: "privacy page" });
    await expect(privacyLink).toHaveAttribute("href", "/privacy");
  });

  // #678: on a phone the form started ~700px down, under five paragraphs.
  test("shows the CalDAV URL field within the first screen at 390px wide", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");

    // Was 735px, behind the whole intro. What's above it is now fixed: the
    // beta notice (#678 keeps its text unchanged) and the Settings/About nav
    // a visitor gets before connecting (#677, about 60px). So this is the
    // ceiling with both in place, not a design target.
    const box = await page.locator("#caldav-url").boundingBox();
    expect(box).not.toBeNull();
    expect(box?.y ?? Number.POSITIVE_INFINITY).toBeLessThanOrEqual(680);
  });

  test("tucks the optional integrations into a collapsed group", async ({ page }) => {
    await page.goto("/");

    const group = page.locator("details", { has: page.locator("#omdb-api-key") });
    await expect(group.locator("summary")).toHaveText("Optional integrations");
    await expect(group).not.toHaveAttribute("open", "");
    for (const id of ["#omdb-api-key", "#omdb-paused", "#tmdb-api-key", "#webmcp-enabled"]) {
      await expect(page.locator(id)).toBeHidden();
    }

    await group.locator("summary").click();
    for (const id of ["#omdb-api-key", "#omdb-paused", "#tmdb-api-key", "#webmcp-enabled"]) {
      await expect(page.locator(id)).toBeVisible();
    }
  });

  test("states the privacy claim in one sentence that links to the privacy page", async ({
    page,
  }) => {
    await page.goto("/");

    const claim = page.getByText(/stored in this browser/);
    await expect(claim).toContainText("only to the server you enter");
    await expect(claim).toContainText("no proxy or analytics");
    await expect(claim.getByRole("link", { name: "privacy page" })).toHaveAttribute(
      "href",
      "/privacy",
    );
  });

  // Same warning as /disclaimer and docs/connecting.md — shown here since
  // this is the point a visitor can still decide to use a dedicated
  // calendar, before they've typed in real credentials.
  test("shows a use-at-your-own-risk notice before the form fields", async ({ page }) => {
    await page.goto("/");

    const notice = page.getByText("Use at your own risk.");
    await expect(notice).toBeVisible();
    await expect(page.getByText(/dedicated to your movie viewings/i)).toBeVisible();

    const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
    expect(results.violations).toEqual([]);
  });

  test("a returning visitor with stored credentials skips the first-load form", async ({
    page,
  }) => {
    await connect(page);

    mockEmptyEventList(page);
    await page.reload();

    await expect(page.getByRole("button", { name: "Log a viewing" })).toBeVisible();
    await expect(page.locator("#caldav-url")).toHaveCount(0);
  });

  test("submitting with no OMDb key set succeeds and doesn't block connecting", async ({
    page,
  }) => {
    mockEmptyEventList(page);
    await page.goto("/");
    await page.locator("#caldav-url").fill(CREDENTIALS["caldav-url"]);
    await page.locator("#caldav-username").fill(CREDENTIALS["caldav-username"]);
    await page.locator("#caldav-password").fill(CREDENTIALS["caldav-password"]);
    await expect(page.locator("#omdb-api-key")).toHaveValue("");

    await page.getByRole("button", { name: "Connect" }).click();

    await expect(page.getByRole("button", { name: "Log a viewing" })).toBeVisible();
  });

  // #360/#400 (credentials spec, "TMDb API key is optional"): same
  // optional/opt-in treatment as the OMDb key above — submitting with
  // none set doesn't block connecting, and no TMDb call is ever made.
  test("submitting with no TMDb key set succeeds and doesn't block connecting", async ({
    page,
  }) => {
    mockEmptyEventList(page);
    await page.goto("/");
    await page.locator("#caldav-url").fill(CREDENTIALS["caldav-url"]);
    await page.locator("#caldav-username").fill(CREDENTIALS["caldav-username"]);
    await page.locator("#caldav-password").fill(CREDENTIALS["caldav-password"]);
    await expect(page.locator("#tmdb-api-key")).toHaveValue("");

    await page.getByRole("button", { name: "Connect" }).click();

    await expect(page.getByRole("button", { name: "Log a viewing" })).toBeVisible();
  });
});

test.describe("settings screen", () => {
  test("shows the visitor's current values", async ({ page }) => {
    await connect(page);

    await page.goto("/settings");

    await expect(page.locator("#caldav-username")).toHaveValue(CREDENTIALS["caldav-username"]);

    const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
    expect(results.violations).toEqual([]);
  });

  test("updating the CalDAV password overwrites the stored value", async ({ page }) => {
    await connect(page);
    await page.goto("/settings");

    await page.locator("#caldav-password").fill("a new password");
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByRole("status")).toHaveText("Saved.");

    // The credentials store is the single source every future CalDAV call
    // reads from, so confirming it holds the new value here is confirming
    // it's what the next call will use.
    await page.reload();
    await expect(page.locator("#caldav-password")).toHaveValue("a new password");
  });

  // #80: the pause checkbox is a real, persisted setting like every other
  // field here, not just an in-page toggle.
  test("pausing OMDb lookups on the settings screen persists across reload", async ({ page }) => {
    await connect(page, "test-omdb-key");
    await page.goto("/settings");

    await expect(page.locator("#omdb-paused")).not.toBeChecked();
    await openOptionalIntegrations(page);
    await page.locator("#omdb-paused").check();
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByRole("status")).toHaveText("Saved.");

    await page.reload();
    await expect(page.locator("#omdb-paused")).toBeChecked();
  });

  // #360/#400: the new TMDb key persists across a reload the same way
  // the existing OMDb key already does.
  test("setting a TMDb key on the settings screen persists across reload", async ({ page }) => {
    await connect(page);
    await page.goto("/settings");

    await expect(page.locator("#tmdb-api-key")).toHaveValue("");
    await openOptionalIntegrations(page);
    await page.locator("#tmdb-api-key").fill("test-tmdb-key");
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByRole("status")).toHaveText("Saved.");

    await page.reload();
    await expect(page.locator("#tmdb-api-key")).toHaveValue("test-tmdb-key");
  });
});
