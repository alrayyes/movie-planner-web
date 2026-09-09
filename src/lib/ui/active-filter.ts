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
  movieCountry?: string;
  movieLanguage?: string;
  rated?: string;
  releasedYear?: string;
  releasedMonth?: string;
}

// #437: the venue's own Country filter (previously the one qualifier-
// less key here) was removed outright — City now matches on city name
// alone, so every remaining key gets its own qualifier.
const FILTER_QUALIFIERS: Record<keyof ActiveFilterValues, string | null> = {
  medium: "medium",
  venue: "venue",
  director: "director",
  actor: "actor",
  genre: "genre",
  city: "city",
  movieCountry: "movie country",
  movieLanguage: "movie language",
  rated: "rated",
  releasedYear: "release year",
  releasedMonth: "release month",
};

// Exported so a caller building `values` from something other than
// component state (site-breadcrumb.ts reading raw URLSearchParams, on
// first paint before CalendarOverview.svelte's own island has mounted
// and broadcast a live value) can do it generically, without repeating
// this same key list a second time.
export const FILTER_KEYS = Object.keys(FILTER_QUALIFIERS) as (keyof ActiveFilterValues)[];

// #375: CalendarOverview.svelte broadcasts its own live activeFilterLabel
// on this event whenever it changes — including a visitor typing
// directly into a filter field, not just the initial URL a chip link
// loaded with — so site-breadcrumb.ts (a plain custom element, not a
// Svelte island, so it can't read CalendarOverview's own reactive state
// directly) can stay in sync without re-deriving the same filter logic
// from the URL a second time.
export const ACTIVE_FILTER_LABEL_EVENT = "movie-planner-web-active-filter-label";

export function activeFilterLabel(values: ActiveFilterValues): string | null {
  const active = FILTER_KEYS.filter((key) => values[key]);
  if (active.length !== 1) return null;

  const key = active[0] as keyof ActiveFilterValues;
  const value = values[key] as string;
  const qualifier = FILTER_QUALIFIERS[key];
  return qualifier ? `${value} (${qualifier})` : value;
}
