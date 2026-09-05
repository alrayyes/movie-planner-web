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
