import { expect, test } from "@playwright/test";

// #70: a designed logo/favicon plus PWA install support (manifest.json
// for Android, apple-touch-icon + meta tags for iOS, which reads
// neither the manifest nor theme-color for "Add to Home Screen").
test.describe("logo, favicon, and PWA install support", () => {
  test("the manifest is valid JSON, reachable, and links every icon it declares", async ({
    page,
    request,
  }) => {
    await page.goto("/");

    await expect(page.locator('link[rel="manifest"]')).toHaveAttribute("href", "/manifest.json");

    const response = await request.get("/manifest.json");
    expect(response.ok()).toBe(true);
    const manifest = await response.json();
    expect(manifest.name).toBe("Movie Planner");
    expect(manifest.display).toBe("standalone");
    expect(Array.isArray(manifest.icons)).toBe(true);
    expect(manifest.icons.length).toBeGreaterThan(0);

    for (const icon of manifest.icons) {
      const iconResponse = await request.get(icon.src);
      expect(iconResponse.ok(), `expected ${icon.src} to resolve`).toBe(true);
    }
  });

  test("the apple-touch-icon resolves and iOS install meta tags are present", async ({
    page,
    request,
  }) => {
    await page.goto("/");

    const appleTouchIconHref = await page
      .locator('link[rel="apple-touch-icon"]')
      .getAttribute("href");
    expect(appleTouchIconHref).toBeTruthy();
    if (!appleTouchIconHref) throw new Error("expected an apple-touch-icon href");

    const response = await request.get(appleTouchIconHref);
    expect(response.ok()).toBe(true);

    await expect(page.locator('meta[name="apple-mobile-web-app-capable"]')).toHaveAttribute(
      "content",
      "yes",
    );
    await expect(page.locator('meta[name="apple-mobile-web-app-title"]')).toHaveAttribute(
      "content",
      "Movie Planner",
    );
  });

  test("the favicon.svg and favicon.ico both resolve", async ({ request }) => {
    const svgResponse = await request.get("/favicon.svg");
    expect(svgResponse.ok()).toBe(true);
    const icoResponse = await request.get("/favicon.ico");
    expect(icoResponse.ok()).toBe(true);
  });
});

// #590: the manifest and icons alone only get a bookmark-style "Add to
// Home screen" shortcut on Android/desktop Chrome. The native install
// prompt (beforeinstallprompt banner, desktop omnibox install icon) also
// requires a registered service worker with a fetch handler.
test.describe("service worker registration", () => {
  test("/sw.js resolves as a script with install, activate, and fetch handlers", async ({
    request,
  }) => {
    const response = await request.get("/sw.js");
    expect(response.ok()).toBe(true);

    const body = await response.text();
    expect(body).toContain('addEventListener("install"');
    expect(body).toContain('addEventListener("activate"');
    expect(body).toContain('addEventListener("fetch"');
  });

  test("the browser registers the service worker after the page loads", async ({ page }) => {
    await page.goto("/");

    const registration = await page.evaluate(async () => {
      if (!("serviceWorker" in navigator)) return null;
      const registration = await navigator.serviceWorker.ready;
      return registration.active?.scriptURL ?? null;
    });

    expect(registration).toBe(`${new URL(page.url()).origin}/sw.js`);
  });
});
