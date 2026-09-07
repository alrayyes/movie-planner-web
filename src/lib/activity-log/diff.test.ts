import { describe, expect, test } from "bun:test";
import type { LoggedViewing, NewViewing } from "../caldav/types";
import { diffViewings } from "./diff";

const BEFORE: LoggedViewing = {
  uid: "dune-uid",
  title: "Dune",
  start: "2026-01-01T19:00:00.000Z",
  end: "2026-01-01T21:30:00.000Z",
  medium: "cinema",
  director: "Some Stale Director",
};

describe("diffViewings", () => {
  test("returns nothing when before is null (no prior state to compare against)", () => {
    expect(diffViewings(null, BEFORE as NewViewing)).toEqual([]);
  });

  test("returns nothing when nothing actually changed", () => {
    const { uid: _uid, ...after } = BEFORE;
    expect(diffViewings(BEFORE, after)).toEqual([]);
  });

  test("reports only the fields that changed, with before/after values", () => {
    const after: NewViewing = { ...BEFORE, director: "Denis Villeneuve", genre: "Sci-Fi" };
    const changes = diffViewings(BEFORE, after);

    expect(changes).toContainEqual({
      field: "director",
      before: "Some Stale Director",
      after: "Denis Villeneuve",
    });
    expect(changes).toContainEqual({ field: "genre", before: undefined, after: "Sci-Fi" });
    // Untouched fields don't show up at all.
    expect(changes.some((c) => c.field === "title")).toBe(false);
  });

  test("never reports uid as a changed field", () => {
    const after: NewViewing = { ...BEFORE };
    const changes = diffViewings({ ...BEFORE, uid: "other-uid" }, after);
    expect(changes.some((c) => c.field === "uid")).toBe(false);
  });

  test("formats an object field (geo) as a comparable string", () => {
    const before: LoggedViewing = { ...BEFORE, geo: { lat: 1, lon: 2 } };
    const after: NewViewing = { ...BEFORE, geo: { lat: 3, lon: 4 } };
    const changes = diffViewings(before, after);
    expect(changes).toContainEqual({
      field: "geo",
      before: JSON.stringify({ lat: 1, lon: 2 }),
      after: JSON.stringify({ lat: 3, lon: 4 }),
    });
  });
});
