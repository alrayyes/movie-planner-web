import type { LoggedViewing, VenueEntry } from "../caldav/types";

export interface MissingVenue extends Omit<VenueEntry, "name"> {
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
//
// #657: also carries over whatever city/country/address/geo a matching
// viewing already has — not a reopening of #339's rejected "always scan
// viewings for a venue's location" model (types.ts's own VenueEntry
// comment), since this only ever runs on this same explicit,
// visitor-triggered promotion, once, to seed the new picklist entry.
// From then on the picklist entry itself is the canonical source again,
// same as any other venue. Without this, a venue promoted straight from
// history stayed a bare {name} forever, even when its exact name already
// had known coordinates on another (typically CLI-imported) viewing —
// confirmed against a real report where this silently dropped the
// per-venue map for anything picked this way.
export function venuesMissingFromPicklist(
  viewings: readonly LoggedViewing[],
  picklist: readonly VenueEntry[],
): MissingVenue[] {
  const known = new Set(picklist.map((entry) => entry.name));
  const counts = new Map<string, number>();
  const structured = new Map<string, Omit<VenueEntry, "name">>();
  for (const viewing of viewings) {
    if (!viewing.venue || known.has(viewing.venue)) continue;
    counts.set(viewing.venue, (counts.get(viewing.venue) ?? 0) + 1);
    const existing = structured.get(viewing.venue) ?? {};
    structured.set(viewing.venue, {
      streetAddress: existing.streetAddress ?? viewing.streetAddress,
      postalCode: existing.postalCode ?? viewing.postalCode,
      city: existing.city ?? viewing.city,
      country: existing.country ?? viewing.country,
      geo: existing.geo ?? viewing.geo,
    });
  }
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count, ...structured.get(name) }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}
