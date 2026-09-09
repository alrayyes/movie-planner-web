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
  // Credential storage is async — wait for its result to actually
  // render before doing anything else, so a test that navigates away
  // right after connect() isn't racing the write (same pattern every
  // other spec file's own connect() helper already uses).
  await expect(page.getByRole("link", { name: "Log a viewing" })).toBeVisible();
}

// #66: the "Fork me on GitHub" ribbon — present on every page via
// Layout.astro, so a single check on the unauthenticated home page
// covers it.
test.describe("Fork me on GitHub ribbon", () => {
  test("links to the repo in a new tab", async ({ page }) => {
    await page.goto("/");

    const link = page.getByRole("link", { name: "Fork me on GitHub" });
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute("href", "https://github.com/alrayyes/movie-planner-web");
    await expect(link).toHaveAttribute("target", "_blank");
    await expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  test("introduces no accessibility violations", async ({ page }) => {
    await page.goto("/");

    const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
    expect(results.violations).toEqual([]);
  });

  // #135: the ribbon's diagonal banner used to sit close enough to the
  // header's dark-mode toggle, on narrow and medium viewports, that a
  // click meant for the toggle could land on the ribbon's link instead.
  // A raw bounding-box comparison isn't the right check here: the
  // rotated banner's untransformed box is much bigger than its visible
  // diagonal strip, so two boxes "overlapping" doesn't mean a click
  // would actually be intercepted. Clicking the toggle and confirming
  // it actually flips is the real invariant.
  test("a click on the dark-mode toggle reaches the toggle, not the ribbon", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 400 });
    await page.goto("/");

    const toggle = page.getByRole("switch", { name: /switch to (dark|light) mode/i });
    const before = await toggle.getAttribute("aria-checked");

    await toggle.click();

    await expect(toggle).not.toHaveAttribute("aria-checked", before ?? "");
  });

  // #433: the mobile breakpoint added for #66 (max-width: 640px) shrinks
  // `.gh-ribbon` to a 130x130px clipped box and its rotated band to match,
  // but "Fork me on GitHub" doesn't actually fit that band at real font
  // rendering — the glyphs themselves (not just the band's own, always-
  // larger-than-the-box unrotated footprint, which is expected to be
  // clipped by design) spill past the box's edges, cutting off "F" at the
  // top and "GitHub" at the right. Checked at the breakpoint boundary
  // itself and at real device widths, not just one arbitrary size
  // (design.md's own risk callout).
  for (const width of [640, 393, 320]) {
    test(`renders no glyph clipped outside the ribbon box at ${width}px wide`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      await page.goto("/");

      const link = page.getByRole("link", { name: "Fork me on GitHub" });
      await expect(link).toBeVisible();

      // The tight bounding box of the rendered text glyphs themselves
      // (post-rotation, via a Range rather than the anchor's own much
      // larger unrotated box) versus the container's clipped box — any
      // of the four comparisons failing means a real letter, not just
      // the band's empty tail, is being cut off.
      const textBox = await link.evaluate((el) => {
        const range = document.createRange();
        range.selectNodeContents(el);
        const rect = range.getBoundingClientRect();
        return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom };
      });
      const containerBox = await page.locator(".gh-ribbon").evaluate((el) => {
        const rect = el.getBoundingClientRect();
        return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom };
      });

      // 1px slack for anti-aliasing/sub-pixel rounding, not a real margin.
      expect(textBox.left).toBeGreaterThanOrEqual(containerBox.left - 1);
      expect(textBox.top).toBeGreaterThanOrEqual(containerBox.top - 1);
      expect(textBox.right).toBeLessThanOrEqual(containerBox.right + 1);
      expect(textBox.bottom).toBeLessThanOrEqual(containerBox.bottom + 1);
    });
  }
});

// #434: a logo to the left of the "Movie Planner" title, in the same
// link to /.
test.describe("header brand logo", () => {
  test("shows a decorative logo immediately to the left of the title, inside the link to /", async ({
    page,
  }) => {
    await page.goto("/");

    const brandLink = page.getByRole("link", { name: "Movie Planner" });
    const logo = brandLink.locator("svg");
    await expect(logo).toBeVisible();

    // Decorative — the "Movie Planner" text right next to it already
    // says the same thing, so the mark doesn't get its own label and the
    // link's accessible name stays just the title text.
    await expect(logo).toHaveAttribute("aria-hidden", "true");
    await expect(brandLink).toHaveAccessibleName("Movie Planner");

    // "Immediately to the left" is a box-order claim: the logo's box has
    // to end at or before where the title text's own box begins.
    const { logoRight, textLeft } = await brandLink.evaluate((el) => {
      const svg = el.querySelector("svg");
      if (svg === null) {
        throw new Error("expected the brand link to contain an svg logo");
      }
      const svgRect = svg.getBoundingClientRect();
      const textNode = Array.from(el.childNodes).find(
        (node) => node.nodeType === Node.TEXT_NODE && node.textContent?.trim(),
      );
      if (textNode === undefined) {
        throw new Error("expected the brand link to contain a title text node");
      }
      const range = document.createRange();
      range.selectNode(textNode);
      const textRect = range.getBoundingClientRect();
      return { logoRight: svgRect.right, textLeft: textRect.left };
    });
    expect(logoRight).toBeLessThanOrEqual(textLeft);
  });

  // design.md's risk callout: a favicon-sized mark's internal `@media
  // (prefers-color-scheme)` fill doesn't track this app's own
  // class-based toggle (global.css's `@custom-variant dark`, flipped by
  // the dark-mode switch rather than the OS setting alone) — reusing
  // favicon.svg via a plain <img> would go illegible the moment a
  // visitor's manual choice disagrees with their OS preference. This
  // confirms the logo's fill actually follows the in-app toggle.
  test("logo's fill follows the in-app dark-mode toggle, not just the OS preference", async ({
    page,
  }) => {
    await page.goto("/");
    const logo = page.getByRole("link", { name: "Movie Planner" }).locator("svg");

    const before = await logo.evaluate((el) => getComputedStyle(el).fill);
    await page.getByRole("switch", { name: /switch to (dark|light) mode/i }).click();
    const after = await logo.evaluate((el) => getComputedStyle(el).fill);

    expect(after).not.toBe(before);
  });

  // #434 acceptance criteria: doesn't crowd the title or header-actions
  // at a mobile viewport.
  test("doesn't overlap the title text or header-actions at a mobile viewport", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 800 });
    await page.goto("/");

    const brandLink = page.getByRole("link", { name: "Movie Planner" });
    const actions = page.locator(".header-actions");

    const linkBox = await brandLink.boundingBox();
    const actionsBox = await actions.boundingBox();

    if (linkBox === null || actionsBox === null) {
      throw new Error("expected both the brand link and header-actions to have a layout box");
    }
    expect(linkBox.x + linkBox.width).toBeLessThanOrEqual(actionsBox.x);
  });
});

// #127: used to only ever appear on the home page (built inside
// credentials-gate.ts's own renderConnected()) — every other page had
// no way to reach any other page except editing the URL.
test.describe("site nav", () => {
  test("appears immediately after connecting, without a page reload", async ({ page }) => {
    mockCaldavServer(page, CREDENTIALS["caldav-url"]);
    await page.goto("/");
    await expect(page.getByRole("link", { name: "Log a viewing" })).toHaveCount(0);

    await page.locator("#caldav-url").fill(CREDENTIALS["caldav-url"]);
    await page.locator("#caldav-username").fill(CREDENTIALS["caldav-username"]);
    await page.locator("#caldav-password").fill(CREDENTIALS["caldav-password"]);
    await page.getByRole("button", { name: "Connect" }).click();

    await expect(page.getByRole("link", { name: "Log a viewing" })).toBeVisible();
  });

  test("appears on a non-home page too, and its links work from there", async ({ page }) => {
    mockCaldavServer(page, CREDENTIALS["caldav-url"]);
    await connect(page);

    await page.goto("/privacy");

    await expect(page.getByRole("link", { name: "Viewings" })).toHaveAttribute("href", "/");
    await expect(page.getByRole("link", { name: "Venues" })).toHaveAttribute("href", "/venues");
    await expect(page.getByRole("link", { name: "Calendar" })).toHaveAttribute("href", "/calendar");
    await expect(page.getByRole("link", { name: "Map", exact: true })).toHaveAttribute(
      "href",
      "/map",
    );
    await expect(page.getByRole("link", { name: "Log a viewing" })).toHaveAttribute("href", "/log");
    await expect(page.getByRole("link", { name: "Import" })).toHaveAttribute("href", "/import");
    await expect(page.getByRole("link", { name: "Activity" })).toHaveAttribute("href", "/activity");
    await expect(page.getByRole("link", { name: "Settings" })).toHaveAttribute("href", "/settings");

    // #161/#204/#237/#349: Viewings, Venues, Calendar, Map, Log a
    // viewing, Import, Activity, Settings, in that order — not just
    // present, but in the order a visitor reads them.
    await expect(page.locator("site-nav a")).toHaveText([
      "Viewings",
      "Venues",
      "Calendar",
      "Map",
      "Log a viewing",
      "Import",
      "Activity",
      "Settings",
    ]);

    await page.getByRole("link", { name: "Venues" }).click();
    await expect(page.getByRole("heading", { name: "Venues" })).toBeVisible();
  });

  test("doesn't appear before a visitor has connected", async ({ page }) => {
    await page.goto("/privacy");

    await expect(page.getByRole("link", { name: "Log a viewing" })).toHaveCount(0);
  });
});

// #375
test.describe("breadcrumb", () => {
  const ONE_MONTH_AGO = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const DUNE = {
    uid: "dune-uid",
    title: "Dune",
    start: ONE_MONTH_AGO.toISOString(),
    end: new Date(ONE_MONTH_AGO.getTime() + 2.5 * 60 * 60 * 1000).toISOString(),
    medium: "cinema",
    director: "Denis Villeneuve",
  };

  test("shows nothing on the unfiltered overview — a single 'Home' crumb linking to itself carries nothing", async ({
    page,
  }) => {
    mockCaldavServer(page, CREDENTIALS["caldav-url"], [DUNE]);
    await connect(page);

    await expect(page.getByRole("navigation", { name: "Breadcrumb" })).toHaveCount(0);
  });

  test("reads 'Home / <label>' on the overview filtered by a chip-driven query param, linking back to the unfiltered overview", async ({
    page,
  }) => {
    mockCaldavServer(page, CREDENTIALS["caldav-url"], [DUNE]);
    await connect(page);

    await page.goto("/?director=Denis%20Villeneuve");

    const nav = page.getByRole("navigation", { name: "Breadcrumb" });
    await expect(nav).toBeVisible();
    await expect(nav).toContainText("Denis Villeneuve (director)");
    await expect(nav.getByRole("link", { name: "Home" })).toHaveAttribute("href", "/");
  });

  test("stays in sync with a filter typed directly into the form, not just the URL a chip link loaded with", async ({
    page,
  }) => {
    mockCaldavServer(page, CREDENTIALS["caldav-url"], [DUNE]);
    await connect(page);
    await expect(page.getByRole("navigation", { name: "Breadcrumb" })).toHaveCount(0);

    await page.getByText("Filters", { exact: true }).click();
    await page.locator("#overview-director").fill("Denis Villeneuve");
    await page.getByRole("button", { name: "Filter", exact: true }).click();

    await expect(page.getByRole("navigation", { name: "Breadcrumb" })).toContainText(
      "Denis Villeneuve (director)",
    );
  });

  test("shows a fixed 'Home / <page name>' trail on every other page", async ({ page }) => {
    mockCaldavServer(page, CREDENTIALS["caldav-url"], [DUNE]);
    await connect(page);

    for (const [href, name] of [
      ["/venues", "Venues"],
      ["/import", "Import"],
      ["/log", "Log a viewing"],
      ["/settings", "Settings"],
      ["/map", "Map"],
      ["/activity", "Activity"],
    ] as const) {
      await page.goto(href);
      const nav = page.getByRole("navigation", { name: "Breadcrumb" });
      await expect(nav).toBeVisible();
      await expect(nav).toContainText(name);
      await expect(nav.getByRole("link", { name: "Home" })).toHaveAttribute("href", "/");
    }
  });

  test("shows 'Home / Movie details' on a viewing's own details page", async ({ page }) => {
    mockCaldavServer(page, CREDENTIALS["caldav-url"], [DUNE]);
    await connect(page);

    await page.getByRole("link", { name: "Dune", exact: true }).click();

    const nav = page.getByRole("navigation", { name: "Breadcrumb" });
    await expect(nav).toBeVisible();
    await expect(nav).toContainText("Movie details");
  });

  test("uses <nav aria-label='Breadcrumb'> with an ordered list, and introduces no accessibility violations", async ({
    page,
  }) => {
    mockCaldavServer(page, CREDENTIALS["caldav-url"], [DUNE]);
    await connect(page);
    await page.goto("/venues");

    await expect(page.locator("nav[aria-label='Breadcrumb'] ol")).toBeVisible();

    const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
    expect(results.violations).toEqual([]);
  });
});

// #67
test.describe("footer", () => {
  test("links to GitHub, the disclaimer, and the privacy page, with a copyright line", async ({
    page,
  }) => {
    await page.goto("/");

    const footer = page.locator("footer");
    await expect(footer.getByRole("link", { name: "GitHub" })).toHaveAttribute(
      "href",
      "https://github.com/alrayyes/movie-planner-web",
    );
    await expect(footer.getByRole("link", { name: "About" })).toHaveAttribute("href", "/about");
    await expect(footer.getByRole("link", { name: "Disclaimer" })).toHaveAttribute(
      "href",
      "/disclaimer",
    );
    await expect(footer.getByRole("link", { name: "Privacy" })).toHaveAttribute("href", "/privacy");
    await expect(footer).toContainText("GPL-3.0-or-later");
  });

  // #369: the deployed package.json version, linked to the changelog.
  test("links to the changelog, labelled with the deployed version", async ({ page }) => {
    await page.goto("/");

    const footer = page.locator("footer");
    const versionLink = footer.getByRole("link", { name: /^v\d+\.\d+\.\d+$/ });
    await expect(versionLink).toHaveAttribute("href", "/changelog");
  });

  test("privacy page states the fully static, browser-only storage claim, with a clean a11y scan", async ({
    page,
  }) => {
    await page.goto("/privacy");

    await expect(page.getByRole("heading", { name: "Privacy" })).toBeVisible();
    await expect(page.getByText(/fully static/i)).toBeVisible();
    await expect(page.getByText(/IndexedDB/i)).toBeVisible();

    const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
    expect(results.violations).toEqual([]);
  });

  test("disclaimer page states the unaffiliated, as-is claim, with a clean a11y scan", async ({
    page,
  }) => {
    await page.goto("/disclaimer");

    await expect(page.getByRole("heading", { name: "Disclaimer" })).toBeVisible();
    await expect(page.getByText(/independent hobby project/i)).toBeVisible();
    await expect(page.locator("main").getByText(/GPL-3.0-or-later/)).toBeVisible();
    // Beta/use-at-your-own-risk warning, kept in sync with docs/connecting.md
    // and the connect form's own intro.
    await expect(page.getByText("Use at your own risk.")).toBeVisible();
    await expect(page.getByText(/dedicated to your movie viewings/i)).toBeVisible();
    await expect(page.getByText(/aren't responsible for data loss/i)).toBeVisible();

    const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
    expect(results.violations).toEqual([]);
  });

  // #270: reachable without connecting, same as privacy/disclaimer — its
  // whole point is helping an undecided visitor judge the app before
  // they've typed anything into the connect form.
  test("about page tours the overview, venues, heatmap, and map, with a clean a11y scan", async ({
    page,
  }) => {
    await page.goto("/about");

    await expect(page.getByRole("heading", { name: "About Movie Planner" })).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "A calendar overview of everything you've watched" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Every venue you've been to, with a count" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "A GitHub-style heatmap of your viewing habits" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Every located viewing, pinned on one map" }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Connect your own CalDAV server" }),
    ).toHaveAttribute("href", "/");

    const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
    expect(results.violations).toEqual([]);
  });
});
