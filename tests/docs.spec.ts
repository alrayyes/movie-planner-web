import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import { mockCaldavServer } from "./support/mock-caldav";

const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

const CREDENTIALS = {
  "caldav-url": "https://caldav.example.com/calendars/me/movies/",
  "caldav-username": "me",
  "caldav-password": "secret",
};

async function connect(page: Page) {
  await page.goto("/");
  await page.locator("#caldav-url").fill(CREDENTIALS["caldav-url"]);
  await page.locator("#caldav-username").fill(CREDENTIALS["caldav-username"]);
  await page.locator("#caldav-password").fill(CREDENTIALS["caldav-password"]);
  await page.getByRole("button", { name: "Connect" }).click();
  await expect(page.getByRole("link", { name: "Log a viewing" })).toBeVisible();
}

// #71: the Starlight-powered usage guide, mounted at /docs alongside the
// rest of this fully static app — a build-time integration, so this is a
// smoke test confirming the mount actually works and stays accessible,
// not a page-by-page content check.
test.describe("docs", () => {
  test("the docs index renders with its own navigation, not a 404", async ({ page }) => {
    await page.goto("/docs/");
    await expect(page).toHaveTitle(/Movie Planner docs/);
    await expect(page.getByRole("heading", { name: "Movie Planner docs", level: 1 })).toBeVisible();
    await expect(
      page
        .getByRole("main")
        .getByRole("link", { name: "Connecting your CalDAV server", exact: true }),
    ).toHaveAttribute("href", "/docs/connecting/");
  });

  test("a sub-page renders and links back to the index", async ({ page }) => {
    await page.goto("/docs/keyboard-shortcuts/");
    await expect(page.getByRole("heading", { name: "Keyboard shortcuts", level: 1 })).toBeVisible();
  });

  test("introduces no accessibility violations", async ({ page }) => {
    await page.goto("/docs/");
    const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
    expect(results.violations).toEqual([]);
  });

  // Same warning as /disclaimer and the connect form's own intro — worth
  // its own assertion since it's a Starlight `:::caution` directive, not
  // plain prose, and a misconfigured directive renders as raw, un-styled
  // text instead of failing the build.
  test("the connecting page shows the use-at-your-own-risk callout, with a clean a11y scan", async ({
    page,
  }) => {
    await page.goto("/docs/connecting/");
    await expect(page.getByText("Use at your own risk.")).toBeVisible();

    const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
    expect(results.violations).toEqual([]);
  });

  test("the main app's own pages still render untouched", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Movie Planner" })).toBeVisible();
  });

  // #451: docs pages get this app's own header/footer instead of
  // Starlight's own default chrome — the same nav and footer as every
  // other page. Starlight's own sidebar (docs-internal navigation) is
  // untouched.
  test.describe("shared header and footer", () => {
    test("shows the app's own header and footer, not Starlight's defaults", async ({ page }) => {
      await page.goto("/docs/");

      await expect(page.getByRole("link", { name: "Movie Planner" })).toHaveAttribute("href", "/");
      await expect(
        page.getByRole("switch", { name: /switch to (dark|light) mode/i }),
      ).toBeVisible();

      const footer = page.locator("footer");
      await expect(footer.getByRole("link", { name: "GitHub" })).toHaveAttribute(
        "href",
        "https://github.com/alrayyes/movie-planner-web",
      );
      await expect(footer.getByRole("link", { name: "Disclaimer" })).toHaveAttribute(
        "href",
        "/disclaimer",
      );
      await expect(footer.getByRole("link", { name: "Privacy" })).toHaveAttribute(
        "href",
        "/privacy",
      );

      // Starlight's own default Footer renders an "Edit page" link
      // (editLink.baseUrl is configured) — its absence confirms the
      // override actually replaced Starlight's Footer, not just added
      // to it.
      await expect(page.getByRole("link", { name: "Edit page" })).toHaveCount(0);
    });

    test("shows the same nav links as every other page, once connected", async ({ page }) => {
      mockCaldavServer(page, CREDENTIALS["caldav-url"]);
      await connect(page);

      await page.goto("/docs/");

      await expect(page.getByRole("link", { name: "Log a viewing" })).toBeVisible();
      await expect(page.locator("site-nav a")).toHaveText([
        "Viewings",
        "Venues",
        "Calendar",
        "Settings",
      ]);
    });

    // Mirrors site-nav.ts's own credentials gate — same component,
    // same behavior, everywhere it's mounted.
    test("shows no nav links before a visitor has connected", async ({ page }) => {
      await page.goto("/docs/");

      await expect(page.getByRole("link", { name: "Log a viewing" })).toHaveCount(0);
      await expect(page.locator("site-nav a")).toHaveCount(0);
    });

    test("Starlight's own sidebar is still present and navigates", async ({ page }) => {
      await page.goto("/docs/");

      // The wrapping <nav aria-label="Main"> itself has no box of its own
      // (Starlight positions both its mobile toggle and the sidebar pane
      // with `position: fixed`, taking them out of flow) — checking the
      // link actually reachable inside it is the real assertion.
      const sidebarLink = page
        .getByRole("navigation", { name: "Main" })
        .getByRole("link", { name: "Keyboard shortcuts", exact: true });
      await expect(sidebarLink).toBeVisible();

      await sidebarLink.click();
      await expect(
        page.getByRole("heading", { name: "Keyboard shortcuts", level: 1 }),
      ).toBeVisible();
    });

    test("introduces no accessibility violations", async ({ page }) => {
      await page.goto("/docs/");

      const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
      expect(results.violations).toEqual([]);
    });
  });

  // #392: Starlight manages its own theme independently (its own
  // localStorage key, its own <html data-theme> attribute) — an
  // explicit choice made on the main app (a different key, a .dark
  // class) previously never reached it.
  test.describe("theme sync with the main app", () => {
    test("an explicit dark preference on the main app carries over to a docs page", async ({
      page,
    }) => {
      await page.addInitScript(() => {
        localStorage.setItem("movie-planner-web-theme", "dark");
      });

      await page.goto("/docs/");

      await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    });

    test("an explicit light preference on the main app carries over to a docs page", async ({
      page,
    }) => {
      await page.addInitScript(() => {
        localStorage.setItem("movie-planner-web-theme", "light");
      });

      await page.goto("/docs/");

      await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    });

    // No stored app-side preference at all — Starlight's own default
    // (system preference) stays in charge, unchanged from before #392.
    test("with no stored app preference, Starlight's own default still applies", async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme: "light" });

      await page.goto("/docs/");

      await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    });

    // #451: the sync above only ever runs once, on first load, before
    // paint — using the app's own toggle (now mounted on docs pages
    // too) has to keep pushing the same update itself, or Starlight's
    // own chrome would drift out of sync with this app's the moment a
    // visitor actually uses it here.
    test("using the app's own theme toggle on a docs page updates Starlight's theme too, live", async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme: "light" });
      await page.goto("/docs/");

      const toggle = page.getByRole("switch", { name: /switch to (dark|light) mode/i });
      await expect(page.locator("html")).not.toHaveClass(/dark/);
      await expect(page.locator("html")).toHaveAttribute("data-theme", "light");

      await toggle.click();

      await expect(page.locator("html")).toHaveClass(/dark/);
      await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

      await toggle.click();

      await expect(page.locator("html")).not.toHaveClass(/dark/);
      await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    });
  });
});
