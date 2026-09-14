// #600: the CLI never writes a medium property to CalDAV, so a
// CLI-logged viewing reaches this app with medium genuinely blank —
// there's no such thing as a viewing with no medium in practice, and it
// reads as "Cinema" (the CLI's own default for physical-screening
// imports) wherever it's shown. Presentation only, same as
// venueDisplay: a viewing's own stored `medium` value is never rewritten.
export function mediumDisplay(medium: string | undefined): string {
  return medium ? medium : "Cinema";
}

// #602: every place a viewing's own medium links out (the details
// page, same as every medium link on the Mediums overview) goes to the
// dedicated /medium page — results and pagination, no filter controls
// — same shape venueHref already gives venue.
export function mediumHref(medium: string): string {
  return `/medium?medium=${encodeURIComponent(medium)}`;
}
