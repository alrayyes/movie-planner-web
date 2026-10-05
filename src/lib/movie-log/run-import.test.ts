import { describe, expect, test } from "bun:test";
import type { LoggedViewing } from "../caldav/types";
import type { ImportRow, ParsedRow } from "./import-rows";
import { planImport, planUpdates, toIsoDateTime } from "./run-import";

function row(rowNumber: number, title: string, date: string): ParsedRow {
  return { rowNumber, row: { title, date, medium: "cinema" } };
}

function exportedRow(rowNumber: number, fields: Partial<ImportRow> & { uid: string }): ParsedRow {
  return {
    rowNumber,
    row: {
      title: "Dune",
      date: "2026-01-01",
      medium: "cinema",
      start: "2026-01-01T19:00:00.000Z",
      end: "2026-01-01T21:30:00.000Z",
      ...fields,
    },
  };
}

describe("planImport", () => {
  test("flags a row matching an existing calendar entry on the same day", () => {
    const existing: LoggedViewing[] = [
      {
        uid: "1",
        title: "Dune: Part Two",
        start: "2026-01-01T19:00:00.000Z",
        end: "2026-01-01T21:30:00.000Z",
        medium: "cinema",
      },
    ];
    const plan = planImport([row(2, "Dune - Part Two", "2026-01-01")], existing);

    expect(plan[0]?.isDuplicate).toBe(true);
    expect(plan[0]?.duplicateOfTitle).toBe("Dune: Part Two");
  });

  test("doesn't flag the same title on a different day (a legitimate rewatch)", () => {
    const existing: LoggedViewing[] = [
      {
        uid: "1",
        title: "Dune: Part Two",
        start: "2026-01-01T19:00:00.000Z",
        end: "2026-01-01T21:30:00.000Z",
        medium: "cinema",
      },
    ];
    const plan = planImport([row(2, "Dune: Part Two", "2026-06-01")], existing);

    expect(plan[0]?.isDuplicate).toBe(false);
  });

  test("doesn't flag genuinely different titles, even related ones, as duplicates", () => {
    const existing: LoggedViewing[] = [
      {
        uid: "1",
        title: "Dune",
        start: "2026-01-01T19:00:00.000Z",
        end: "2026-01-01T21:30:00.000Z",
        medium: "cinema",
      },
    ];
    const plan = planImport([row(2, "Dune: Part Two", "2026-01-01")], existing);

    expect(plan[0]?.isDuplicate).toBe(false);
  });

  test("flags a within-file duplicate against an earlier row in the same import", () => {
    const plan = planImport(
      [row(2, "Paddington: In Peru", "2026-02-01"), row(3, "Paddington - In Peru", "2026-02-01")],
      [],
    );

    expect(plan[0]?.isDuplicate).toBe(false);
    expect(plan[1]?.isDuplicate).toBe(true);
    expect(plan[1]?.duplicateOfTitle).toBe("Paddington: In Peru");
  });

  test("skips rows that failed to parse", () => {
    const rows: ParsedRow[] = [{ rowNumber: 2, error: "title is required" }];
    expect(planImport(rows, [])).toHaveLength(0);
  });

  // #69
  test("a row whose uid matches an existing entry is never offered as a new create", () => {
    const existing: LoggedViewing[] = [
      {
        uid: "dune-uid",
        title: "Dune",
        start: "2026-01-01T19:00:00.000Z",
        end: "2026-01-01T21:30:00.000Z",
        medium: "cinema",
      },
    ];
    const rows = [exportedRow(2, { uid: "dune-uid", director: "Denis Villeneuve" })];

    expect(planImport(rows, existing)).toHaveLength(0);
  });
});

describe("planUpdates", () => {
  test("a uid match with a genuinely different field produces one change", () => {
    const existing: LoggedViewing[] = [
      {
        uid: "dune-uid",
        title: "Dune",
        start: "2026-01-01T19:00:00.000Z",
        end: "2026-01-01T21:30:00.000Z",
        medium: "cinema",
      },
    ];
    const rows = [exportedRow(2, { uid: "dune-uid", director: "Denis Villeneuve" })];

    const updates = planUpdates(rows, existing);
    expect(updates).toHaveLength(1);
    expect(updates[0]?.uid).toBe("dune-uid");
    expect(updates[0]?.changes).toEqual([
      { field: "director", label: "Director", oldValue: undefined, newValue: "Denis Villeneuve" },
    ]);
  });

  test("a uid match with no actual differences produces no entry at all", () => {
    const existing: LoggedViewing[] = [
      {
        uid: "dune-uid",
        title: "Dune",
        start: "2026-01-01T19:00:00.000Z",
        end: "2026-01-01T21:30:00.000Z",
        medium: "cinema",
        director: "Denis Villeneuve",
      },
    ];
    const rows = [exportedRow(2, { uid: "dune-uid", director: "Denis Villeneuve" })];

    expect(planUpdates(rows, existing)).toHaveLength(0);
  });

  test("a field the row doesn't specify at all is left alone, not proposed as a change", () => {
    const existing: LoggedViewing[] = [
      {
        uid: "dune-uid",
        title: "Dune",
        start: "2026-01-01T19:00:00.000Z",
        end: "2026-01-01T21:30:00.000Z",
        medium: "cinema",
        director: "Denis Villeneuve",
      },
    ];
    // No `director` field on this row at all — distinct from the row
    // having it set to an empty string.
    const rows = [exportedRow(2, { uid: "dune-uid" })];

    expect(planUpdates(rows, existing)).toHaveLength(0);
  });

  test("a row with no uid at all is never an update candidate", () => {
    const existing: LoggedViewing[] = [
      {
        uid: "dune-uid",
        title: "Dune",
        start: "2026-01-01T19:00:00.000Z",
        end: "2026-01-01T21:30:00.000Z",
        medium: "cinema",
      },
    ];
    const rows = [row(2, "Dune", "2026-01-01")];

    expect(planUpdates(rows, existing)).toHaveLength(0);
  });

  test("a uid that doesn't match anything existing is never an update candidate", () => {
    const rows = [exportedRow(2, { uid: "does-not-exist", director: "Denis Villeneuve" })];

    expect(planUpdates(rows, [])).toHaveLength(0);
  });

  test("a changed start time is reported as its own change", () => {
    const existing: LoggedViewing[] = [
      {
        uid: "dune-uid",
        title: "Dune",
        start: "2026-01-01T19:00:00.000Z",
        end: "2026-01-01T21:30:00.000Z",
        medium: "cinema",
      },
    ];
    const rows = [exportedRow(2, { uid: "dune-uid", start: "2026-01-01T20:00:00.000Z" })];

    const updates = planUpdates(rows, existing);
    expect(updates[0]?.changes).toEqual([
      {
        field: "start",
        label: "Start",
        oldValue: "2026-01-01T19:00:00.000Z",
        newValue: "2026-01-01T20:00:00.000Z",
      },
    ]);
  });

  test("multiple changed fields on one row all get reported", () => {
    const existing: LoggedViewing[] = [
      {
        uid: "dune-uid",
        title: "Dune",
        start: "2026-01-01T19:00:00.000Z",
        end: "2026-01-01T21:30:00.000Z",
        medium: "cinema",
        posterUrl: "https://example.com/old-poster.jpg",
      },
    ];
    const rows = [
      exportedRow(2, {
        uid: "dune-uid",
        director: "Denis Villeneuve",
        posterUrl: "https://example.com/new-poster.jpg",
      }),
    ];

    const fields = planUpdates(rows, existing)[0]
      ?.changes.map((c) => c.field)
      .sort();
    expect(fields).toEqual(["director", "posterUrl"]);
  });
});

// #753: a row's time may carry seconds, so the stamp can't append ":00" blindly.
describe("toIsoDateTime with seconds", () => {
  test("a time with seconds keeps them", () => {
    expect(toIsoDateTime("2024-03-15", "19:00:30")).toBe(
      new Date(2024, 2, 15, 19, 0, 30).toISOString(),
    );
  });
  test("a time without seconds still works", () => {
    expect(toIsoDateTime("2024-03-15", "19:00")).toBe(
      new Date(2024, 2, 15, 19, 0, 0).toISOString(),
    );
  });
  test("no time means midnight", () => {
    expect(toIsoDateTime("2024-03-15", undefined)).toBe(
      new Date(2024, 2, 15, 0, 0, 0).toISOString(),
    );
  });
});

// #751: the duplicate check compares an existing viewing's date with the row's
// date, and the row's date is a calendar date the visitor typed. The existing
// viewing's date is the viewer's own calendar date for its start, not the UTC
// date of the stored instant: 00:30 on the 15th in Amsterdam is 23:30Z on the
// 14th, and the UTC date made a viewing logged just after midnight never match.
describe("planImport compares dates as the viewer's local date", () => {
  const inZone = (zone: string, run: () => void) => {
    const before = process.env.TZ;
    process.env.TZ = zone;
    try {
      run();
    } finally {
      if (before === undefined) delete process.env.TZ;
      else process.env.TZ = before;
    }
  };
  const lateShow = (): LoggedViewing => ({
    uid: "late",
    title: "Late Show",
    start: new Date(2024, 2, 15, 0, 30).toISOString(),
    end: new Date(2024, 2, 15, 2, 15).toISOString(),
    medium: "cinema",
  });

  test("a viewing logged at 00:30 matches a row dated that local day", () => {
    inZone("Europe/Amsterdam", () => {
      const viewing = lateShow();
      expect(viewing.start.slice(0, 10)).toBe("2024-03-14");
      const plan = planImport([row(2, "Late Show", "2024-03-15")], [viewing]);
      expect(plan[0]?.isDuplicate).toBe(true);
    });
  });

  test("and doesn't match a row dated the UTC day before", () => {
    inZone("Europe/Amsterdam", () => {
      const plan = planImport([row(2, "Late Show", "2024-03-14")], [lateShow()]);
      expect(plan[0]?.isDuplicate).toBe(false);
    });
  });

  test("a viewing logged in the evening west of UTC matches its own local day", () => {
    inZone("America/New_York", () => {
      // 21:00 on the 15th in New York is 01:00Z on the 16th.
      const evening: LoggedViewing = {
        uid: "evening",
        title: "Evening Show",
        start: new Date(2024, 2, 15, 21, 0).toISOString(),
        end: new Date(2024, 2, 15, 23, 0).toISOString(),
        medium: "cinema",
      };
      expect(evening.start.slice(0, 10)).toBe("2024-03-16");
      expect(planImport([row(2, "Evening Show", "2024-03-15")], [evening])[0]?.isDuplicate).toBe(
        true,
      );
    });
  });
});
