// #440: at least "Cinecenter", "De Munt", and a venue named "City" have a
// full street address baked directly into the raw venue/LOCATION field
// itself (movie-planner#331, a CLI-side data issue) — this is the one
// place that trims a venue down to what a visitor should actually read,
// shared by every read-only render site (movie details, the overview
// table and its mobile under-title text, the heatmap tooltip, and the
// shared-viewing page), so a data-quality fix upstream (or its absence)
// never has to be handled in four different components. Presentation
// only: venue identity, matching, filtering, links and counting all keep
// using the full raw `venue` value untouched.
//
// Trims to whatever precedes the first comma — simple, not a smart
// address parser, matching the observed failure pattern (clean name
// first, address second). A venue with no comma is left unchanged. The
// city, when known, comes from the separately-stored `city` field
// (never parsed out of the trimmed remainder) and country is never
// appended, same reasoning already applied to the overview's City
// filter.
export function venueDisplay(venue: string | undefined, city?: string): string {
  if (!venue) return "";
  const name = venue.split(",")[0].trim();
  return city ? `${name}, ${city}` : name;
}

// #529: every place a viewing's own venue links out (the details page,
// same as every venue link on the Venues overview and per-venue page
// itself) goes to the dedicated /venue page — results, pagination, and
// that venue's own map, no filter controls — rather than the main
// overview pre-filtered to it, so a visitor gets the same destination no
// matter which venue link they clicked.
export function venueHref(venue: string): string {
  return `/venue?venue=${encodeURIComponent(venue)}`;
}
