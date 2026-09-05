import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import { mockCaldavServer } from "./support/mock-caldav";

const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

const CREDENTIALS = {
  "caldav-url": "https://caldav.example.com/calendars/me/movies/",
  "caldav-username": "me",
  "caldav-password": "secret",
};

// Enough rows that the page is genuinely taller than a small viewport —
// j/k/gg/G need real scrollable height to prove anything.
function manyViewings(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    uid: `viewing-${i}`,
    title: `Movie ${String(i).padStart(2, "0")}`,
    start: new Date(Date.now() - i * 24 * 60 * 60 * 1000).toISOString(),
    end: new Date(Date.now() - i * 24 * 60 * 60 * 1000 + 60 * 60 * 1000).toISOString(),
    medium: "cinema",
  }));
}

async function connect(page: Page) {
  await page.goto("/");
  await page.locator("#caldav-url").fill(CREDENTIALS["caldav-url"]);
  await page.locator("#caldav-username").fill(CREDENTIALS["caldav-username"]);
  await page.locator("#caldav-password").fill(CREDENTIALS["caldav-password"]);
  await page.getByRole("button", { name: "Connect" }).click();
  await expect(page.getByRole("link", { name: "Log a viewing" })).toBeVisible();
}

// #68: present on every page via Layout.astro — the unauthenticated home
// page is enough for the overlay's own behaviour; scrolling needs actual
// scrollable content, covered separately below.
test.describe("keyboard shortcuts help overlay", () => {
  test("the ? key opens it, listing every binding", async ({ page }) => {
    await page.goto("/");

    await page.keyboard.press("?");

    const dialog = page.getByRole("dialog", { name: "Keyboard shortcuts" });
    await expect(dialog).toBeVisible();
    for (const [key, description] of [
      ["j", "Scroll down"],
      ["k", "Scroll up"],
      ["gg", "Jump to the top"],
      ["G", "Jump to the bottom"],
      ["?", "Toggle this help"],
      ["Esc", "Close this help"],
    ]) {
      await expect(dialog).toContainText(key as string);
      await expect(dialog).toContainText(description as string);
    }
  });

  test("the visible ? button in the header also opens it", async ({ page }) => {
    await page.goto("/");

    await page.getByRole("button", { name: "Keyboard shortcuts" }).click();

    await expect(page.getByRole("dialog", { name: "Keyboard shortcuts" })).toBeVisible();
  });

  test("Escape closes it", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Keyboard shortcuts" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();

    await page.keyboard.press("Escape");

    await expect(page.getByRole("dialog")).toHaveCount(0);
  });

  test("its own close button closes it", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Keyboard shortcuts" }).click();

    await page.getByRole("button", { name: "Close" }).click();

    await expect(page.getByRole("dialog")).toHaveCount(0);
  });

  test("clicking outside the dialog's own content closes it", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Keyboard shortcuts" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    // Near the very edge of the dialog box — inside the element itself
    // but outside the inner content div's own padding.
    await dialog.click({ position: { x: 2, y: 2 } });

    await expect(page.getByRole("dialog")).toHaveCount(0);
  });

  test("pressing ? again toggles it closed", async ({ page }) => {
    await page.goto("/");
    await page.keyboard.press("?");
    await expect(page.getByRole("dialog")).toBeVisible();

    await page.keyboard.press("?");

    await expect(page.getByRole("dialog")).toHaveCount(0);
  });

  test("introduces no accessibility violations while open", async ({ page }) => {
    await page.goto("/");
    await page.keyboard.press("?");
    await expect(page.getByRole("dialog")).toBeVisible();

    const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
    expect(results.violations).toEqual([]);
  });
});

test.describe("j/k/gg/G scroll the page", () => {
  test.use({ viewport: { width: 800, height: 400 } });

  test("j scrolls down and k scrolls up", async ({ page }) => {
    mockCaldavServer(page, CREDENTIALS["caldav-url"], manyViewings(30));
    await connect(page);
    await expect(page.locator("tbody tr").first()).toBeVisible();

    const before = await page.evaluate(() => window.scrollY);
    await page.keyboard.press("j");
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(before);
    const afterJ = await page.evaluate(() => window.scrollY);

    await page.keyboard.press("k");
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeLessThan(afterJ);
  });

  test("G jumps to the bottom, gg jumps back to the top", async ({ page }) => {
    mockCaldavServer(page, CREDENTIALS["caldav-url"], manyViewings(30));
    await connect(page);
    await expect(page.locator("tbody tr").first()).toBeVisible();

    await page.keyboard.press("G");
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);

    await page.keyboard.press("g");
    await page.keyboard.press("g");
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  });

  test("a single g, with no second press following, doesn't jump anywhere", async ({ page }) => {
    mockCaldavServer(page, CREDENTIALS["caldav-url"], manyViewings(30));
    await connect(page);
    await expect(page.locator("tbody tr").first()).toBeVisible();
    await page.keyboard.press("G");
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
    const afterG = await page.evaluate(() => window.scrollY);

    await page.keyboard.press("g");

    // #151: a bare read-then-assert here raced Chromium's own scroll
    // anchoring under CI load (confirmed live — failed with a different,
    // non-reproducible delta on each of 3 attempts) — poll like every
    // neighboring test in this file, rather than asserting a single
    // synchronous snapshot.
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(afterG);
  });
});

test("j/k/g/? don't fire while typing in a text field", async ({ page }) => {
  mockCaldavServer(page, CREDENTIALS["caldav-url"]);
  await connect(page);
  await page.getByRole("link", { name: "Log a viewing" }).click();

  await page.locator("#log-title").fill("gj?k");

  await expect(page.locator("#log-title")).toHaveValue("gj?k");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});
