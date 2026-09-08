// Shared between the page <title> (#376) and the breadcrumb (#375): both
// need the same human-readable label for whichever single filter a chip
// link (director/venue/city/etc., #374's "clear the rest" design) put the
// visitor here with. Deliberately independent of CalendarOverview.svelte's
// own StoredFilterKey — it covers only the fields a chip link can set, not
// every filter field (from/to/title aren't chip-driven).
export interface ActiveFilterValues {
  medium?: string;
  venue?: string;
  director?: string;
  actor?: string;
  genre?: string;
  city?: string;
  country?: string;
  movieCountry?: string;
  movieLanguage?: string;
  rated?: string;
  releasedYear?: string;
  releasedMonth?: string;
  releasedDate?: string;
}

// null means "reads fine on its own" — a country name doesn't need
// "(country)" tacked on the way a bare person's name or venue name does.
const FILTER_QUALIFIERS: Record<keyof ActiveFilterValues, string | null> = {
  medium: "medium",
  venue: "venue",
  director: "director",
  actor: "actor",
  genre: "genre",
  city: "city",
  country: null,
  movieCountry: "movie country",
  movieLanguage: "movie language",
  rated: "rated",
  releasedYear: "release year",
  releasedMonth: "release month",
  releasedDate: "release date",
};

const FILTER_KEYS = Object.keys(FILTER_QUALIFIERS) as (keyof ActiveFilterValues)[];

export function activeFilterLabel(values: ActiveFilterValues): string | null {
  const active = FILTER_KEYS.filter((key) => values[key]);
  if (active.length !== 1) return null;

  const key = active[0] as keyof ActiveFilterValues;
  const value = values[key] as string;
  const qualifier = FILTER_QUALIFIERS[key];
  return qualifier ? `${value} (${qualifier})` : value;
}
