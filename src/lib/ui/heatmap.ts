import type { LoggedViewing } from "../caldav/types";
import { toDateInputValue } from "./datetime";

// #199/#188: buckets by the visitor's own local calendar day
// (toDateInputValue, not a UTC-based key) — the same local-day
// handling calendar-overview's own default-range fix already needed,
// reused here rather than re-derived a third time.
export function bucketViewingsByLocalDay(viewings: LoggedViewing[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const viewing of viewings) {
    const day = toDateInputValue(viewing.start);
    counts.set(day, (counts.get(day) ?? 0) + 1);
  }
  return counts;
}
