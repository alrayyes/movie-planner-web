import { expect, test } from "@playwright/test";

// Lighthouse scored the home page's layout shift at 0.84: <credentials-gate>
// was empty until its script ran, then grew by the whole connect form and
// shoved the footer down. 0.1 is the "good" threshold Lighthouse grades by, but
// the page has no reason to shift at all: <site-nav> was empty until its script
// ran too, pushing <main> down by the height of the nav (0.063 on a phone), so
// the bar is near zero.
const GOOD = 0.01;

for (const [name, width, height] of [
  ["phone", 412, 823],
  ["desktop", 1280, 800],
] as const) {
  test(`the connect form appears without shifting the ${name} layout`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.addInitScript(() => {
      const w = window as unknown as { __cls: number };
      w.__cls = 0;
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries() as unknown as {
          value: number;
          hadRecentInput: boolean;
        }[]) {
          if (!entry.hadRecentInput) w.__cls += entry.value;
        }
      }).observe({ type: "layout-shift", buffered: true });
    });

    await page.goto("/");
    await expect(page.locator("#caldav-url")).toBeVisible();
    // Layout shifts are reported on the next frame.
    await page.evaluate(
      () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
    );

    const cls = await page.evaluate(() => (window as unknown as { __cls: number }).__cls);
    expect(cls).toBeLessThan(GOOD);
  });
}

// #826: the font was only found once the inlined CSS parsed, so text reflowed
// after first paint when it swapped in.
test("preloads the Inter font so it doesn't swap in after first paint", async ({ page }) => {
  await page.goto("/");
  const preload = page.locator(
    'head link[rel="preload"][as="font"][type="font/woff2"][crossorigin]',
  );
  await expect(preload).toHaveAttribute("href", /inter-latin-wght-normal.*\.woff2$/);
});
