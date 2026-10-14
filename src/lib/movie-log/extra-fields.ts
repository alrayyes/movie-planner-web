import type { LoggedViewing } from "../caldav/types";

// #871: the plain-text fields the export carries beyond the ones the import has
// always read by hand: OMDb's extras (#310), a seated booking's row and seat,
// and the synopsis. File name on the left, LoggedViewing field on the right.
// lastModifiedBy is left out on purpose: it's who last saved the event, and the
// app stamps it itself.
export const EXTRA_FIELDS = {
  synopsis: "synopsis",
  row: "row",
  seat: "seat",
  rated: "rated",
  runtime: "runtime",
  movie_language: "movieLanguage",
  movie_country: "movieCountry",
  metascore: "metascore",
  imdb_votes: "imdbVotes",
  dvd: "dvd",
  box_office: "boxOffice",
  production: "production",
  website: "website",
  released: "released",
  awards: "awards",
  trailer_url: "trailerUrl",
  collection: "collection",
  certification: "certification",
  keywords: "keywords",
  budget: "budget",
  popularity: "popularity",
} as const satisfies Record<string, keyof LoggedViewing>;

export type ExtraField = (typeof EXTRA_FIELDS)[keyof typeof EXTRA_FIELDS];

// A value off a file row, for each extra field it actually has as text.
export function readExtraFields(raw: Record<string, unknown>): Partial<Record<ExtraField, string>> {
  const found: Partial<Record<ExtraField, string>> = {};
  for (const [name, field] of Object.entries(EXTRA_FIELDS)) {
    const value = raw[name];
    if (typeof value === "string" && value) found[field] = value;
  }
  return found;
}

// The same, off a viewing, keyed by file name, for the export.
export function writeExtraFields(viewing: LoggedViewing): Record<string, string | undefined> {
  return Object.fromEntries(
    Object.entries(EXTRA_FIELDS).map(([name, field]) => [name, viewing[field]]),
  );
}
