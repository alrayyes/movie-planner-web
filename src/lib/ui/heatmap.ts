import type { LoggedViewing } from "../caldav/types";
import { toDateInputValue } from "./datetime";

// #198/#188: groups by the visitor's own local calendar day
// (toDateInputValue, not a UTC-based key) — the same local-day
// handling calendar-overview's own default-range fix already needed,
// reused here rather than re-derived a third time. The heatmap's own
// per-day popover needs the real viewings, not just a count.
export function groupViewingsByLocalDay(viewings: LoggedViewing[]): Map<string, LoggedViewing[]> {
  const groups = new Map<string, LoggedViewing[]>();
  for (const viewing of viewings) {
    const day = toDateInputValue(viewing.start);
    const existing = groups.get(day);
    if (existing) existing.push(viewing);
    else groups.set(day, [viewing]);
  }
  return groups;
}

export function bucketViewingsByLocalDay(viewings: LoggedViewing[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const [day, dayViewings] of groupViewingsByLocalDay(viewings)) {
    counts.set(day, dayViewings.length);
  }
  return counts;
}

export interface HeatmapDayCell {
  date: string;
  count: number;
}

export interface HeatmapWeek {
  // Sunday (index 0) through Saturday (index 6) — GitHub's own
  // convention, adopted as-is since nothing in this app already had a
  // day-of-week row convention to match instead. `null` marks a
  // padding day outside the year being rendered (before that year's
  // January 1st, or after its own end date).
  days: (HeatmapDayCell | null)[];
}

export interface HeatmapMonthLabel {
  weekIndex: number;
  monthKey: string;
  label: string;
}

export interface HeatmapYearGrid {
  year: string;
  weeks: HeatmapWeek[];
  monthLabels: HeatmapMonthLabel[];
}

const MONTH_LABEL_LOCALE = "en-US";

function dateKey(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function monthShortLabel(monthKey: string): string {
  const [y, m] = monthKey.split("-").map(Number) as [number, number];
  return new Date(y, m - 1, 1).toLocaleDateString(MONTH_LABEL_LOCALE, { month: "short" });
}

function buildYearGrid(year: string, counts: Map<string, number>, today: Date): HeatmapYearGrid {
  const y = Number(year);
  const jan1 = new Date(y, 0, 1);
  const dec31 = new Date(y, 11, 31);
  // The current year in progress renders only up to today — a
  // contribution graph with a wall of "empty" cells for a future that
  // hasn't happened yet reads as broken, not accurate.
  const end = y === today.getFullYear() && today < dec31 ? today : dec31;

  const gridStart = new Date(jan1);
  gridStart.setDate(gridStart.getDate() - gridStart.getDay());
  const gridEnd = new Date(end);
  gridEnd.setDate(gridEnd.getDate() + (6 - gridEnd.getDay()));

  const weeks: HeatmapWeek[] = [];
  const monthLabels: HeatmapMonthLabel[] = [];

  for (
    let weekStart = new Date(gridStart);
    weekStart <= gridEnd;
    weekStart.setDate(weekStart.getDate() + 7)
  ) {
    const days: (HeatmapDayCell | null)[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(weekStart);
      d.setDate(d.getDate() + i);
      if (d < jan1 || d > end) {
        days.push(null);
        continue;
      }
      const key = dateKey(d);
      days.push({ date: key, count: counts.get(key) ?? 0 });
    }

    const weekIndex = weeks.length;
    weeks.push({ days });

    // A month's label goes on whichever column actually contains its
    // own 1st — not the column's own first non-padding day, which can
    // still belong to the previous month when a month starts mid-week
    // (that column would then wrongly carry the old month's label one
    // extra week).
    for (const day of days) {
      if (day && day.date.slice(-2) === "01") {
        const monthKey = day.date.slice(0, 7);
        monthLabels.push({ weekIndex, monthKey, label: monthShortLabel(monthKey) });
      }
    }
  }

  return { year, weeks, monthLabels };
}

// #536: redesigned from a stacked month-by-month grid (#198/#204's
// original shape) into a GitHub-contribution-graph-style grid — weeks
// as columns, Sunday-to-Saturday as rows, month labels above the
// columns they span — grouped by real calendar-year boundaries rather
// than GitHub's own continuous rolling 52-week window, per the
// ticket's explicit "grouped by year" requirement (the simpler,
// literal reading design.md settled on — not an attempt to ape
// GitHub's own edge-case handling exactly).
//
// Only years with at least one logged viewing render at all — `counts`
// (bucketViewingsByLocalDay's own output) never holds a key for a day
// with nothing logged, so a year absent from its keys had zero
// activity across every one of its days, the same "don't render a
// wall of nothing" reasoning #286 applied at year grain instead of
// month grain.
//
// A rendered year still gets its *whole* calendar year, active or
// not — unlike the old per-month skip, an empty stretch inside an
// active year can't be dropped without breaking week-column
// continuity (that discontinuity is exactly what a GitHub-style graph
// never has); a few quiet columns cost far less screen space than the
// old design's full-width empty-month blocks did.
export function buildYearGrids(
  counts: Map<string, number>,
  today: Date = new Date(),
): HeatmapYearGrid[] {
  const years = new Set<string>();
  for (const key of counts.keys()) years.add(key.slice(0, 4));

  return [...years].sort().map((year) => buildYearGrid(year, counts, today));
}
