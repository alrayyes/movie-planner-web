import type { LoggedViewing, NewViewing } from "../caldav/types";
import type { FieldChange } from "./types";

function formatValue(value: unknown): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  return typeof value === "object" ? JSON.stringify(value) : String(value);
}

// #349: field-by-field, not a deep-equal on the whole object — a visitor
// debugging a wrong refresh wants to know exactly which fields moved, not
// just that "something" changed. `before` is whatever this app's own
// updateViewing already fetched (parsed back into a LoggedViewing) right
// before overwriting it; `null` when that fetch failed or found nothing
// (a brand-new resource, or the best-effort read in updateViewing came up
// empty) — same as "no changes to report" rather than a guess.
export function diffViewings(before: LoggedViewing | null, after: NewViewing): FieldChange[] {
  if (!before) return [];
  const changes: FieldChange[] = [];
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]) as Set<keyof LoggedViewing>;
  for (const key of keys) {
    // #432: lastModifiedBy is bookkeeping (client.ts's putViewing always
    // sets it to "web" on this app's own write path) — reporting it as
    // a "changed field" would spam a "lastModifiedBy: cli -> web" line
    // on every edit that follows a CLI-made one, same reason uid (a
    // different kind of identity field) is excluded too.
    if (key === "uid" || key === "lastModifiedBy") continue;
    const beforeValue = formatValue(before[key]);
    const afterValue = formatValue((after as LoggedViewing)[key]);
    if (beforeValue !== afterValue) {
      changes.push({ field: key, before: beforeValue, after: afterValue });
    }
  }
  return changes;
}
