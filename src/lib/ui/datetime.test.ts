import { describe, expect, test } from "bun:test";
import {
  computeBlockedTimeBar,
  formatDate,
  formatDateTime,
  formatPeriod,
  formatTime,
  localDayBoundary,
  toDateInputValue,
} from "./datetime";

// #93/#142: assertions are pattern-based rather than hardcoded clock
// values — the actual hour depends on the test runner's own timezone
// (a Date's toLocale*String methods render in local time), so what's
// checked here is the *shape* (English weekday, dd-mm-yyyy date order,
// 24-hour clock, no AM/PM), not one fixed instant.
describe("formatDate", () => {
  test("renders an English short weekday and dd-mm-yyyy", () => {
    expect(formatDate("2026-08-29T12:40:00.000Z")).toMatch(/^[A-Z][a-z]{2} \d{2}-\d{2}-2026$/);
  });
});

describe("formatTime", () => {
  test("renders a 24-hour HH:MM:SS with no AM/PM", () => {
    const time = formatTime("2026-08-29T12:40:00.000Z");
    expect(time).toMatch(/^\d{2}:\d{2}:\d{2}$/);
    expect(time).not.toMatch(/[ap]\.?m\.?/i);
  });
});

describe("formatDateTime", () => {
  test("renders a full date and 24-hour time with no AM/PM", () => {
    const value = formatDateTime("2026-08-29T12:40:00.000Z");
    expect(value).not.toMatch(/[ap]\.?m\.?/i);
    expect(value).toMatch(/\d{4}/);
  });
});

describe("formatPeriod", () => {
  test("merges a same-day start/end into one date plus a time range", () => {
    const period = formatPeriod("2026-08-29T12:40:00.000Z", "2026-08-29T13:40:00.000Z");
    // One date, two times joined by " - ", not two full date-times.
    expect(period).toMatch(
      /^[A-Z][a-z]{2} \d{2}-\d{2}-2026 \d{2}:\d{2}:\d{2} - \d{2}:\d{2}:\d{2}$/,
    );
  });

  test("falls back to two full date-times when start and end are different days", () => {
    // Two days apart in UTC, not just either side of a single midnight —
    // margin enough that this stays a different local calendar day
    // regardless of the test runner's own timezone offset.
    const period = formatPeriod("2026-08-29T10:00:00.000Z", "2026-08-31T10:00:00.000Z");
    const separatorCount = (period.match(/ - /g) ?? []).length;
    expect(separatorCount).toBe(1);
    expect(period).toContain("2026");
    // Both a start and end year appear only if each side carries its own
    // full date — the same-day form only carries one.
    expect(period.split(" - ")[0]).toMatch(/\d{4}/);
    expect(period.split(" - ")[1]).toMatch(/\d{4}/);
  });
});

// #188/#199: moved from CalendarOverview.svelte's own private scope so
// the heatmap could import the fixed local-day logic instead of
// re-deriving it — these tests moved with them.
describe("toDateInputValue / localDayBoundary", () => {
  test("round-trips a local calendar day through toDateInputValue and back to its own start/end", () => {
    const now = new Date();
    const localDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 14, 30, 0);
    const dayValue = toDateInputValue(localDay.toISOString());

    // The date-input value itself is the same Y-M-D as the local
    // components used to build it — not shifted by a day either way.
    const pad = (n: number) => String(n).padStart(2, "0");
    expect(dayValue).toBe(
      `${localDay.getFullYear()}-${pad(localDay.getMonth() + 1)}-${pad(localDay.getDate())}`,
    );

    const start = new Date(localDayBoundary(dayValue, false));
    const end = new Date(localDayBoundary(dayValue, true));
    // Both boundaries land on the same local calendar day the input
    // value named — not shifted to UTC's version of that day.
    expect(start.getFullYear()).toBe(localDay.getFullYear());
    expect(start.getMonth()).toBe(localDay.getMonth());
    expect(start.getDate()).toBe(localDay.getDate());
    expect(start.getHours()).toBe(0);
    expect(end.getDate()).toBe(localDay.getDate());
    expect(end.getHours()).toBe(23);
    expect(end.getMinutes()).toBe(59);
  });

  test("localDayBoundary's end-of-day boundary includes a viewing that starts later that same local day", () => {
    // #188's own bug: a bare UTC-midnight boundary excluded a viewing
    // whose own start time was later that day. Constructed via local
    // Y/M/D so this is deterministic regardless of the runner's own
    // timezone offset.
    const now = new Date();
    const day = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const laterThatDay = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 22, 0, 0);
    const dayValue = toDateInputValue(day.toISOString());

    const endOfDay = new Date(localDayBoundary(dayValue, true));
    expect(laterThatDay.getTime()).toBeLessThanOrEqual(endOfDay.getTime());
  });
});

// #199: constructed via local Y/M/D/H/M (not a bare UTC ISO string), so
// the expected position/width can be computed the same way regardless
// of the test runner's own timezone offset — same reasoning as
// formatPeriod's own tests above.
describe("computeBlockedTimeBar", () => {
  test("positions and sizes a same-day viewing within the 24-hour track", () => {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 19, 0, 0);
    const end = new Date(start.getTime() + 150 * 60 * 1000); // 2.5 hours

    const { positionPercent, widthPercent } = computeBlockedTimeBar(
      start.toISOString(),
      end.toISOString(),
    );

    expect(positionPercent).toBeCloseTo((19 * 60 * 100) / (24 * 60), 5);
    expect(widthPercent).toBeCloseTo((150 * 100) / (24 * 60), 5);
  });

  test("a very short viewing still gets a real, non-zero width", () => {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 10, 0, 0);
    const end = new Date(start.getTime() + 5 * 60 * 1000); // 5 minutes

    const { widthPercent } = computeBlockedTimeBar(start.toISOString(), end.toISOString());

    expect(widthPercent).toBeGreaterThan(0);
    expect(widthPercent).toBeCloseTo((5 * 100) / (24 * 60), 5);
  });

  test("clips a midnight-crossing viewing at the track's edge, not wrapped or split", () => {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 30, 0);
    const end = new Date(start.getTime() + 90 * 60 * 1000); // crosses into the next day

    const { positionPercent, widthPercent } = computeBlockedTimeBar(
      start.toISOString(),
      end.toISOString(),
    );
    const uncappedWidthPercent = (90 * 100) / (24 * 60);

    // Clipped to the track's own right edge, not the viewing's real
    // (longer) duration.
    expect(positionPercent + widthPercent).toBeCloseTo(100, 5);
    expect(widthPercent).toBeLessThan(uncappedWidthPercent);
  });

  test("positions against the visitor's own local day, not UTC (the #188 bug class)", () => {
    // A fixed UTC instant whose local hour genuinely differs from its
    // UTC hour in any timezone but UTC itself — matching #188's own
    // fix, the expected value is derived from the same local Date
    // accessors the implementation itself must use, not a hardcoded
    // number, so this still means something regardless of which
    // timezone actually runs it.
    const start = new Date("2026-08-06T23:00:00.000Z");
    const end = new Date(start.getTime() + 30 * 60 * 1000);

    const { positionPercent } = computeBlockedTimeBar(start.toISOString(), end.toISOString());
    const expectedMinutes = start.getHours() * 60 + start.getMinutes();

    expect(positionPercent).toBeCloseTo((expectedMinutes * 100) / (24 * 60), 5);
  });
});
