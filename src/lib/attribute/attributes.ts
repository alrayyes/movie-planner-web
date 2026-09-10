import type { LoggedViewing } from "../caldav/types";
import { splitMultiValue } from "../omdb/multi-value";
import { parseReleasedDate } from "../omdb/released-date";

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
// #535: rated and keyword join the same table as a sixth/seventh kind —
// rated is single-valued (an MPAA rating never contains a comma), but
// splitMultiValue already returns a single-element array for a
// comma-free string, so it needs nothing beyond a `field` entry, the
// same as any of the original five. Released year/month are different:
// neither is a raw LoggedViewing field at all, just something computed
// from `viewing.released` via parseReleasedDate. `field` alone can't
// express that, so AttributeConfig gained a second, mutually exclusive
// way to say how a viewing's values are found — `extract`, a function
// straight from the viewing to its values — rather than forcing a fake
// field name onto something that was never stored as one.
//
// Deliberately NOT generalized together with venue's own pattern: venue
// is single-valued (no splitMultiValue), carries a picklist union, geo/
// map and city+country grouping none of these nine need — forcing a
// shared shape would either bloat these nine with unused venue concerns
// or strip venue of ones it actually uses. See movie-planner-web#450.
export type AttributeKind =
  | "director"
  | "actor"
  | "genre"
  | "movieCountry"
  | "movieLanguage"
  | "rated"
  | "keyword"
  | "releasedYear"
  | "releasedMonth";

type SplitField =
  | "director"
  | "actors"
  | "genre"
  | "movieCountry"
  | "movieLanguage"
  | "rated"
  | "keywords";

export interface AttributeConfig {
  readonly kind: AttributeKind;
  // The query-string key a value is carried under — the exact same key
  // CalendarOverview.svelte's own filter (and ActiveFilterValues) already
  // uses for this field, so a chip/listing link and the overview's own
  // filter field agree on one vocabulary rather than inventing a second.
  readonly paramName: AttributeKind;
  // Which raw LoggedViewing field this value is split out of (via
  // splitMultiValue). Mutually exclusive with `extract` below — every
  // kind sets exactly one of the two.
  readonly field?: SplitField;
  // #535: for a value that isn't a stored field at all — Released Year/
  // Month, computed from `viewing.released` — a function straight from
  // the viewing to its values, in place of `field`.
  readonly extract?: (viewing: LoggedViewing) => string[];
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

// #535: Released Year/Month are computed straight from `viewing.released`
// rather than read off a stored field, so they need their own extractor
// instead of a bare `field` name — see the AttributeConfig.extract
// comment above. A viewing has at most one released date, so each
// returns zero or one values, never a comma-split list.
function releasedYearValues(viewing: LoggedViewing): string[] {
  if (!viewing.released) return [];
  const parsed = parseReleasedDate(viewing.released);
  return parsed ? [parsed.year] : [];
}

// #535: kept as the same "YYYY-MM" shape the overview's own
// `<input type="month">` filter already used for this granularity
// (CalendarOverview.svelte) — unambiguous across years (two different
// Januaries a year apart must not collide), unlike a bare month name.
function releasedMonthValues(viewing: LoggedViewing): string[] {
  if (!viewing.released) return [];
  const parsed = parseReleasedDate(viewing.released);
  return parsed ? [parsed.month] : [];
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
  // #535: single-valued like venue rather than comma-split like the five
  // above it — but an MPAA rating never contains a comma, so
  // splitMultiValue already returns it as a single-element array with no
  // change needed to attributeValues itself. `/rated` (not `/ratings`)
  // for the listing page, matching the field's own name and the movie
  // details page's "Rated" label; the detail page gets the distinct
  // `/rating` path so the two don't collide.
  rated: {
    kind: "rated",
    paramName: "rated",
    field: "rated",
    listingPath: "/rated",
    detailPath: "/rating",
    plural: "Ratings",
    singular: "Rating",
  },
  // #535: a natural sixth splitMultiValue-based kind — keywords were
  // already comma-split for MovieDetails.svelte's own badge rendering
  // (keywordChips), just not yet linked anywhere.
  keyword: {
    kind: "keyword",
    paramName: "keyword",
    field: "keywords",
    listingPath: "/keywords",
    detailPath: "/keyword",
    plural: "Keywords",
    singular: "Keyword",
  },
  releasedYear: {
    kind: "releasedYear",
    paramName: "releasedYear",
    extract: releasedYearValues,
    listingPath: "/released-years",
    detailPath: "/released-year",
    plural: "Released years",
    singular: "Released year",
  },
  releasedMonth: {
    kind: "releasedMonth",
    paramName: "releasedMonth",
    extract: releasedMonthValues,
    listingPath: "/released-months",
    detailPath: "/released-month",
    plural: "Released months",
    singular: "Released month",
  },
};

export const ATTRIBUTE_KINDS = Object.keys(ATTRIBUTES) as AttributeKind[];

// Every individual value a viewing carries for this attribute — a
// viewing with "United Kingdom, France" for movieCountry counts, and
// matches, against each of "United Kingdom" and "France" separately.
export function attributeValues(viewing: LoggedViewing, kind: AttributeKind): string[] {
  const config = ATTRIBUTES[kind];
  if (config.extract) return config.extract(viewing);
  return splitMultiValue(config.field ? viewing[config.field] : undefined);
}

// Shared by a details-page chip (ChipList.svelte) and a listing page's
// own per-value link, so the two can never drift onto different URLs
// for the same value.
export function attributeHref(kind: AttributeKind, value: string): string {
  const config = ATTRIBUTES[kind];
  return `${config.detailPath}?${config.paramName}=${encodeURIComponent(value)}`;
}
