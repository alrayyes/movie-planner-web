// #600: the CLI never writes a medium property to CalDAV, so a
// CLI-logged viewing reaches this app with medium genuinely blank —
// there's no such thing as a viewing with no medium in practice, and it
// reads as "Cinema" (the CLI's own default for physical-screening
// imports) wherever it's shown. Presentation only, same as
// venueDisplay: a viewing's own stored `medium` value is never rewritten.
export function mediumDisplay(medium: string | undefined): string {
  return medium ? medium : CINEMA;
}

// #755: the one spelling of the default medium. The manual log form defaulted to
// "Cinema" and the Pathé booking path hardcoded "cinema", so one cinema split
// into two rows on the Mediums page. Both write this now.
export const CINEMA = "Cinema";

// A medium is the same medium whatever its casing or stray spaces, so the
// Mediums pages group and match on this. A viewing's stored value is never
// rewritten (mediumDisplay's rule above), which also keeps the calendars of
// everyone who already has "cinema" and "Cinema" in them intact.
export function mediumKey(medium: string | undefined): string {
  return mediumDisplay(medium).trim().toLowerCase();
}

export function sameMedium(a: string | undefined, b: string | undefined): boolean {
  return mediumKey(a) === mediumKey(b);
}

// #602: every place a viewing's own medium links out (the details
// page, same as every medium link on the Mediums overview) goes to the
// dedicated /medium page — results and pagination, no filter controls
// — same shape venueHref already gives venue.
export function mediumHref(medium: string): string {
  return `/medium?medium=${encodeURIComponent(medium)}`;
}
