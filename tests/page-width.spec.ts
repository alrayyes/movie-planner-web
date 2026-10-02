import { expect, type Page, test } from "@playwright/test";
import { mockCaldavServer } from "./support/mock-caldav";

// #682: the container's own width differed per page (6xl for the overview and
// calendar, 3xl for venues, settings and the other lists and forms), so at
// 1280px the logo moved from x=96 to x=288 and the header controls moved with
// it as a visitor clicked through the nav tabs. The container is now the same
// everywhere; a narrow page narrows only its content card.

const CREDENTIALS = {
  "caldav-url": "https://caldav.example.com/calendars/me/movies/",
  "caldav-username": "me",
  "caldav-password": "secret",
};

// Wide and narrow pages mixed, reached the way a visitor reaches them.
const PAGES = ["/", "/calendar", "/venues", "/genres", "/settings", "/log", "/privacy"];

async function connect(page: Page) {
  await page.goto("/");
  await page.locator("#caldav-url").fill(CREDENTIALS["caldav-url"]);
  await page.locator("#caldav-username").fill(CREDENTIALS["caldav-username"]);
  await page.locator("#caldav-password").fill(CREDENTIALS["caldav-password"]);
  await page.getByRole("button", { name: "Connect" }).click();
  await expect(page.getByRole("button", { name: "Log a viewing" })).toBeVisible();
}

test.describe("page width at 1280px", () => {
  test("the header sits in the same place on every page", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    mockCaldavServer(page, CREDENTIALS["caldav-url"]);
    await connect(page);

    const seen: Record<string, { logoLeft: number; toggleRight: number }> = {};
    for (const path of PAGES) {
      await page.goto(path);
      const logo = page.locator("header a").first();
      const toggle = page.getByRole("switch", { name: /switch to (dark|light) mode/i });
      await expect(logo).toBeVisible();
      const logoBox = await logo.boundingBox();
      const toggleBox = await toggle.boundingBox();
      seen[path] = {
        logoLeft: Math.round((logoBox as NonNullable<typeof logoBox>).x),
        toggleRight: Math.round(
          (toggleBox as NonNullable<typeof toggleBox>).x +
            (toggleBox as NonNullable<typeof toggleBox>).width,
        ),
      };
    }

    const first = seen[PAGES[0]];
    for (const path of PAGES) {
      expect(seen[path], `${path} against ${PAGES[0]}`).toEqual(first);
    }
  });

  test("a narrow page narrows only its content card, left-aligned under the header", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    mockCaldavServer(page, CREDENTIALS["caldav-url"]);
    await connect(page);

    await page.goto("/settings");
    const logo = await page.locator("header a").first().boundingBox();
    const card = await page.locator("main").boundingBox();
    const logoBox = logo as NonNullable<typeof logo>;
    const cardBox = card as NonNullable<typeof card>;

    // Same left edge as the logo (the container's content edge), and the
    // card is still the narrow reading width, not stretched to the container.
    expect(Math.round(cardBox.x)).toBe(Math.round(logoBox.x));
    expect(cardBox.width).toBeLessThanOrEqual(768);
  });
});
