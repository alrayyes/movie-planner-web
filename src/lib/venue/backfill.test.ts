import { describe, expect, test } from "bun:test";
import type { LoggedViewing, VenueEntry } from "../caldav/types";
import { venuesMissingFromPicklist } from "./backfill";

function viewing(venue: string | undefined): LoggedViewing {
  return {
    uid: `uid-${Math.random()}`,
    title: "A Movie",
    start: "2026-01-01T00:00:00.000Z",
    end: "2026-01-01T02:00:00.000Z",
    medium: "cinema",
    venue,
  };
}

// #636: the explicit, visitor-triggered "Add venue" bulk-add source —
// never run implicitly on a normal dialog open (see #339's "no automatic
// reconciliation" decision, which this doesn't reopen).
describe("venuesMissingFromPicklist", () => {
  test("returns venue names from viewings that aren't already in the picklist, with counts", () => {
    const viewings = [viewing("De Munt"), viewing("De Munt"), viewing("Tuschinski")];
    const picklist: VenueEntry[] = [];

    const result = venuesMissingFromPicklist(viewings, picklist);

    expect(result).toEqual([
      { name: "De Munt", count: 2 },
      { name: "Tuschinski", count: 1 },
    ]);
  });

  test("excludes a venue name already in the picklist", () => {
    const viewings = [viewing("De Munt"), viewing("Tuschinski")];
    const picklist: VenueEntry[] = [{ name: "De Munt" }];

    const result = venuesMissingFromPicklist(viewings, picklist);

    expect(result).toEqual([{ name: "Tuschinski", count: 1 }]);
  });

  test("skips a viewing with no venue at all", () => {
    const viewings = [viewing(undefined), viewing("Tuschinski")];

    const result = venuesMissingFromPicklist(viewings, []);

    expect(result).toEqual([{ name: "Tuschinski", count: 1 }]);
  });

  test("sorts by count descending, then name ascending on a tie", () => {
    const viewings = [
      viewing("B Venue"),
      viewing("A Venue"),
      viewing("C Venue"),
      viewing("C Venue"),
    ];

    const result = venuesMissingFromPicklist(viewings, []);

    expect(result).toEqual([
      { name: "C Venue", count: 2 },
      { name: "A Venue", count: 1 },
      { name: "B Venue", count: 1 },
    ]);
  });

  test("returns an empty array when everything is already in the picklist", () => {
    const viewings = [viewing("De Munt")];
    const picklist: VenueEntry[] = [{ name: "De Munt" }];

    expect(venuesMissingFromPicklist(viewings, picklist)).toEqual([]);
  });
});
