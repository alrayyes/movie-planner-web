import { describe, expect, test } from "bun:test";
import type { LoggedViewing } from "../caldav/types";
import { groupMediums } from "./group";

// #755: one row per medium, however its casing was stored.
const viewing = (uid: string, medium: string | undefined): LoggedViewing =>
  ({
    uid,
    title: uid,
    start: "2026-01-01T19:00:00.000Z",
    end: "2026-01-01T21:00:00.000Z",
    medium,
  }) as LoggedViewing;

describe("groupMediums", () => {
  test("counts cinema and Cinema as one medium", () => {
    const rows = groupMediums([viewing("a", "cinema"), viewing("b", "Cinema")], []);
    expect(rows).toEqual([{ medium: "Cinema", count: 2 }]);
  });

  test("a blank medium counts as Cinema too", () => {
    const rows = groupMediums([viewing("a", undefined), viewing("b", "cinema")], []);
    expect(rows).toEqual([{ medium: "Cinema", count: 2 }]);
  });

  test("labels a row with the spelling on the visitor's own list", () => {
    const rows = groupMediums([viewing("a", "netflix"), viewing("b", "NETFLIX")], ["Netflix"]);
    expect(rows).toEqual([
      { medium: "Netflix", count: 2 },
      { medium: "Cinema", count: 0 },
    ]);
  });

  test("without a listed spelling, the first one seen labels the row", () => {
    const rows = groupMediums([viewing("a", "Streaming"), viewing("b", "streaming")], []);
    expect(rows.find((row) => row.count === 2)?.medium).toBe("Streaming");
  });

  test("keeps different mediums apart and orders by count, then name", () => {
    const rows = groupMediums(
      [
        viewing("a", "Netflix"),
        viewing("b", "Cinema"),
        viewing("c", "Cinema"),
        viewing("d", "Blu-ray"),
      ],
      [],
    );
    expect(rows.map((row) => `${row.medium}:${row.count}`)).toEqual([
      "Cinema:2",
      "Blu-ray:1",
      "Netflix:1",
    ]);
  });

  test("lists a medium nobody has used yet, with a count of zero", () => {
    const rows = groupMediums([], ["Netflix"]);
    expect(rows).toEqual([
      { medium: "Cinema", count: 0 },
      { medium: "Netflix", count: 0 },
    ]);
  });
});

describe("groupMediums edge cases", () => {
  test("a listed spelling of the default medium doesn't replace Cinema's label", () => {
    expect(groupMediums([], ["cinema"])).toEqual([{ medium: "Cinema", count: 0 }]);
  });

  test("the first listed spelling labels a medium listed twice", () => {
    expect(groupMediums([], ["Netflix", "netflix"])).toEqual([
      { medium: "Cinema", count: 0 },
      { medium: "Netflix", count: 0 },
    ]);
  });

  test("trims stray spaces from the label of an unlisted medium", () => {
    expect(groupMediums([viewing("a", "  Streaming  ")], [])).toEqual([
      { medium: "Streaming", count: 1 },
      { medium: "Cinema", count: 0 },
    ]);
  });
});
