import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import { mockCaldavServer } from "./support/mock-caldav";

const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

const CREDENTIALS = {
  "caldav-url": "https://caldav.example.com/calendars/me/movies/",
  "caldav-username": "me",
  "caldav-password": "secret",
};

const ONE_MONTH_AGO = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
const TWO_MONTHS_AGO = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);

async function connect(page: Page) {
  await page.goto("/");
  await page.locator("#caldav-url").fill(CREDENTIALS["caldav-url"]);
  await page.locator("#caldav-username").fill(CREDENTIALS["caldav-username"]);
  await page.locator("#caldav-password").fill(CREDENTIALS["caldav-password"]);
  await page.getByRole("button", { name: "Connect" }).click();
  await expect(page.getByRole("link", { name: "Viewings" })).toBeVisible();
}

// #450/#535: director/actor/genre/movie-country/movie-language/rated/
// keyword all share the exact same listing+detail page shape
// (AttributeOverview.svelte/AttributeDetail.svelte), so their own
// coverage is one parametrized loop over this config — matching the
// source's own "one generalized pattern, not near-duplicate
// implementations" design — rather than seven near-identical spec
// files. `field` is the raw LoggedViewing property a fixture sets
// (`actors`, not `actor`); `paramName` is the query-string key both a
// chip link and this page's own URL agree on. Released year/month are
// NOT in this loop — see the "Released year/month pages" describe below
// — since neither is a raw LoggedViewing field a fixture can just set
// directly; both are computed from `released` via parseReleasedDate.
const ATTRIBUTE_KINDS = [
  {
    field: "director",
    paramName: "director",
    listingPath: "/directors",
    detailPath: "/director",
    plural: "Directors",
  },
  {
    field: "actors",
    paramName: "actor",
    listingPath: "/actors",
    detailPath: "/actor",
    plural: "Actors",
  },
  {
    field: "genre",
    paramName: "genre",
    listingPath: "/genres",
    detailPath: "/genre",
    plural: "Genres",
  },
  {
    field: "movieCountry",
    paramName: "movieCountry",
    listingPath: "/movie-countries",
    detailPath: "/movie-country",
    plural: "Movie countries",
  },
  {
    field: "movieLanguage",
    paramName: "movieLanguage",
    listingPath: "/movie-languages",
    detailPath: "/movie-language",
    plural: "Movie languages",
  },
  // #535: single-valued (never comma-separated), but splitMultiValue
  // already returns a comma-free string as its own single-element
  // array, so this fits the loop with no special-casing — the listing
  // path deliberately isn't "/ratings" (it's the field's own name,
  // matching MovieDetails.svelte's "Rated" label), and the detail path
  // ("/rating") deliberately differs from it — see attributes.ts's own
  // comment on the `rated` config entry.
  {
    field: "rated",
    paramName: "rated",
    listingPath: "/rated",
    detailPath: "/rating",
    plural: "Ratings",
  },
  {
    field: "keywords",
    paramName: "keyword",
    listingPath: "/keywords",
    detailPath: "/keyword",
    plural: "Keywords",
  },
] as const;

for (const { field, paramName, listingPath, detailPath, plural } of ATTRIBUTE_KINDS) {
  test.describe(`${plural} pages`, () => {
    test(`${listingPath} lists every distinct value with a count of logged viewings`, async ({
      page,
    }) => {
      mockCaldavServer(page, CREDENTIALS["caldav-url"], [
        {
          uid: "v1",
          title: "Movie One",
          start: ONE_MONTH_AGO.toISOString(),
          end: new Date(ONE_MONTH_AGO.getTime() + 60 * 60 * 1000).toISOString(),
          medium: "cinema",
          [field]: "Alpha Value",
        },
        {
          uid: "v2",
          title: "Movie Two",
          start: TWO_MONTHS_AGO.toISOString(),
          end: new Date(TWO_MONTHS_AGO.getTime() + 60 * 60 * 1000).toISOString(),
          medium: "cinema",
          [field]: "Alpha Value",
        },
        {
          uid: "v3",
          title: "Movie Three",
          start: TWO_MONTHS_AGO.toISOString(),
          end: new Date(TWO_MONTHS_AGO.getTime() + 60 * 60 * 1000).toISOString(),
          medium: "cinema",
          [field]: "Beta Value",
        },
      ]);
      await connect(page);
      await page.goto(listingPath);

      await expect(page.getByRole("heading", { name: plural })).toBeVisible();
      const rows = page.locator("tbody tr");
      await expect(rows).toHaveCount(2);
      // Sorted by count descending.
      await expect(rows.nth(0)).toContainText("Alpha Value");
      await expect(rows.nth(0)).toContainText("2");
      await expect(rows.nth(1)).toContainText("Beta Value");
      await expect(rows.nth(1)).toContainText("1");
    });

    // #450: clicking a value used to land on the main overview,
    // pre-filtered, carrying that page's own full filter chrome. It goes
    // to a dedicated, filter-free per-value page instead — matching the
    // pattern #448 already shipped for venues.
    test(`clicking a value on ${listingPath} goes to its own dedicated, filter-free page, with the breadcrumb reading "Home / ${plural} / {value}"`, async ({
      page,
    }) => {
      mockCaldavServer(page, CREDENTIALS["caldav-url"], [
        {
          uid: "v1",
          title: "Movie One",
          start: ONE_MONTH_AGO.toISOString(),
          end: new Date(ONE_MONTH_AGO.getTime() + 60 * 60 * 1000).toISOString(),
          medium: "cinema",
          [field]: "Alpha Value",
        },
        {
          uid: "v2",
          title: "Movie Two",
          start: TWO_MONTHS_AGO.toISOString(),
          end: new Date(TWO_MONTHS_AGO.getTime() + 60 * 60 * 1000).toISOString(),
          medium: "netflix",
        },
      ]);
      await connect(page);
      await page.goto(listingPath);

      await page.getByRole("link", { name: "Alpha Value" }).click();

      await expect(page).toHaveURL(
        new RegExp(`${detailPath}/?\\?${paramName}=Alpha(\\+|%20)Value`),
      );
      await expect(page.getByRole("heading", { name: "Alpha Value" })).toBeVisible();
      const rows = page.locator("tbody tr");
      await expect(rows).toHaveCount(1);
      await expect(rows).toContainText("Movie One");

      // No filter chrome of any kind, and no way to change the value.
      await expect(page.getByText("Filters", { exact: true })).toHaveCount(0);
      await expect(page.locator("input[type=text]")).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Filter", exact: true })).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Clear filter" })).toHaveCount(0);

      const nav = page.getByRole("navigation", { name: "Breadcrumb" });
      await expect(nav).toBeVisible();
      await expect(nav.getByRole("link", { name: "Home" })).toHaveAttribute("href", "/");
      // #534: the middle crumb is a real link back to the listing page,
      // not just text baked into a single flat label — and the tab
      // title reflects the specific value.
      await expect(nav.getByRole("link", { name: plural })).toHaveAttribute("href", listingPath);
      await expect(nav.getByText("Alpha Value")).toBeVisible();
      await expect(page).toHaveTitle(`Alpha Value — ${plural} — Movie Planner`);
    });

    test(`${detailPath} shows an empty-results state for a value matching nothing, not an error`, async ({
      page,
    }) => {
      mockCaldavServer(page, CREDENTIALS["caldav-url"], [
        {
          uid: "v1",
          title: "Movie One",
          start: ONE_MONTH_AGO.toISOString(),
          end: new Date(ONE_MONTH_AGO.getTime() + 60 * 60 * 1000).toISOString(),
          medium: "cinema",
          [field]: "Alpha Value",
        },
      ]);
      await connect(page);

      await page.goto(`${detailPath}?${paramName}=${encodeURIComponent("No Such Value")}`);

      await expect(page.locator("tbody tr")).toHaveCount(0);
      await expect(page.getByText("0 logged viewings.")).toBeVisible();
      await expect(page.getByRole("alert")).toHaveCount(0);
    });

    test(`${detailPath} asks a visitor with no stored credentials to connect first`, async ({
      page,
    }) => {
      await page.goto(`${detailPath}?${paramName}=${encodeURIComponent("Alpha Value")}`);

      await expect(page.getByText(/^Connect first to see this/)).toBeVisible();
    });
  });
}

// #535: rated and keyword reuse the exact same components as the
// original five #450 kinds, but get their own explicit a11y coverage
// per this repo's a11y convention rather than leaning on the shared
// behaviour block's director-only scan below to stand in for every kind.
test.describe("rated and keyword pages accessibility", () => {
  test("introduces no accessibility violations on either the listing or a per-value page", async ({
    page,
  }) => {
    mockCaldavServer(page, CREDENTIALS["caldav-url"], [
      {
        uid: "dune-uid",
        title: "Dune",
        start: ONE_MONTH_AGO.toISOString(),
        end: new Date(ONE_MONTH_AGO.getTime() + 60 * 60 * 1000).toISOString(),
        medium: "cinema",
        rated: "PG-13",
        keywords: "desert, prophecy",
      },
    ]);
    await connect(page);

    await page.goto("/rated");
    await expect(page.getByRole("heading", { name: "Ratings" })).toBeVisible();
    let results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
    expect(results.violations).toEqual([]);

    await page.goto(`/rating?rated=${encodeURIComponent("PG-13")}`);
    await expect(page.getByRole("heading", { name: "PG-13" })).toBeVisible();
    results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
    expect(results.violations).toEqual([]);

    await page.goto("/keywords");
    await expect(page.getByRole("heading", { name: "Keywords" })).toBeVisible();
    results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
    expect(results.violations).toEqual([]);

    await page.goto(`/keyword?keyword=${encodeURIComponent("desert")}`);
    await expect(page.getByRole("heading", { name: "desert" })).toBeVisible();
    results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
    expect(results.violations).toEqual([]);
  });
});

// #535: released year/month aren't raw LoggedViewing fields a fixture
// can just set (unlike every kind in ATTRIBUTE_KINDS above) — both are
// computed from `released` via parseReleasedDate, so a fixture sets
// `released` and this asserts against the year/month it parses to.
const RELEASED_KINDS = [
  {
    paramName: "releasedYear",
    listingPath: "/released-years",
    detailPath: "/released-year",
    plural: "Released years",
    releasedA: "22 Oct 2021",
    valueA: "2021",
    releasedB: "05 May 2020",
    valueB: "2020",
  },
  {
    paramName: "releasedMonth",
    listingPath: "/released-months",
    detailPath: "/released-month",
    plural: "Released months",
    releasedA: "22 Oct 2021",
    valueA: "2021-10",
    releasedB: "05 May 2020",
    valueB: "2020-05",
  },
] as const;

for (const {
  paramName,
  listingPath,
  detailPath,
  plural,
  releasedA,
  valueA,
  releasedB,
  valueB,
} of RELEASED_KINDS) {
  test.describe(`${plural} pages`, () => {
    test(`${listingPath} lists every distinct value with a count of logged viewings`, async ({
      page,
    }) => {
      mockCaldavServer(page, CREDENTIALS["caldav-url"], [
        {
          uid: "v1",
          title: "Movie One",
          start: ONE_MONTH_AGO.toISOString(),
          end: new Date(ONE_MONTH_AGO.getTime() + 60 * 60 * 1000).toISOString(),
          medium: "cinema",
          released: releasedA,
        },
        {
          uid: "v2",
          title: "Movie Two",
          start: TWO_MONTHS_AGO.toISOString(),
          end: new Date(TWO_MONTHS_AGO.getTime() + 60 * 60 * 1000).toISOString(),
          medium: "cinema",
          released: releasedA,
        },
        {
          uid: "v3",
          title: "Movie Three",
          start: TWO_MONTHS_AGO.toISOString(),
          end: new Date(TWO_MONTHS_AGO.getTime() + 60 * 60 * 1000).toISOString(),
          medium: "cinema",
          released: releasedB,
        },
      ]);
      await connect(page);
      await page.goto(listingPath);

      await expect(page.getByRole("heading", { name: plural })).toBeVisible();
      const rows = page.locator("tbody tr");
      await expect(rows).toHaveCount(2);
      // Sorted by count descending.
      await expect(rows.nth(0)).toContainText(valueA);
      await expect(rows.nth(0)).toContainText("2");
      await expect(rows.nth(1)).toContainText(valueB);
      await expect(rows.nth(1)).toContainText("1");
    });

    test(`clicking a value on ${listingPath} goes to its own dedicated, filter-free page, with the breadcrumb reading "Home / ${plural} / {value}"`, async ({
      page,
    }) => {
      mockCaldavServer(page, CREDENTIALS["caldav-url"], [
        {
          uid: "v1",
          title: "Movie One",
          start: ONE_MONTH_AGO.toISOString(),
          end: new Date(ONE_MONTH_AGO.getTime() + 60 * 60 * 1000).toISOString(),
          medium: "cinema",
          released: releasedA,
        },
        {
          uid: "v2",
          title: "Movie Two",
          start: TWO_MONTHS_AGO.toISOString(),
          end: new Date(TWO_MONTHS_AGO.getTime() + 60 * 60 * 1000).toISOString(),
          medium: "netflix",
        },
      ]);
      await connect(page);
      await page.goto(listingPath);

      await page.getByRole("link", { name: valueA }).click();

      await expect(page).toHaveURL(new RegExp(`${detailPath}/?\\?${paramName}=${valueA}`));
      await expect(page.getByRole("heading", { name: valueA, exact: true })).toBeVisible();
      const rows = page.locator("tbody tr");
      await expect(rows).toHaveCount(1);
      await expect(rows).toContainText("Movie One");

      // No filter chrome of any kind, and no way to change the value.
      await expect(page.getByText("Filters", { exact: true })).toHaveCount(0);
      await expect(page.locator("input[type=text]")).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Filter", exact: true })).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Clear filter" })).toHaveCount(0);

      const nav = page.getByRole("navigation", { name: "Breadcrumb" });
      await expect(nav).toBeVisible();
      await expect(nav).toContainText(`${plural} / ${valueA}`);
      await expect(nav.getByRole("link", { name: "Home" })).toHaveAttribute("href", "/");

      const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
      expect(results.violations).toEqual([]);
    });

    test(`${detailPath} shows an empty-results state for a value matching nothing, not an error`, async ({
      page,
    }) => {
      mockCaldavServer(page, CREDENTIALS["caldav-url"], [
        {
          uid: "v1",
          title: "Movie One",
          start: ONE_MONTH_AGO.toISOString(),
          end: new Date(ONE_MONTH_AGO.getTime() + 60 * 60 * 1000).toISOString(),
          medium: "cinema",
          released: releasedA,
        },
      ]);
      await connect(page);

      await page.goto(`${detailPath}?${paramName}=${encodeURIComponent("1999")}`);

      await expect(page.locator("tbody tr")).toHaveCount(0);
      await expect(page.getByText("0 logged viewings.")).toBeVisible();
      await expect(page.getByRole("alert")).toHaveCount(0);
    });

    test(`${detailPath} asks a visitor with no stored credentials to connect first`, async ({
      page,
    }) => {
      await page.goto(`${detailPath}?${paramName}=${encodeURIComponent(valueA)}`);

      await expect(page.getByText(/^Connect first to see this/)).toBeVisible();
    });
  });
}

// Deep coverage of the shared behaviour (pagination, split-value
// matching, error handling, accessibility) once against a representative
// kind, rather than five-fold repetition of logic that's identical
// across all five configs above — the per-kind loop already covers each
// config's own wiring (listing counts, link destination, breadcrumb
// label, empty state, connect gate).
test.describe("attribute detail page shared behaviour", () => {
  // #300: the same visitor-adjustable page size and windowed pagination
  // as the per-venue page (#448).
  test("paginates a value's own viewings", async ({ page }) => {
    const viewings = Array.from({ length: 30 }, (_, i) => {
      const start = new Date(ONE_MONTH_AGO.getTime() - i * 24 * 60 * 60 * 1000);
      return {
        uid: `viewing-${i}`,
        title: `Movie ${i}`,
        start: start.toISOString(),
        end: new Date(start.getTime() + 60 * 60 * 1000).toISOString(),
        medium: "cinema",
        director: "Denis Villeneuve",
      };
    });
    mockCaldavServer(page, CREDENTIALS["caldav-url"], viewings);
    await connect(page);

    await page.goto(`/director?director=${encodeURIComponent("Denis Villeneuve")}`);

    await expect(page.getByText("30 logged viewings.")).toBeVisible();
    await expect(page.locator("tbody tr")).toHaveCount(25);
    const pagination = page.getByLabel("Pagination");
    await expect(pagination).toBeVisible();
    await expect(pagination).toContainText("Page 1 of 2");

    await page.getByRole("button", { name: "Next page" }).click();
    await expect(page.locator("tbody tr")).toHaveCount(5);
    await expect(pagination).toContainText("Page 2 of 2");

    await page.selectOption("#attribute-page-size", "50");
    await expect(page.locator("tbody tr")).toHaveCount(30);
    await expect(page.getByLabel("Pagination")).toHaveCount(0);
  });

  // Mirrors movie-details.spec.ts's own genre substring guard — matching
  // against the split individual values, not a substring of the whole
  // comma-joined field, so "United Kingdom, France" never wrongly
  // matches a page for plain "United".
  test("matches a value split out of a multi-value field, not a substring of the whole field", async ({
    page,
  }) => {
    mockCaldavServer(page, CREDENTIALS["caldav-url"], [
      {
        uid: "dune-uid",
        title: "Dune",
        start: ONE_MONTH_AGO.toISOString(),
        end: new Date(ONE_MONTH_AGO.getTime() + 60 * 60 * 1000).toISOString(),
        medium: "cinema",
        movieCountry: "United Kingdom, France",
      },
      {
        uid: "other-uid",
        title: "Something Else",
        start: TWO_MONTHS_AGO.toISOString(),
        end: new Date(TWO_MONTHS_AGO.getTime() + 60 * 60 * 1000).toISOString(),
        medium: "cinema",
        // Deliberately NOT "United Kingdom" — a naive substring match
        // against the whole field would wrongly match this too.
        movieCountry: "United Arab Emirates",
      },
    ]);
    await connect(page);

    await page.goto(`/movie-country?movieCountry=${encodeURIComponent("United Kingdom")}`);

    await expect(page.locator("tbody tr")).toHaveCount(1);
    await expect(page.locator("tbody tr")).toContainText("Dune");
  });

  test("a load failure shows a distinct error toast", async ({ page }) => {
    mockCaldavServer(page, CREDENTIALS["caldav-url"], []);
    await connect(page);

    await page.route(`${new URL(CREDENTIALS["caldav-url"]).origin}/**`, async (route) => {
      if (route.request().method() === "REPORT") {
        await route.fulfill({ status: 500, body: "Internal Server Error" });
        return;
      }
      await route.fallback();
    });

    await page.goto(`/actor?actor=${encodeURIComponent("Zendaya")}`);

    const toast = page.getByRole("alert");
    await expect(toast).toBeVisible();
    await expect(toast).toContainText(/the CalDAV server responded 500/);
  });

  test("the listing page shows a distinct error toast on a genuine load failure", async ({
    page,
  }) => {
    mockCaldavServer(page, CREDENTIALS["caldav-url"], []);
    await connect(page);

    await page.route(`${new URL(CREDENTIALS["caldav-url"]).origin}/**`, async (route) => {
      if (route.request().method() === "REPORT") {
        await route.fulfill({ status: 500, body: "Internal Server Error" });
        return;
      }
      await route.fallback();
    });

    await page.goto("/genres");
    await expect(page.getByRole("heading", { name: "Genres" })).toBeVisible();

    const toast = page.getByRole("alert");
    await expect(toast).toBeVisible();
    await expect(toast).toContainText(/the CalDAV server responded 500/);
  });

  test("introduces no accessibility violations on either the listing or a per-value page", async ({
    page,
  }) => {
    mockCaldavServer(page, CREDENTIALS["caldav-url"], [
      {
        uid: "dune-uid",
        title: "Dune",
        start: ONE_MONTH_AGO.toISOString(),
        end: new Date(ONE_MONTH_AGO.getTime() + 60 * 60 * 1000).toISOString(),
        medium: "cinema",
        director: "Denis Villeneuve",
      },
    ]);
    await connect(page);

    await page.goto("/directors");
    await expect(page.getByRole("heading", { name: "Directors" })).toBeVisible();
    let results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
    expect(results.violations).toEqual([]);

    await page.goto(`/director?director=${encodeURIComponent("Denis Villeneuve")}`);
    await expect(page.getByRole("heading", { name: "Denis Villeneuve" })).toBeVisible();
    results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
    expect(results.violations).toEqual([]);
  });
});
