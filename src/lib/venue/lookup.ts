import type { VenueEntry } from "../caldav/types";

// #452: a venue's own picklist entry is the canonical source for its
// structured data now — a plain exact-name lookup, replacing the old
// findKnownGeo scan-prior-viewings model (geo/reuse.ts, removed by this
// same change) that used to answer "does this venue already have
// coordinates" by scanning `allViewings` instead of reading the
// picklist entry a visitor selected or added directly.
export function findVenueEntry(
  name: string,
  venues: readonly VenueEntry[],
): VenueEntry | undefined {
  return venues.find((entry) => entry.name === name);
}
