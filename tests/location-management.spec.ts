import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, type Route, test } from "@playwright/test";
import type { LoggedViewing } from "../src/lib/caldav/types";
import { mockCaldavServer, type PicklistsInput } from "./support/mock-caldav";

const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

const CREDENTIALS = {
  "caldav-url": "https://caldav.example.com/calendars/me/movies/",
  "caldav-username": "me",
  "caldav-password": "secret",
};

async function connect(
  page: Page,
  initialPicklists?: PicklistsInput,
  initialViewings: LoggedViewing[] = [],
) {
  const server = mockCaldavServer(
    page,
    CREDENTIALS["caldav-url"],
    initialViewings,
    initialPicklists,
  );
  await page.goto("/");
  await page.locator("#caldav-url").fill(CREDENTIALS["caldav-url"]);
  await page.locator("#caldav-username").fill(CREDENTIALS["caldav-username"]);
  await page.locator("#caldav-password").fill(CREDENTIALS["caldav-password"]);
  await page.getByRole("button", { name: "Connect" }).click();
  await expect(page.getByRole("button", { name: "Log a viewing" })).toBeVisible();
  return server;
}

// #452: Picklists.venues grew from `string[]` to structured
// {name, streetAddress?, postalCode?, city?, country?, geo?} entries — a
// native <select> on the log form and the edit form (never free text),
// plus a shared "Add venue" form (VenuePicker.svelte) reachable from
// both. See movie-planner-web#452.
test.describe("structured venue picklist", () => {
  test("offers a previously-added venue as a select choice on the log form", async ({ page }) => {
    await connect(page, { media: ["cinema"], venues: [{ name: "Grand Vista Cinema" }] });
    await page.goto("/log");

    const venueSelect = page.locator("#log-venue");
    await expect(venueSelect).toHaveRole("combobox");
    await expect(venueSelect.locator("option")).toContainText(["Grand Vista Cinema"]);

    const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
    expect(results.violations).toEqual([]);
  });

  // #498: the log form's venue select trims a comma-laden raw picklist
  // entry name to just what precedes the comma for display, while the
  // option's value (what actually gets logged if selected) stays the
  // raw, untrimmed name — same rule pre-dating structured entries,
  // still applied via venueDisplay's own trim.
  test("trims a venue with a full address baked into its name, in the log form's own select", async ({
    page,
  }) => {
    await connect(page, {
      media: [],
      venues: [{ name: "De Munt, Vijzelstraat 15, 1017 HD Amsterdam, Netherlands" }],
    });
    await page.goto("/log");

    const option = page.locator("#log-venue option").last();
    await expect(option).toHaveAttribute(
      "value",
      "De Munt, Vijzelstraat 15, 1017 HD Amsterdam, Netherlands",
    );
    await expect(option).toHaveText("De Munt");
  });

  test("selecting a known venue logs the viewing with its stored city/country/geo/address attached", async ({
    page,
  }) => {
    const server = await connect(page, {
      media: ["cinema"],
      venues: [
        {
          name: "Grand Vista Cinema",
          streetAddress: "123 Main St",
          postalCode: "12345",
          city: "Anytown",
          country: "USA",
          geo: { lat: 52.3665062, lon: 4.8947073 },
        },
      ],
    });
    await page.goto("/log");

    await page.locator("#log-title").fill("Dune");
    await page.locator("#log-date").fill("2026-01-01");
    await page.locator("#log-medium").selectOption("Cinema");
    await page.locator("#log-venue").selectOption("Grand Vista Cinema");

    // Selecting a venue with known coordinates attaches them
    // automatically — no address-search field for it on this form; that
    // lookup only exists inside the "Add venue" dialog.
    await expect(page.getByText("Using Grand Vista Cinema's known location.")).toBeVisible();
    await expect(page.locator("#log-add-venue-geo-search")).toBeHidden();

    await page.getByRole("button", { name: "Log viewing" }).click();

    await expect(page.getByRole("status")).toHaveText("Logged.");
    expect(server.creates[0]?.venue).toBe("Grand Vista Cinema");
    expect(server.creates[0]?.city).toBe("Anytown");
    expect(server.creates[0]?.country).toBe("USA");
    expect(server.creates[0]?.streetAddress).toBe("123 Main St");
    expect(server.creates[0]?.postalCode).toBe("12345");
    expect(server.creates[0]?.geo).toEqual({ lat: 52.3665062, lon: 4.8947073 });
  });

  test("adding a new venue via the Add venue form makes it selectable and attaches its data when logging", async ({
    page,
  }) => {
    const server = await connect(page, { media: [], venues: [] });
    await page.goto("/log");

    await page.route("https://nominatim.openstreetmap.org/**", async (route: Route) => {
      const url = new URL(route.request().url());
      expect(url.searchParams.get("q")).toBe("Grand Vista Cinema");
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([
          {
            display_name: "Grand Vista Cinema, Anytown, USA",
            lat: "52.3665062",
            lon: "4.8947073",
          },
        ]),
      });
    });

    await page.getByRole("button", { name: "Add venue" }).click();
    await page.locator("#log-add-venue-name").fill("Grand Vista Cinema");
    await page.locator("#log-add-venue-street").fill("123 Main St");
    await page.locator("#log-add-venue-postal").fill("12345");
    await page.locator("#log-add-venue-city").fill("Anytown");
    await page.locator("#log-add-venue-country").fill("USA");
    await page.locator("#log-add-venue-geo-search").fill("Grand Vista Cinema");
    const candidate = page.getByRole("button", { name: "Grand Vista Cinema, Anytown, USA" });
    await expect(candidate).toBeVisible();

    const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
    expect(results.violations).toEqual([]);

    await candidate.click();
    await expect(page.getByText("Location set: Grand Vista Cinema, Anytown, USA")).toBeVisible();
    await page.getByRole("button", { name: "Add", exact: true }).click();

    // Immediately selectable — no reload, no separate confirmation step.
    await expect(page.locator("#log-venue")).toHaveValue("Grand Vista Cinema");
    await expect(page.locator("#log-venue option")).toContainText(["Grand Vista Cinema"]);
    await expect
      .poll(() => server.picklists.venues)
      .toEqual([
        {
          name: "Grand Vista Cinema",
          streetAddress: "123 Main St",
          postalCode: "12345",
          city: "Anytown",
          country: "USA",
          geo: { lat: 52.3665062, lon: 4.8947073 },
        },
      ]);

    await page.locator("#log-title").fill("Dune");
    await page.locator("#log-date").fill("2026-01-01");
    await page.locator("#log-medium").selectOption("Cinema");
    await page.getByRole("button", { name: "Log viewing" }).click();

    await expect(page.getByRole("status")).toHaveText("Logged.");
    expect(server.creates[0]?.venue).toBe("Grand Vista Cinema");
    expect(server.creates[0]?.city).toBe("Anytown");
    expect(server.creates[0]?.geo).toEqual({ lat: 52.3665062, lon: 4.8947073 });
  });

  test("adding a new venue with just a name works — every other field, including the address search, is optional", async ({
    page,
  }) => {
    const server = await connect(page, { media: [], venues: [] });
    await page.goto("/log");

    await page.getByRole("button", { name: "Add venue" }).click();
    await page.locator("#log-add-venue-name").fill("Home");
    await page.getByRole("button", { name: "Add", exact: true }).click();

    await expect(page.locator("#log-venue")).toHaveValue("Home");
    await expect.poll(() => server.picklists.venues).toEqual([{ name: "Home" }]);
  });

  // #636: an account whose viewing history predates the structured
  // picklist (or was only ever logged via the CLI, which knows nothing
  // of this app's own picklist sidecar) can have real venues on every
  // viewing but nothing in the picklist at all — bulk-add offers those
  // names, with their viewing counts, as an explicit, visitor-triggered
  // checklist rather than silently backfilling anything.
  test("Add venue offers names already seen in viewing history, not yet in the picklist, as a bulk-add checklist", async ({
    page,
  }) => {
    const viewings: LoggedViewing[] = [
      {
        uid: "v1",
        title: "Movie A",
        start: "2026-01-01T18:00:00.000Z",
        end: "2026-01-01T20:00:00.000Z",
        medium: "cinema",
        venue: "De Munt",
      },
      {
        uid: "v2",
        title: "Movie B",
        start: "2026-01-02T18:00:00.000Z",
        end: "2026-01-02T20:00:00.000Z",
        medium: "cinema",
        venue: "De Munt",
      },
      {
        uid: "v3",
        title: "Movie C",
        start: "2026-01-03T18:00:00.000Z",
        end: "2026-01-03T20:00:00.000Z",
        medium: "cinema",
        venue: "Tuschinski",
      },
    ];
    const server = await connect(page, { media: [], venues: [] }, viewings);
    await page.goto("/log");

    await page.getByRole("button", { name: "Add venue" }).click();
    const dialog = page.getByRole("dialog", { name: "Add a new venue" });

    await expect(dialog.getByRole("checkbox", { name: "De Munt (2)" })).toBeVisible();
    await expect(dialog.getByRole("checkbox", { name: "Tuschinski (1)" })).toBeVisible();

    await dialog.getByRole("checkbox", { name: "De Munt (2)" }).check();
    await dialog.getByRole("button", { name: "Add selected" }).click();

    await expect.poll(() => server.picklists.venues).toEqual([{ name: "De Munt" }]);
    await expect(page.locator("#log-venue option")).toContainText(["No venue", "De Munt"]);
  });

  test("a venue already in the picklist isn't offered again in the bulk-add checklist", async ({
    page,
  }) => {
    const viewings: LoggedViewing[] = [
      {
        uid: "v1",
        title: "Movie A",
        start: "2026-01-01T18:00:00.000Z",
        end: "2026-01-01T20:00:00.000Z",
        medium: "cinema",
        venue: "De Munt",
      },
    ];
    const server = await connect(page, { media: [], venues: [{ name: "De Munt" }] }, viewings);
    await page.goto("/log");

    await page.getByRole("button", { name: "Add venue" }).click();
    const dialog = page.getByRole("dialog", { name: "Add a new venue" });

    // The checklist only renders after loadMissingVenues's own
    // listViewings() call resolves — wait for that request to actually
    // land before asserting the checklist stays absent, so this isn't
    // just passing because the fetch hadn't finished yet.
    await expect.poll(() => server.listRequests.length).toBeGreaterThan(0);
    await expect(dialog.getByText("Already in your history, not yet added")).toHaveCount(0);
  });

  // #452: an existing sidecar written before this change held plain
  // venue name strings — parsePicklistsFromVJournal keeps reading those
  // (as `{name: value}`) rather than dropping or breaking on them.
  test("a venue from an old plain-string sidecar entry is still selectable and logs successfully", async ({
    page,
  }) => {
    const server = await connect(page, {
      media: ["cinema"],
      venues: ["Grand Vista Cinema"],
    });
    await page.goto("/log");

    const venueSelect = page.locator("#log-venue");
    await expect(venueSelect.locator("option")).toContainText(["Grand Vista Cinema"]);
    await venueSelect.selectOption("Grand Vista Cinema");

    await page.locator("#log-title").fill("Dune");
    await page.locator("#log-date").fill("2026-01-01");
    await page.locator("#log-medium").selectOption("Cinema");
    await page.getByRole("button", { name: "Log viewing" }).click();

    await expect(page.getByRole("status")).toHaveText("Logged.");
    expect(server.creates[0]?.venue).toBe("Grand Vista Cinema");
    // The legacy entry never had structured data beyond its name.
    expect(server.creates[0]?.city).toBeUndefined();
    expect(server.creates[0]?.geo).toBeUndefined();
  });

  // #98
  test("offers a previously-added venue as a select choice when editing on the details page", async ({
    page,
  }) => {
    const oneMonthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const dune: LoggedViewing = {
      uid: "dune-uid",
      title: "Dune",
      start: oneMonthAgo.toISOString(),
      end: new Date(oneMonthAgo.getTime() + 2.5 * 60 * 60 * 1000).toISOString(),
      medium: "cinema",
      venue: "Grand Vista Cinema",
    };
    await connect(
      page,
      {
        media: ["cinema"],
        venues: [{ name: "Grand Vista Cinema" }, { name: "Regal Union Square" }],
      },
      [dune],
    );
    await page.getByRole("link", { name: "Dune", exact: true }).click();
    await page.getByRole("button", { name: "Edit" }).click();

    const venueSelect = page.locator("#details-venue");
    await expect(venueSelect).toHaveRole("combobox");
    await expect(venueSelect.locator("option")).toContainText([
      "Grand Vista Cinema",
      "Regal Union Square",
    ]);

    const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
    expect(results.violations).toEqual([]);
  });

  // #498: same trim as the log form's own select, applied to the
  // details page's edit-form venue select.
  test("trims a venue with a full address baked into its name, in the details page's own edit select", async ({
    page,
  }) => {
    const oneMonthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const dune: LoggedViewing = {
      uid: "dune-uid",
      title: "Dune",
      start: oneMonthAgo.toISOString(),
      end: new Date(oneMonthAgo.getTime() + 2.5 * 60 * 60 * 1000).toISOString(),
      medium: "cinema",
      venue: "De Munt, Vijzelstraat 15, 1017 HD Amsterdam, Netherlands",
    };
    await connect(
      page,
      {
        media: ["cinema"],
        venues: [{ name: "De Munt, Vijzelstraat 15, 1017 HD Amsterdam, Netherlands" }],
      },
      [dune],
    );
    await page.getByRole("link", { name: "Dune", exact: true }).click();
    await page.getByRole("button", { name: "Edit" }).click();

    const option = page.locator("#details-venue option").last();
    await expect(option).toHaveAttribute(
      "value",
      "De Munt, Vijzelstraat 15, 1017 HD Amsterdam, Netherlands",
    );
    await expect(option).toHaveText("De Munt");
  });

  test("selecting a different venue while editing re-attaches that venue's own stored data", async ({
    page,
  }) => {
    const oneMonthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const dune: LoggedViewing = {
      uid: "dune-uid",
      title: "Dune",
      start: oneMonthAgo.toISOString(),
      end: new Date(oneMonthAgo.getTime() + 2.5 * 60 * 60 * 1000).toISOString(),
      medium: "cinema",
      venue: "Grand Vista Cinema",
      city: "Anytown",
      country: "USA",
      geo: { lat: 52.3665062, lon: 4.8947073 },
    };
    const server = await connect(
      page,
      {
        media: ["cinema"],
        venues: [
          {
            name: "Grand Vista Cinema",
            city: "Anytown",
            country: "USA",
            geo: { lat: 52.3665062, lon: 4.8947073 },
          },
          { name: "Regal Union Square", city: "Metropolis", country: "USA" },
        ],
      },
      [dune],
    );
    await page.getByRole("link", { name: "Dune", exact: true }).click();
    await page.getByRole("button", { name: "Edit" }).click();

    await page.locator("#details-venue").selectOption("Regal Union Square");
    await page.getByRole("button", { name: "Save" }).click();

    await expect(page.getByRole("status")).toHaveText("Saved.");
    const updated = server.viewings.get("dune-uid");
    expect(updated?.venue).toBe("Regal Union Square");
    expect(updated?.city).toBe("Metropolis");
    expect(updated?.geo).toBeUndefined();
  });

  test("adding a new venue from the details page's edit form makes it selectable", async ({
    page,
  }) => {
    const oneMonthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const dune: LoggedViewing = {
      uid: "dune-uid",
      title: "Dune",
      start: oneMonthAgo.toISOString(),
      end: new Date(oneMonthAgo.getTime() + 2.5 * 60 * 60 * 1000).toISOString(),
      medium: "cinema",
    };
    const server = await connect(page, { media: [], venues: [] }, [dune]);
    await page.getByRole("link", { name: "Dune", exact: true }).click();
    await page.getByRole("button", { name: "Edit" }).click();

    await page.getByRole("button", { name: "Add venue" }).click();
    await page.locator("#details-add-venue-name").fill("Regal Union Square");
    await page.locator("#details-add-venue-city").fill("Metropolis");
    await page.getByRole("button", { name: "Add", exact: true }).click();

    await expect(page.locator("#details-venue")).toHaveValue("Regal Union Square");
    await page.getByRole("button", { name: "Save" }).click();

    await expect(page.getByRole("status")).toHaveText("Saved.");
    expect(server.viewings.get("dune-uid")?.venue).toBe("Regal Union Square");
    expect(server.viewings.get("dune-uid")?.city).toBe("Metropolis");
    await expect
      .poll(() => server.picklists.venues)
      .toEqual([{ name: "Regal Union Square", city: "Metropolis" }]);
  });

  // #601: same native <dialog> pattern as MediumPicker's own "Add
  // medium" (#600) and the Search OMDb dialog (#596/#597) — replaces
  // what used to be an inline-expanding panel.
  test("Add venue opens as a real dialog, closable by Cancel or Escape with no change saved", async ({
    page,
  }) => {
    const server = await connect(page, { media: [], venues: [] });
    await page.goto("/log");

    const dialog = page.getByRole("dialog", { name: "Add a new venue" });
    await expect(dialog).toBeHidden();
    await page.getByRole("button", { name: "Add venue" }).click();
    await expect(dialog).toBeVisible();

    await page.locator("#log-add-venue-name").fill("Grand Vista Cinema");
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog).toBeHidden();
    await expect(page.locator("#log-venue")).toHaveValue("");
    expect(server.picklists.venues).toEqual([]);

    // Reopening starts fresh, same as the Search OMDb dialog's own reset.
    await page.getByRole("button", { name: "Add venue" }).click();
    await expect(page.locator("#log-add-venue-name")).toHaveValue("");

    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
  });
});

// #600: Picklists.media stays a flat string[] (unlike venue, a medium
// has no address/geo worth structuring), but is offered as a native
// <select> the same way — never free text — with its own "Add medium"
// dialog (MediumPicker.svelte). "Cinema" is always offered even with an
// empty picklist: the CLI never writes a medium property to CalDAV at
// all, so there's no such thing as a viewing with no medium in
// practice (mediumDisplay's own rule), and a fresh account still needs
// a first sensible option to log anything with.
test.describe("structured medium picklist", () => {
  test("Cinema is always offered, even with an empty picklist", async ({ page }) => {
    await connect(page, { media: [], venues: [] });
    await page.goto("/log");

    const mediumSelect = page.locator("#log-medium");
    await expect(mediumSelect).toHaveRole("combobox");
    await expect(mediumSelect).toHaveValue("Cinema");
    await expect(mediumSelect.locator("option")).toContainText(["Cinema"]);
  });

  test("offers a previously-added medium as a select choice on the log form", async ({ page }) => {
    await connect(page, { media: ["Netflix"], venues: [] });
    await page.goto("/log");

    const mediumSelect = page.locator("#log-medium");
    await expect(mediumSelect.locator("option")).toContainText(["Cinema", "Netflix"]);

    const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
    expect(results.violations).toEqual([]);
  });

  test("adding a new medium via the Add medium dialog makes it selectable and attaches it when logging", async ({
    page,
  }) => {
    const server = await connect(page, { media: [], venues: [] });
    await page.goto("/log");

    const dialog = page.getByRole("dialog", { name: "Add a new medium" });
    await expect(dialog).toBeHidden();
    await page.getByRole("button", { name: "Add medium" }).click();
    await expect(dialog).toBeVisible();

    await page.locator("#log-add-medium-name").fill("Blu-ray");

    const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
    expect(results.violations).toEqual([]);

    await page.getByRole("button", { name: "Add", exact: true }).click();
    await expect(dialog).toBeHidden();

    // Immediately selectable — no reload, no separate confirmation step.
    await expect(page.locator("#log-medium")).toHaveValue("Blu-ray");
    await expect(page.locator("#log-medium option")).toContainText(["Cinema", "Blu-ray"]);
    await expect.poll(() => server.picklists.media).toEqual(["Blu-ray"]);

    await page.locator("#log-title").fill("Dune");
    await page.locator("#log-date").fill("2026-01-01");
    await page.getByRole("button", { name: "Log viewing" }).click();

    await expect(page.getByRole("status")).toHaveText("Logged.");
    expect(server.creates[0]?.medium).toBe("Blu-ray");
  });

  test("canceling the Add medium dialog makes no change and leaves the selection untouched", async ({
    page,
  }) => {
    const server = await connect(page, { media: [], venues: [] });
    await page.goto("/log");

    const dialog = page.getByRole("dialog", { name: "Add a new medium" });
    await page.getByRole("button", { name: "Add medium" }).click();
    await page.locator("#log-add-medium-name").fill("Blu-ray");
    await dialog.getByRole("button", { name: "Cancel" }).click();

    await expect(dialog).toBeHidden();
    await expect(page.locator("#log-medium")).toHaveValue("Cinema");
    expect(server.picklists.media).toEqual([]);
  });

  test("offers a previously-added medium as a select choice when editing on the details page", async ({
    page,
  }) => {
    const oneMonthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const dune: LoggedViewing = {
      uid: "dune-uid",
      title: "Dune",
      start: oneMonthAgo.toISOString(),
      end: new Date(oneMonthAgo.getTime() + 2.5 * 60 * 60 * 1000).toISOString(),
      medium: "Netflix",
    };
    await connect(page, { media: ["Netflix"], venues: [] }, [dune]);
    await page.getByRole("link", { name: "Dune", exact: true }).click();
    await page.getByRole("button", { name: "Edit" }).click();

    const mediumSelect = page.locator("#details-medium");
    await expect(mediumSelect).toHaveValue("Netflix");
    await expect(mediumSelect.locator("option")).toContainText(["Cinema", "Netflix"]);
  });

  // #600: mediumDisplay's own blank-means-Cinema rule, applied to the
  // edit form's initial value too — a CLI-logged viewing's own medium
  // is genuinely blank (the CLI never writes that property at all), so
  // editing one shouldn't start from an empty selection matching no
  // real <option>.
  test("editing a viewing with no stored medium starts from Cinema, not an empty selection", async ({
    page,
  }) => {
    const oneMonthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const dune: LoggedViewing = {
      uid: "dune-uid",
      title: "Dune",
      start: oneMonthAgo.toISOString(),
      end: new Date(oneMonthAgo.getTime() + 2.5 * 60 * 60 * 1000).toISOString(),
      medium: "",
    };
    const server = await connect(page, { media: [], venues: [] }, [dune]);
    await page.getByRole("link", { name: "Dune", exact: true }).click();
    const mediumValue = page
      .locator("dt", { hasText: "Medium" })
      .locator("xpath=following-sibling::dd[1]");
    await expect(mediumValue).toHaveText("Cinema");

    await page.getByRole("button", { name: "Edit" }).click();
    await expect(page.locator("#details-medium")).toHaveValue("Cinema");
    await page.getByRole("button", { name: "Save" }).click();

    await expect(page.getByRole("status")).toHaveText("Saved.");
    expect(server.viewings.get("dune-uid")?.medium).toBe("Cinema");
  });
});

// #519: #452 shipped an "Add venue" form but no way back into an
// already-known entry to fill in what's missing or fix what's wrong —
// deleting and re-adding under the same name was the only workaround.
// "Edit venue" reuses the same fields (plus the Nominatim lookup) on
// whichever entry is currently selected, without touching its name.
test.describe("editing an existing venue's structured data", () => {
  test("editing a venue's fields updates the picklist entry, pre-filled with what's already set", async ({
    page,
  }) => {
    const server = await connect(page, {
      media: ["cinema"],
      venues: [{ name: "Grand Vista Cinema", city: "Anytown" }],
    });
    await page.goto("/log");
    await page.locator("#log-venue").selectOption("Grand Vista Cinema");

    await page.route("https://nominatim.openstreetmap.org/**", async (route: Route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([
          {
            display_name: "Grand Vista Cinema, Anytown, USA",
            lat: "52.3665062",
            lon: "4.8947073",
          },
        ]),
      });
    });

    await page.getByRole("button", { name: "Edit venue" }).click();
    // Already-set fields are pre-filled, not blanked.
    await expect(page.locator("#log-edit-venue-name")).toHaveValue("Grand Vista Cinema");
    await expect(page.locator("#log-edit-venue-city")).toHaveValue("Anytown");
    await expect(page.locator("#log-edit-venue-street")).toHaveValue("");

    await page.locator("#log-edit-venue-street").fill("123 Main St");
    await page.locator("#log-edit-venue-postal").fill("12345");
    await page.locator("#log-edit-venue-country").fill("USA");
    await page.locator("#log-edit-venue-geo-search").fill("Grand Vista Cinema");
    await page.getByRole("button", { name: "Grand Vista Cinema, Anytown, USA" }).click();

    const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
    expect(results.violations).toEqual([]);

    await page.getByRole("button", { name: "Save venue" }).click();

    await expect
      .poll(() => server.picklists.venues)
      .toEqual([
        {
          name: "Grand Vista Cinema",
          streetAddress: "123 Main St",
          postalCode: "12345",
          city: "Anytown",
          country: "USA",
          geo: { lat: 52.3665062, lon: 4.8947073 },
        },
      ]);
  });

  test("editing a venue's data doesn't retroactively change what's already logged at it", async ({
    page,
  }) => {
    const oneMonthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const dune: LoggedViewing = {
      uid: "dune-uid",
      title: "Dune",
      start: oneMonthAgo.toISOString(),
      end: new Date(oneMonthAgo.getTime() + 2.5 * 60 * 60 * 1000).toISOString(),
      medium: "cinema",
      venue: "Grand Vista Cinema",
      city: "Anytown",
      country: "USA",
    };
    const server = await connect(
      page,
      {
        media: ["cinema"],
        venues: [{ name: "Grand Vista Cinema", city: "Anytown", country: "USA" }],
      },
      [dune],
    );
    await page.goto("/log");
    await page.locator("#log-venue").selectOption("Grand Vista Cinema");

    await page.getByRole("button", { name: "Edit venue" }).click();
    await page.locator("#log-edit-venue-city").fill("Newtown");
    await page.getByRole("button", { name: "Save venue" }).click();

    await expect
      .poll(() => server.picklists.venues)
      .toEqual([{ name: "Grand Vista Cinema", city: "Newtown", country: "USA" }]);

    // The viewing logged before the edit keeps its own stored city as of
    // when it was logged — only the picklist entry itself changed.
    expect(server.viewings.get("dune-uid")?.city).toBe("Anytown");
  });

  // #601: "Edit venue" opens the same dialog as "Add venue" (a shared
  // element, its title/fields swapping on editingVenue), not a second
  // one of its own.
  test("Edit venue opens the same dialog, closable by Cancel with no change saved", async ({
    page,
  }) => {
    const server = await connect(page, {
      media: [],
      venues: [{ name: "Grand Vista Cinema", city: "Anytown" }],
    });
    await page.goto("/log");
    await page.locator("#log-venue").selectOption("Grand Vista Cinema");

    const dialog = page.getByRole("dialog", { name: "Edit this venue" });
    await expect(dialog).toBeHidden();
    await page.getByRole("button", { name: "Edit venue" }).click();
    await expect(dialog).toBeVisible();

    await page.locator("#log-edit-venue-city").fill("Newtown");
    await dialog.getByRole("button", { name: "Cancel" }).click();

    await expect(dialog).toBeHidden();
    expect(server.picklists.venues).toEqual([{ name: "Grand Vista Cinema", city: "Anytown" }]);
  });
});
