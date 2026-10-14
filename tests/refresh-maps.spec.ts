import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import { mockCaldavServer } from "./support/mock-caldav";

const CREDENTIALS = {
  "caldav-url": "https://caldav.example.com/calendars/me/movies/",
  "caldav-username": "me",
  "caldav-password": "secret",
};

const VENUE = "City, Kleine-Gartmanplantsoen 15-19, 1017 RP Amsterdam, Netherlands";
const ONE_MONTH_AGO = new Date(Math.floor((Date.now() - 30 * 24 * 60 * 60 * 1000) / 1000) * 1000);

function viewing(uid: string, title: string, venue: string, geo?: { lat: number; lon: number }) {
  return {
    uid,
    title,
    start: ONE_MONTH_AGO.toISOString(),
    end: new Date(ONE_MONTH_AGO.getTime() + 60 * 60 * 1000).toISOString(),
    medium: "cinema",
    venue,
    geo,
  };
}

async function connect(page: Page) {
  await page.goto("/");
  await page.locator("#caldav-url").fill(CREDENTIALS["caldav-url"]);
  await page.locator("#caldav-username").fill(CREDENTIALS["caldav-username"]);
  await page.locator("#caldav-password").fill(CREDENTIALS["caldav-password"]);
  await page.getByRole("button", { name: "Connect" }).click();
  await expect(page.getByRole("link", { name: "Venues" })).toBeVisible();
}

// #869
test.describe("Refresh maps on the Venues page", () => {
  test("looks up a venue with no coordinates, then writes them to its viewings once ticked", async ({
    page,
  }) => {
    const nominatim: string[] = [];
    await page.route("https://nominatim.openstreetmap.org/**", async (route) => {
      nominatim.push(new URL(route.request().url()).searchParams.get("q") ?? "");
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: { "access-control-allow-origin": "*" },
        body: JSON.stringify([
          { display_name: "Kleine-Gartmanplantsoen 15, Amsterdam", lat: "52.36", lon: "4.88" },
        ]),
      });
    });
    const server = mockCaldavServer(page, CREDENTIALS["caldav-url"], [
      viewing("a", "Dune", VENUE),
      viewing("b", "Alien", VENUE),
      viewing("c", "Heat", "Elsewhere", { lat: 1, lon: 2 }),
    ]);
    await connect(page);
    await page.goto("/venues");

    // Nothing is looked up just from opening the page.
    await expect(page.getByRole("heading", { name: "Refresh maps" })).toBeVisible();
    expect(nominatim).toEqual([]);

    await page.getByRole("button", { name: "Find missing maps" }).click();
    await expect(
      page.getByRole("row", { name: /Kleine-Gartmanplantsoen 15, Amsterdam/ }),
    ).toBeVisible();
    expect(nominatim).toEqual([VENUE]);
    await expect(page.getByRole("checkbox", { name: `Use the match for ${VENUE}` })).toBeChecked();
    expect(server.updates).toHaveLength(0);

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    expect(results.violations).toEqual([]);

    await page.getByRole("button", { name: "Update viewings" }).click();
    await expect(page.getByText("Updated 2 viewings.")).toBeVisible();
    expect(server.updates.map((v) => v.uid).sort()).toEqual(["a", "b"]);
    expect(server.updates.every((v) => v.geo?.lat === 52.36 && v.geo?.lon === 4.88)).toBe(true);
  });

  test("writes nothing for a venue the geocoder can't find", async ({ page }) => {
    await page.route("https://nominatim.openstreetmap.org/**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: { "access-control-allow-origin": "*" },
        body: "[]",
      });
    });
    const server = mockCaldavServer(page, CREDENTIALS["caldav-url"], [
      viewing("a", "Dune", "Nowhere"),
    ]);
    await connect(page);
    await page.goto("/venues");

    await page.getByRole("button", { name: "Find missing maps" }).click();
    await expect(page.getByRole("cell", { name: /Nothing found/ })).toBeVisible();
    await expect(page.getByRole("checkbox", { name: "Use the match for Nowhere" })).toBeDisabled();
    await page.getByRole("button", { name: "Update viewings" }).click();
    await expect(page.getByText("Updated 0 viewings.")).toBeVisible();
    expect(server.updates).toHaveLength(0);
  });

  test("writes nothing for a found venue the visitor clears the box on", async ({ page }) => {
    await page.route("https://nominatim.openstreetmap.org/**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: { "access-control-allow-origin": "*" },
        body: JSON.stringify([{ display_name: "Somewhere", lat: "52.36", lon: "4.88" }]),
      });
    });
    const server = mockCaldavServer(page, CREDENTIALS["caldav-url"], [viewing("a", "Dune", VENUE)]);
    await connect(page);
    await page.goto("/venues");

    await page.getByRole("button", { name: "Find missing maps" }).click();
    await expect(page.getByRole("cell", { name: "Somewhere (52.36, 4.88)" })).toBeVisible();
    await page.getByRole("checkbox", { name: `Use the match for ${VENUE}` }).uncheck();
    await page.getByRole("button", { name: "Update viewings" }).click();
    await expect(page.getByText("Updated 0 viewings.")).toBeVisible();
    expect(server.updates).toHaveLength(0);
  });

  test("isn't offered when every venue already has coordinates", async ({ page }) => {
    mockCaldavServer(page, CREDENTIALS["caldav-url"], [
      viewing("a", "Dune", VENUE, { lat: 1, lon: 2 }),
    ]);
    await connect(page);
    await page.goto("/venues");
    await expect(page.getByRole("status").first()).toContainText("1 venue");
    await expect(page.getByRole("heading", { name: "Refresh maps" })).toHaveCount(0);
  });
});
