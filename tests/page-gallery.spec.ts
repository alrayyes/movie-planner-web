import { expect, test } from "@playwright/test";
import { GALLERY_NOW, PAGES, pagePath } from "../scripts/page-gallery";
import type { LoggedViewing } from "../src/lib/caldav/types";
import { CREDENTIALS, DEMO_VIEWINGS } from "./support/demo";
import { mockCaldavServer } from "./support/mock-caldav";

// One picture per page, in both colour schemes, for the README's gallery.
// `bun run screenshots` runs this; playwright.config.ts leaves it out of a
// normal run, because it rewrites tracked files in docs/screenshots/pages/.
const OUT = "docs/screenshots/pages";

for (const mode of ["light", "dark"] as const) {
  for (const entry of PAGES) {
    test(`${entry.name} in ${mode} mode`, async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 960 });
      await page.emulateMedia({ colorScheme: mode });
      await page.clock.setFixedTime(new Date(GALLERY_NOW));
      mockCaldavServer(page, CREDENTIALS["caldav-url"], DEMO_VIEWINGS);

      if (entry.connected) {
        await page.goto("/");
        await page.locator("#caldav-url").fill(CREDENTIALS["caldav-url"]);
        await page.locator("#caldav-username").fill(CREDENTIALS["caldav-username"]);
        await page.locator("#caldav-password").fill(CREDENTIALS["caldav-password"]);
        await page.getByRole("button", { name: "Connect" }).click();
        await expect(page.getByRole("button", { name: "Log a viewing" })).toBeVisible();
      }

      const path = await pagePath(entry, DEMO_VIEWINGS as LoggedViewing[]);
      if (!entry.connected || path !== "/") await page.goto(path);

      await expect(page.locator("#page-container")).toBeVisible();
      await page.waitForLoadState("networkidle");
      await page.evaluate(() => document.fonts.ready);
      await page.locator("#page-container").screenshot({
        path: `${OUT}/${entry.slug}-${mode}.png`,
        animations: "disabled",
      });
    });
  }
}
