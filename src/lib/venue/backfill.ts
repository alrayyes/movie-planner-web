import type { LoggedViewing, VenueEntry } from "../caldav/types";

export interface MissingVenue {
  name: string;
  count: number;
}

// #636: an explicit, visitor-triggered "Add venue" bulk-add source —
// venue names already seen on logged viewings but never added to the
// structured picklist (an account whose history predates #452/#518, or
// that's only ever been logged via the CLI, which knows nothing of this
// app's picklist sidecar). Deliberately not run implicitly on a normal
// dialog open — #339 already decided against silently reconciling the
// picklist against prior viewings; this only ever runs when a visitor
// asks for it.
export function venuesMissingFromPicklist(
  viewings: readonly LoggedViewing[],
  picklist: readonly VenueEntry[],
): MissingVenue[] {
  const known = new Set(picklist.map((entry) => entry.name));
  const counts = new Map<string, number>();
  for (const viewing of viewings) {
    if (!viewing.venue || known.has(viewing.venue)) continue;
    counts.set(viewing.venue, (counts.get(viewing.venue) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}
