import { describe, expect, test } from "bun:test";
import type { LoggedViewing } from "../caldav/types";
import { bucketViewingsByLocalDay, buildYearGrids, groupViewingsByLocalDay } from "./heatmap";

function viewing(uid: string, start: string): LoggedViewing {
  return { uid, title: uid, start, end: start, medium: "cinema" };
}

describe("bucketViewingsByLocalDay", () => {
  test("counts several viewings on one day, one on another, none on a third", () => {
    const now = new Date();
    const dayA = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 10, 0, 0);
    const dayB = new Date(dayA.getTime() + 24 * 60 * 60 * 1000);

    const counts = bucketViewingsByLocalDay([
      viewing("a1", new Date(dayA.getTime()).toISOString()),
      viewing("a2", new Date(dayA.getTime() + 60 * 60 * 1000).toISOString()),
      viewing("a3", new Date(dayA.getTime() + 2 * 60 * 60 * 1000).toISOString()),
      viewing("b1", dayB.toISOString()),
    ]);

    const pad = (n: number) => String(n).padStart(2, "0");
    const keyFor = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

    expect(counts.get(keyFor(dayA))).toBe(3);
    expect(counts.get(keyFor(dayB))).toBe(1);
    // A day with no viewings simply isn't a key — the caller fills in 0
    // for every day in its own displayed range.
    const dayC = new Date(dayB.getTime() + 24 * 60 * 60 * 1000);
    expect(counts.has(keyFor(dayC))).toBe(false);
  });

  test("no viewings at all buckets to an empty map, not an error", () => {
    expect(bucketViewingsByLocalDay([]).size).toBe(0);
  });

  test("buckets by the visitor's own local day, not UTC (the #188 bug class)", () => {
    // A fixed UTC instant whose local day genuinely differs from its
    // UTC day in any timezone but UTC — the expected key is derived
    // from the same local Date accessors the implementation itself
    // must use, not a hardcoded date, so this still means something
    // regardless of which timezone actually runs it.
    const start = "2026-08-06T23:30:00.000Z";
    const localDate = new Date(start);
    const pad = (n: number) => String(n).padStart(2, "0");
    const expectedKey = `${localDate.getFullYear()}-${pad(localDate.getMonth() + 1)}-${pad(localDate.getDate())}`;

    const counts = bucketViewingsByLocalDay([viewing("uid", start)]);

    expect(counts.get(expectedKey)).toBe(1);
  });
});

describe("groupViewingsByLocalDay", () => {
  test("groups the real viewings by day, preserving each one", () => {
    const now = new Date();
    const dayA = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 10, 0, 0);
    const a1 = viewing("a1", dayA.toISOString());
    const a2 = viewing("a2", new Date(dayA.getTime() + 60 * 60 * 1000).toISOString());
    const b1 = viewing("b1", new Date(dayA.getTime() + 24 * 60 * 60 * 1000).toISOString());

    const groups = groupViewingsByLocalDay([a1, a2, b1]);

    const pad = (n: number) => String(n).padStart(2, "0");
    const keyFor = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const dayAGroup = groups.get(keyFor(dayA));
    expect(dayAGroup?.map((v) => v.uid)).toEqual(["a1", "a2"]);
    expect(
      groups.get(keyFor(new Date(dayA.getTime() + 24 * 60 * 60 * 1000)))?.map((v) => v.uid),
    ).toEqual(["b1"]);
  });
});

// #536: the GitHub-contribution-graph-style redesign — weeks as
// columns, Sunday-to-Saturday as rows, month labels above the columns
// they span, grouped by real calendar-year boundaries.
describe("buildYearGrids", () => {
  test("no counts at all produces no year grids", () => {
    expect(buildYearGrids(new Map())).toEqual([]);
  });

  // #568: newest first — the year a visitor is most likely checking on
  // (their most recent activity) shouldn't need scrolling past every
  // older year to reach.
  test("only years with at least one logged day render, sorted newest first", () => {
    const counts = new Map([
      ["2024-06-15", 1],
      ["2026-01-02", 2],
    ]);
    const grids = buildYearGrids(counts, new Date(2026, 5, 1));

    expect(grids.map((g) => g.year)).toEqual(["2026", "2024"]);
    // A year with zero logged days in between (2025) never appears —
    // same "don't render a wall of nothing" reasoning #286 applied at
    // year grain.
  });

  test("a year's grid runs Sunday-to-Saturday, Sunday first, from the Sunday on/before January 1st", () => {
    // 2026-01-01 is a Thursday, so the grid's first week starts on
    // 2025-12-28 (the Sunday before) with four padding cells (row
    // indices 0-3: Sun/Mon/Tue/Wed) ahead of it.
    const counts = new Map([["2026-01-01", 1]]);
    const [grid] = buildYearGrids(counts, new Date(2026, 11, 31));

    expect(grid).toBeDefined();
    const firstWeek = grid?.weeks[0];
    expect(firstWeek?.days[0]).toBeNull();
    expect(firstWeek?.days[1]).toBeNull();
    expect(firstWeek?.days[2]).toBeNull();
    expect(firstWeek?.days[3]).toBeNull();
    expect(firstWeek?.days[4]).toEqual({ date: "2026-01-01", count: 1 });
  });

  test("a day cell's count comes straight from the counts map, defaulting to 0", () => {
    const counts = new Map([["2026-03-15", 4]]);
    const [grid] = buildYearGrids(counts, new Date(2026, 11, 31));

    const allDays = grid?.weeks.flatMap((w) => w.days).filter((d) => d !== null) ?? [];
    const match = allDays.find((d) => d?.date === "2026-03-15");
    expect(match?.count).toBe(4);
    // Some other logged-year day with nothing that specific day is
    // still a real (non-padding) cell, at count 0 — not skipped, since
    // the grid's whole point is showing the full year continuously.
    const otherDay = allDays.find((d) => d?.date === "2026-01-05");
    expect(otherDay).toEqual({ date: "2026-01-05", count: 0 });
  });

  test("the current year's grid stops at today, not a wall of future cells", () => {
    const counts = new Map([["2026-09-10", 1]]);
    const today = new Date(2026, 8, 10); // 2026-09-10
    const [grid] = buildYearGrids(counts, today);

    const allDays = grid?.weeks.flatMap((w) => w.days).filter((d) => d !== null) ?? [];
    expect(allDays.some((d) => d?.date === "2026-09-10")).toBe(true);
    expect(allDays.some((d) => d?.date === "2026-09-11")).toBe(false);
    expect(allDays.some((d) => d?.date === "2026-12-31")).toBe(false);
  });

  test("a past year's grid runs the whole calendar year, December 31st included", () => {
    const counts = new Map([["2025-01-01", 1]]);
    const [grid] = buildYearGrids(counts, new Date(2026, 8, 10));

    const allDays = grid?.weeks.flatMap((w) => w.days).filter((d) => d !== null) ?? [];
    expect(allDays.some((d) => d?.date === "2025-12-31")).toBe(true);
  });

  test("one month label per month, positioned on the week column containing that month's 1st", () => {
    const counts = new Map([["2026-01-01", 1]]);
    const [grid] = buildYearGrids(counts, new Date(2026, 2, 31)); // through March

    expect(grid?.monthLabels).toEqual([
      { weekIndex: 0, monthKey: "2026-01", label: "Jan" },
      expect.objectContaining({ monthKey: "2026-02", label: "Feb" }),
      expect.objectContaining({ monthKey: "2026-03", label: "Mar" }),
    ]);
    // Each label's own week column really does contain that month's
    // 1st, not just an approximate column.
    for (const m of grid?.monthLabels ?? []) {
      const week = grid?.weeks[m.weekIndex];
      expect(week?.days.some((d) => d?.date === `${m.monthKey}-01`)).toBe(true);
    }
  });
});

// #749: where a year's grid ends, by hand. Weeks run Sunday to Saturday.
describe("buildYearGrids, where a grid ends", () => {
  const cells = (week: { days: ({ date: string } | null)[] } | undefined) =>
    (week?.days ?? []).map((day) => day?.date ?? null);

  test("a past year ends at its own December 31st, padded to the Saturday after", () => {
    // 2025 starts on a Wednesday and ends on a Wednesday: the first week starts
    // Sunday 29 December 2024 and the last ends Saturday 3 January 2026.
    const [grid] = buildYearGrids(new Map([["2025-06-01", 1]]), new Date(2026, 8, 10));
    expect(grid?.weeks).toHaveLength(53);
    expect(cells(grid?.weeks.at(-1))).toEqual([
      "2025-12-28",
      "2025-12-29",
      "2025-12-30",
      "2025-12-31",
      null,
      null,
      null,
    ]);
  });

  test("a year still to come is drawn in full, not cut off at today", () => {
    const [grid] = buildYearGrids(new Map([["2027-03-01", 2]]), new Date(2026, 8, 10));
    const days = grid?.weeks.flatMap((w) => w.days).filter((d) => d !== null) ?? [];
    expect(days.find((d) => d?.date === "2027-03-01")?.count).toBe(2);
    expect(days.at(-1)?.date).toBe("2027-12-31");
  });

  test("the current year ends at today and is padded to that week's Saturday", () => {
    // Wednesday 4 March 2026: the last week is 1 to 7 March, with 5 to 7 empty.
    const [grid] = buildYearGrids(new Map([["2026-03-04", 1]]), new Date(2026, 2, 4));
    expect(grid?.weeks).toHaveLength(10);
    expect(cells(grid?.weeks.at(-1))).toEqual([
      "2026-03-01",
      "2026-03-02",
      "2026-03-03",
      "2026-03-04",
      null,
      null,
      null,
    ]);
  });

  test("a current year that ends on a Sunday still gets that last week", () => {
    // Sunday 8 March 2026: its week holds one cell, then six empty ones.
    const [grid] = buildYearGrids(new Map([["2026-03-08", 1]]), new Date(2026, 2, 8));
    expect(grid?.weeks).toHaveLength(11);
    expect(cells(grid?.weeks.at(-1))).toEqual(["2026-03-08", null, null, null, null, null, null]);
  });

  test("years come back newest first whatever order the counts were built in", () => {
    const counts = new Map([
      ["2025-01-01", 1],
      ["2023-01-01", 1],
      ["2024-01-01", 1],
    ]);
    const years = buildYearGrids(counts, new Date(2026, 8, 10)).map((grid) => grid.year);
    expect(years).toEqual(["2025", "2024", "2023"]);
  });
});
