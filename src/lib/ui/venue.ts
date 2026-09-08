// #382: the overview's Venue column shows the venue's own known
// city/country (#267) alongside its name, e.g. "De Munt, Amsterdam,
// Netherlands" — a venue with neither known just shows its plain name,
// same as before this existed.
export function venueLabel(
  venue: string | undefined,
  city: string | undefined,
  country: string | undefined,
): string {
  if (!venue) return "";
  return [venue, city, country].filter(Boolean).join(", ");
}
