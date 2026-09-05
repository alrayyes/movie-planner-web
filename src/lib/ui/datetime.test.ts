import { describe, expect, test } from "bun:test";
import { formatDate, formatDateTime, formatPeriod, formatTime } from "./datetime";

// #93: assertions are pattern-based rather than hardcoded clock values —
// the actual hour depends on the test runner's own timezone (a Date's
// toLocale*String methods render in local time), so what's checked here
// is the *shape* (nl-NL weekday/date order, 24-hour clock, no AM/PM),
// not one fixed instant.
describe("formatDate", () => {
  test("renders a short weekday and dd-mm-yyyy", () => {
    expect(formatDate("2026-08-29T12:40:00.000Z")).toMatch(/^[a-z]{2} \d{2}-\d{2}-2026$/);
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
    expect(period).toMatch(/^[a-z]{2} \d{2}-\d{2}-2026 \d{2}:\d{2}:\d{2} - \d{2}:\d{2}:\d{2}$/);
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
