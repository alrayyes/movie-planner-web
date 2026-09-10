import { describe, expect, test } from "bun:test";
import type { VenueEntry } from "../caldav/types";
import { findVenueEntry } from "./lookup";

describe("findVenueEntry", () => {
  test("returns the picklist entry with a matching name", () => {
    const venues: VenueEntry[] = [
      { name: "Tuschinski", geo: { lat: 52.3665062, lon: 4.8947073 } },
      { name: "Grand Vista Cinema" },
    ];

    expect(findVenueEntry("Tuschinski", venues)).toEqual({
      name: "Tuschinski",
      geo: { lat: 52.3665062, lon: 4.8947073 },
    });
  });

  test("returns undefined when no entry matches", () => {
    expect(findVenueEntry("Nowhere", [{ name: "Tuschinski" }])).toBeUndefined();
  });

  test("returns undefined for an empty picklist", () => {
    expect(findVenueEntry("Tuschinski", [])).toBeUndefined();
  });
});
