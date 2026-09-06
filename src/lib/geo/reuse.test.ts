import { describe, expect, test } from "bun:test";
import type { LoggedViewing } from "../caldav/types";
import { findKnownGeo } from "./reuse";

function viewing(overrides: Partial<LoggedViewing>): LoggedViewing {
  return {
    uid: "uid",
    title: "Dune",
    start: "2026-01-01T19:00:00.000Z",
    end: "2026-01-01T21:30:00.000Z",
    medium: "cinema",
    ...overrides,
  };
}

describe("findKnownGeo", () => {
  test("returns the geo from a viewing at the same venue", () => {
    const viewings = [
      viewing({ uid: "1", venue: "Tuschinski", geo: { lat: 52.3665062, lon: 4.8947073 } }),
    ];

    expect(findKnownGeo("Tuschinski", viewings)).toEqual({ lat: 52.3665062, lon: 4.8947073 });
  });

  test("returns undefined when no viewing at that venue has a geo", () => {
    const viewings = [
      viewing({ uid: "1", venue: "Tuschinski" }),
      viewing({ uid: "2", venue: "Some Other Venue", geo: { lat: 1, lon: 1 } }),
    ];

    expect(findKnownGeo("Tuschinski", viewings)).toBeUndefined();
  });

  test("returns undefined for a venue with no matching viewings at all", () => {
    expect(findKnownGeo("Nowhere", [])).toBeUndefined();
  });

  // #8/#203: documented as first-found-wins, not merged or averaged —
  // this pins that choice rather than leaving it implicit.
  test("first match wins when several viewings at the same venue carry different geo", () => {
    const viewings = [
      viewing({ uid: "1", venue: "Tuschinski", geo: { lat: 1, lon: 1 } }),
      viewing({ uid: "2", venue: "Tuschinski", geo: { lat: 2, lon: 2 } }),
    ];

    expect(findKnownGeo("Tuschinski", viewings)).toEqual({ lat: 1, lon: 1 });
  });
});
