import type { LoggedViewing } from "../caldav/types";
import { splitMultiValue } from "../omdb/multi-value";

// #450: director/actor/genre/movie-country/movie-language share one
// shape — a comma-separated, OMDb-derived field (splitMultiValue already
// individuates director/actor/genre for their details-page chips; movie
// country/language get the same split here for the first time, fixing
// the bug where "United Kingdom, France" linked as one whole string) —
// each with its own listing page (every distinct value + a count of
// logged viewings, analogous to /venues) and its own filter-free
// per-value page (analogous to /venue, #448). One config table plus two
// generic components (AttributeOverview.svelte/AttributeDetail.svelte)
// covers all five, rather than five hand-duplicated page pairs.
//
// Deliberately NOT generalized together with venue's own pattern: venue
// is single-valued (no splitMultiValue), carries a picklist union, geo/
// map and city+country grouping none of these five need — forcing a
// shared shape would either bloat these five with unused venue concerns
// or strip venue of ones it actually uses. See movie-planner-web#450.
export type AttributeKind = "director" | "actor" | "genre" | "movieCountry" | "movieLanguage";

export interface AttributeConfig {
  readonly kind: AttributeKind;
  // The query-string key a value is carried under — the exact same key
  // CalendarOverview.svelte's own filter (and ActiveFilterValues) already
  // uses for this field, so a chip/listing link and the overview's own
  // filter field agree on one vocabulary rather than inventing a second.
  readonly paramName: AttributeKind;
  // Which raw LoggedViewing field this value is split out of.
  readonly field: "director" | "actors" | "genre" | "movieCountry" | "movieLanguage";
  readonly listingPath: string;
  readonly detailPath: string;
  // Plural, capitalized — the listing page's <h1>, and (combined with a
  // live value) the breadcrumb: "Home / Directors / Denis Villeneuve".
  readonly plural: string;
  // Singular, capitalized — the listing table's own column header, and
  // the detail page's fallback heading when its value is unmatched/blank
  // (mirrors VenueOverview.svelte's own `trimmedVenue || "Venue"`).
  readonly singular: string;
}

export const ATTRIBUTES: Record<AttributeKind, AttributeConfig> = {
  director: {
    kind: "director",
    paramName: "director",
    field: "director",
    listingPath: "/directors",
    detailPath: "/director",
    plural: "Directors",
    singular: "Director",
  },
  actor: {
    kind: "actor",
    paramName: "actor",
    field: "actors",
    listingPath: "/actors",
    detailPath: "/actor",
    plural: "Actors",
    singular: "Actor",
  },
  genre: {
    kind: "genre",
    paramName: "genre",
    field: "genre",
    listingPath: "/genres",
    detailPath: "/genre",
    plural: "Genres",
    singular: "Genre",
  },
  movieCountry: {
    kind: "movieCountry",
    paramName: "movieCountry",
    field: "movieCountry",
    listingPath: "/movie-countries",
    detailPath: "/movie-country",
    plural: "Movie countries",
    singular: "Movie country",
  },
  movieLanguage: {
    kind: "movieLanguage",
    paramName: "movieLanguage",
    field: "movieLanguage",
    listingPath: "/movie-languages",
    detailPath: "/movie-language",
    plural: "Movie languages",
    singular: "Movie language",
  },
};

export const ATTRIBUTE_KINDS = Object.keys(ATTRIBUTES) as AttributeKind[];

// Every individual value a viewing carries for this attribute — a
// viewing with "United Kingdom, France" for movieCountry counts, and
// matches, against each of "United Kingdom" and "France" separately.
export function attributeValues(viewing: LoggedViewing, kind: AttributeKind): string[] {
  return splitMultiValue(viewing[ATTRIBUTES[kind].field]);
}

// Shared by a details-page chip (ChipList.svelte) and a listing page's
// own per-value link, so the two can never drift onto different URLs
// for the same value.
export function attributeHref(kind: AttributeKind, value: string): string {
  const config = ATTRIBUTES[kind];
  return `${config.detailPath}?${config.paramName}=${encodeURIComponent(value)}`;
}
