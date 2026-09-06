import type { LoggedViewing } from "../caldav/types";

// #8/#203: a venue already has coordinates once any earlier viewing at
// it carried a `geo` — scanning viewings already loaded in the current
// context (the log form's own recent-viewings context, or the movie
// details page's picklist context) answers "does this venue already
// have coordinates" without a dedicated venue->geo index to keep in
// sync with what CalDAV actually holds (design.md's own rejected
// alternative). First match wins when more than one viewing at the
// same venue disagrees — not merged or averaged, just documented as
// such.
export function findKnownGeo(
  venue: string,
  viewings: readonly LoggedViewing[],
): { lat: number; lon: number } | undefined {
  return viewings.find((viewing) => viewing.venue === venue && viewing.geo)?.geo;
}
