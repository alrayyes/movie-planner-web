import { describe, expect, test } from "bun:test";
import type { LoggedViewing } from "../caldav/types";
import type { ParsedRow } from "./import-rows";
import { planImport } from "./run-import";

function row(rowNumber: number, title: string, date: string): ParsedRow {
  return { rowNumber, row: { title, date, medium: "cinema" } };
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
});
