import type { LoggedViewing, NewViewing, Picklists, VenueEntry } from "./types";

const PROD_ID = "-//movie-planner-web//EN";
export const SIDECAR_UID = "movie-planner-web-config";

// Only the NewViewing fields this generic loop can actually read/write as
// escaped TEXT — narrowed so TypeScript catches a future non-string field
// (like `geo`, which round-trips through its own native GEO property
// instead) added here by mistake, rather than surfacing as a cast error
// somewhere downstream.
type StringViewingField = {
  [K in keyof NewViewing]-?: NewViewing[K] extends string | undefined ? K : never;
}[keyof NewViewing];

// The custom X-properties a viewing's OMDb-enriched metadata rides in — all
// plain iCalendar RFC 5545 extensions (X- prefix), not a server-specific
// feature. See types.ts for the full field mapping.
const X_PROPERTIES: Record<string, StringViewingField> = {
  "X-MEDIUM": "medium",
  "X-DIRECTOR": "director",
  "X-ACTORS": "actors",
  "X-RATING-IMDB": "ratingImdb",
  "X-RATING-ROTTEN-TOMATOES": "ratingRottenTomatoes",
  "X-RATING-METACRITIC": "ratingMetacritic",
  "X-GENRE": "genre",
  "X-YEAR": "year",
  "X-POSTER-URL": "posterUrl",
  "X-IMDB-ID": "imdbId",
  "X-SYNOPSIS": "synopsis",
  "X-BOOKING-REF": "bookingRef",
  "X-ROW": "row",
  "X-SEAT": "seat",
  "X-LETTERBOXD-URL": "letterboxdUrl",
  "X-LETTERBOXD-RATING": "letterboxdRating",
  "X-NOTES": "notes",
  // #267: a recognized venue's city/country (alrayyes/movie-planner#217).
  "X-CITY": "city",
  "X-COUNTRY": "country",
  // #363: a venue's own verified street address, once known
  // (alrayyes/movie-planner#283).
  "X-STREET-ADDRESS": "streetAddress",
  "X-POSTAL-CODE": "postalCode",
  // #310: the rest of OMDb's response fields the CLI writes verbatim
  // (alrayyes/movie-planner#237).
  "X-RATED": "rated",
  "X-RUNTIME": "runtime",
  "X-MOVIE-LANGUAGE": "movieLanguage",
  "X-MOVIE-COUNTRY": "movieCountry",
  "X-METASCORE": "metascore",
  "X-IMDB-VOTES": "imdbVotes",
  "X-DVD": "dvd",
  "X-BOX-OFFICE": "boxOffice",
  "X-PRODUCTION": "production",
  "X-WEBSITE": "website",
  // #310: this app's own properties for the two new DESCRIPTION-only
  // fields (Released/Awards) — the CLI never writes these as X-*, but
  // once this app parses them via the DESCRIPTION fallback below and
  // saves an edit, they round-trip structurally from then on, same as
  // letterboxdUrl/notes already do.
  "X-RELEASED": "released",
  "X-AWARDS": "awards",
  // #310: the movie's own official trailer, from TMDb (alrayyes/movie-planner#236).
  "X-TRAILER-URL": "trailerUrl",
  // #432: cross-app write attribution for the diff-on-sync activity
  // log — client.ts's putViewing always forces this to "web" before
  // serializing, so it participates in this same generic read/write
  // loop like any other field, rather than needing a special case here.
  "X-LAST-MODIFIED-BY": "lastModifiedBy",
  // #360/#400: the rest of TMDb's own enrichment data.
  "X-COLLECTION": "collection",
  "X-CERTIFICATION": "certification",
  "X-KEYWORDS": "keywords",
  "X-BUDGET": "budget",
  "X-POPULARITY": "popularity",
};

function formatDateTimeUtc(iso: string): string {
  const date = new Date(iso);
  return date
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z/, "Z");
}

// #752: a viewing's DTSTART and DTEND are the wall-clock time at the cinema,
// written as RFC 5545 §3.3.5's floating form (no Z, no TZID), the same as the
// movie-planner CLI writes. Written as UTC, the CLI read a viewing logged at
// 00:30 in Amsterdam as the previous day at 23:30. DTSTAMP stays UTC, which the
// RFC requires.
function formatDateTimeFloating(iso: string): string {
  const date = new Date(iso);
  const two = (n: number) => String(n).padStart(2, "0");
  return (
    `${date.getFullYear()}${two(date.getMonth() + 1)}${two(date.getDate())}` +
    `T${two(date.getHours())}${two(date.getMinutes())}${two(date.getSeconds())}`
  );
}

// A trailing Z is the instant it names, which is what this app wrote before
// #752 and what other clients write. No Z is a floating time: the wall-clock
// time in the viewer's own zone, which is how the CLI and every calendar app
// read it. A TZID parameter isn't kept by the property parser, so that form is
// read as floating too.
function parseDateTimeUtc(value: string): string {
  const dateTime = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/.exec(value);
  if (dateTime) {
    const [, year, month, day, hour, minute, second, zulu] = dateTime;
    if (zulu) return `${year}-${month}-${day}T${hour}:${minute}:${second}.000Z`;
    return new Date(
      Number(year),
      Number(month) - 1,
      Number(day),
      Number(hour),
      Number(minute),
      Number(second),
    ).toISOString();
  }
  // #233: an all-day event's DTSTART/DTEND (RFC 5545 §3.3.4's DATE
  // value, not DATE-TIME — no "T", no time component at all) used to
  // fail this function's own regex, throw, and get silently swallowed
  // by parseViewingsFromMultistatus's own try/catch — a real calendar
  // entry vanishing from the app with zero indication. Many calendar
  // apps default to an all-day event unless a time is explicitly set,
  // so this is a real shape to expect, not just a spec technicality.
  // Treated as midnight UTC of that date — the simplest sensible
  // reading for a viewing that otherwise always carries a real time.
  const dateOnly = /^(\d{4})(\d{2})(\d{2})$/.exec(value);
  if (dateOnly) {
    const [, year, month, day] = dateOnly;
    return `${year}-${month}-${day}T00:00:00.000Z`;
  }
  throw new Error(`not a recognised iCalendar date-time: "${value}"`);
}

// RFC 5545 §3.3.11: comma, semicolon, backslash and newline are escaped in
// TEXT values.
function escapeText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n");
}

// One pass, left to right: undoing each escape in turn would read the second
// backslash of an escaped one as the start of the next, so `\\n` (a backslash
// and the letter n) came back as a newline (#779). RFC 5545 allows `\N` too.
function unescapeText(value: string): string {
  return value.replace(/\\([nN,;\\])/g, (_, escaped: string) =>
    escaped === "n" || escaped === "N" ? "\n" : escaped,
  );
}

// RFC 5545 §3.1: lines over 75 octets fold onto a continuation line starting
// with a single space.
function foldLine(line: string): string {
  const parts: string[] = [];
  let rest = line;
  while (rest.length > 75) {
    parts.push(rest.slice(0, 75));
    rest = rest.slice(75);
  }
  parts.push(rest);
  return parts.join("\r\n ");
}

function unfoldLines(raw: string): string[] {
  const physicalLines = raw.split(/\r\n|\n/);
  // Stryker disable next-line ArrayDeclaration: a stray first line sits ahead of every BEGIN, so nothing reads it.
  const logicalLines: string[] = [];
  for (const line of physicalLines) {
    // Stryker disable next-line ConditionalExpression,EqualityOperator: a continuation before any line has nothing to continue, and a line ahead of BEGIN is outside every block either way.
    if ((line.startsWith(" ") || line.startsWith("\t")) && logicalLines.length > 0) {
      logicalLines[logicalLines.length - 1] += line.slice(1);
    } else if (line.length > 0) {
      logicalLines.push(line);
    }
  }
  return logicalLines;
}

// The lines between a BEGIN and its END marker, or undefined when the block
// isn't there or is the wrong way round.
function blockLines(lines: string[], begin: string, end: string): string[] | undefined {
  const start = lines.indexOf(begin);
  const stop = lines.indexOf(end);
  // Stryker disable next-line EqualityOperator: the markers are different lines, so they only match when both are missing, and the first check catches that.
  if (start === -1 || stop < start) return undefined;
  return lines.slice(start + 1, stop);
}

// What a content line is called: the text before its ;PARAM or its colon,
// upper-cased.
function propertyName(line: string, colon: number): string {
  // Stryker disable next-line OptionalChaining: split always yields a first element.
  return (line.slice(0, colon).split(";")[0] as string).toUpperCase();
}

function property(name: string, value: string): string {
  return foldLine(`${name}:${escapeText(value)}`);
}

// RFC 5545 §3.8.1.6: GEO is a FLOAT pair (`lat;lon`), not a TEXT value —
// the semicolon here is a real value separator, not a delimiter TEXT's
// own escaping rules would apply to. Going through property()/escapeText
// would wrongly turn it into `52.3665062\;4.8947073`.
function geoProperty(geo: { lat: number; lon: number }): string {
  return foldLine(`GEO:${geo.lat};${geo.lon}`);
}

const GEO_RE = /^(-?\d+(?:\.\d+)?);(-?\d+(?:\.\d+)?)$/;

function parseGeo(value: string): { lat: number; lon: number } | undefined {
  const match = GEO_RE.exec(value);
  if (!match) return undefined;
  return { lat: Number(match[1]), lon: Number(match[2]) };
}

// #294: every property this app knows how to read or write — anything
// else found on an existing VEVENT (a future movie-planner extension
// this app hasn't caught up to yet) is preserved verbatim across an
// edit instead of being silently dropped. DESCRIPTION is deliberately
// excluded: this app never writes
// it, and any field it carries for a CLI-logged viewing already gets
// promoted onto this app's own X-* properties the moment it's parsed
// (parseVEventToViewing's own DESCRIPTION-fallback comment) — so a
// stale DESCRIPTION alongside freshly-written X-* properties would be
// redundant at best, not a second copy worth keeping.
const KNOWN_PROPERTIES = new Set([
  "UID",
  "DTSTAMP",
  "DTSTART",
  "DTEND",
  "SUMMARY",
  "LOCATION",
  "GEO",
  "DESCRIPTION",
  ...Object.keys(X_PROPERTIES),
]);

// #294: the raw (unfolded, still-escaped) lines of every VEVENT property
// this app doesn't itself read or write — passed through to
// serializeViewingToVEvent verbatim on an update so they survive an
// edit made through this app. Returns an empty array for a raw VEVENT
// this app can't parse the boundaries of at all, rather than throwing —
// best-effort preservation, not a hard requirement that could block a
// save outright.
export function extractUnknownProperties(raw: string): string[] {
  const block = blockLines(unfoldLines(raw), "BEGIN:VEVENT", "END:VEVENT");
  if (!block) return [];
  const result: string[] = [];
  for (const line of block) {
    const colon = line.indexOf(":");
    if (colon === -1) continue;
    const name = propertyName(line, colon);
    if (!name || KNOWN_PROPERTIES.has(name)) continue;
    result.push(line);
  }
  return result;
}

export function serializeViewingToVEvent(
  uid: string,
  viewing: NewViewing,
  extraLines: string[] = [],
): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    `PRODID:${PROD_ID}`,
    "BEGIN:VEVENT",
    property("UID", uid),
    property("DTSTAMP", formatDateTimeUtc(new Date().toISOString())),
    property("DTSTART", formatDateTimeFloating(viewing.start)),
    property("DTEND", formatDateTimeFloating(viewing.end)),
    property("SUMMARY", viewing.title),
  ];
  if (viewing.venue) lines.push(property("LOCATION", viewing.venue));
  if (viewing.geo) lines.push(geoProperty(viewing.geo));
  for (const [xProp, field] of Object.entries(X_PROPERTIES)) {
    const value = viewing[field];
    if (value) lines.push(property(xProp, value));
  }
  for (const line of extraLines) lines.push(foldLine(line));
  lines.push("END:VEVENT", "END:VCALENDAR");
  return lines.join("\r\n");
}

interface ParsedProperties {
  [name: string]: string;
}

function parseProperties(
  logicalLines: string[],
  beginMarker: string,
  endMarker: string,
): ParsedProperties {
  const block = blockLines(logicalLines, beginMarker, endMarker);
  if (!block) throw new Error(`no ${beginMarker}/${endMarker} block found`);
  const properties: ParsedProperties = {};
  for (const line of block) {
    const colon = line.indexOf(":");
    if (colon === -1) continue;
    // Any ;PARAM=value parameters before the colon are dropped — not used here.
    properties[propertyName(line, colon)] = unescapeText(line.slice(colon + 1));
  }
  return properties;
}

const IMDB_URL_RE = /https:\/\/www\.imdb\.com\/title\/(tt\d+)\/?/;

// #79: the movie-planner CLI (movie_planner/calendar_sync.py's
// build_vevent) writes ratings and links as plain DESCRIPTION lines
// rather than this app's own X-* properties — it never reads the
// calendar back, so it has no reason to know about those. This is the
// fallback that lets a CLI-logged viewing show its data here without a
// fresh, possibly-different OMDb lookup. Line shapes, straight from the
// CLI's own schema:
//   IMDb: {rating}                         — before the CLI's own
//                                             imdb_url field existed
//   IMDb: {rating} ({imdb_url})            — the current form
//   IMDb: {imdb_url}                       — rating not set
//   Rotten Tomatoes: {rating}
//   Metacritic: {rating}
//   Released: {released}                   — #310, OMDb's own full
//                                             release date, distinct
//                                             from X-YEAR
//   Plot: {plot}                           — #310, read into the same
//                                             `synopsis` field this
//                                             app's own X-SYNOPSIS uses
//   Awards: {awards}                       — #310
//   Letterboxd: {letterboxd_url}
//   Letterboxd: {letterboxd_url} ({letterboxd_rating})
//   Notes: {notes}
// A further unlabeled free-text line (Pathé screening details) exists in
// the CLI's format too, but this app has no field for it and doesn't
// attempt to parse it out — it's always last, after Notes, per
// docs/calendar-schema.md, so the label on Notes is what keeps the two
// from being confused when an entry carries both.
function parseDescriptionMetadata(
  description: string,
): Partial<
  Pick<
    LoggedViewing,
    | "ratingImdb"
    | "imdbId"
    | "ratingRottenTomatoes"
    | "ratingMetacritic"
    | "released"
    | "synopsis"
    | "awards"
    | "letterboxdUrl"
    | "letterboxdRating"
    | "notes"
  >
> {
  const result: ReturnType<typeof parseDescriptionMetadata> = {};
  for (const rawLine of description.split("\n")) {
    const line = rawLine.trim();

    const imdb = /^IMDb:\s*(.+)/.exec(line);
    if (imdb?.[1]) {
      const value = imdb[1];
      const urlMatch = IMDB_URL_RE.exec(value);
      if (urlMatch?.[1]) {
        result.imdbId = urlMatch[1];
        const rating = value
          .slice(0, urlMatch.index)
          .replace(/\(\s*$/, "")
          .trim();
        if (rating) result.ratingImdb = rating;
      } else {
        result.ratingImdb = value;
      }
      continue;
    }

    const rt = /^Rotten Tomatoes:\s*(.+)/.exec(line);
    if (rt?.[1]) {
      result.ratingRottenTomatoes = rt[1];
      continue;
    }

    const metacritic = /^Metacritic:\s*(.+)/.exec(line);
    if (metacritic?.[1]) {
      result.ratingMetacritic = metacritic[1];
      continue;
    }

    const released = /^Released:\s*(.+)/.exec(line);
    if (released?.[1]) {
      result.released = released[1];
      continue;
    }

    const plot = /^Plot:\s*(.+)/.exec(line);
    if (plot?.[1]) {
      result.synopsis = plot[1];
      continue;
    }

    const awards = /^Awards:\s*(.+)/.exec(line);
    if (awards?.[1]) {
      result.awards = awards[1];
      continue;
    }

    const letterboxd = /^Letterboxd:\s*(\S+)(?:\s+\((.+)\))?$/.exec(line);
    if (letterboxd?.[1]) {
      result.letterboxdUrl = letterboxd[1];
      if (letterboxd[2]) result.letterboxdRating = letterboxd[2];
      continue;
    }

    const notes = /^Notes:\s*(.+)/.exec(line);
    if (notes?.[1]) {
      result.notes = notes[1];
    }
  }
  return result;
}

export function parseVEventToViewing(raw: string): LoggedViewing {
  const properties = parseProperties(unfoldLines(raw), "BEGIN:VEVENT", "END:VEVENT");
  const uid = properties.UID;
  const title = properties.SUMMARY;
  const start = properties.DTSTART;
  if (!uid || !title || !start) {
    throw new Error("VEVENT is missing UID, SUMMARY or DTSTART");
  }
  // #278: movie-planner's own calendar-schema.md documents three real
  // DTSTART/DTEND shapes, not two — a date-only all-day event (no
  // DTEND, handled by parseDateTimeUtc's own DATE-value fallback
  // below), and a date-plus-start-time entry with no end time either
  // (also no DTEND at all, but a real DATE-TIME DTSTART). Requiring
  // DTEND unconditionally used to throw on that second shape, silently
  // dropping the entry via parseViewingsFromMultistatus's own
  // per-resource catch — a real, reproducible cause of the frontend
  // undercounting a visitor's actual calendar. Defaulting the missing
  // end to the start time matches this app's own write path
  // (LogViewingForm.svelte's identical "missing end time defaults to
  // start" rule for a manually-logged entry).
  const end = properties.DTEND ?? start;

  const viewing: LoggedViewing = {
    uid,
    title,
    start: parseDateTimeUtc(start),
    end: parseDateTimeUtc(end),
    medium: "",
  };
  if (properties.LOCATION) viewing.venue = properties.LOCATION;
  // Stryker disable next-line ConditionalExpression: parseGeo(undefined) is undefined too.
  if (properties.GEO) {
    const geo = parseGeo(properties.GEO);
    if (geo) viewing.geo = geo;
  }
  for (const [xProp, field] of Object.entries(X_PROPERTIES)) {
    const value = properties[xProp];
    if (value) viewing[field] = value;
  }
  // #79: a fallback, not an override — this app's own X-* properties
  // (set above) always win when present.
  if (properties.DESCRIPTION) {
    const fromDescription = parseDescriptionMetadata(properties.DESCRIPTION);
    for (const [field, value] of Object.entries(fromDescription)) {
      const key = field as keyof typeof fromDescription;
      if (viewing[key] === undefined) {
        viewing[key] = value;
      }
    }
  }
  return viewing;
}

// A CalDAV REPORT multistatus response carries one <C:calendar-data> per
// matched resource, each holding a full VCALENDAR blob. XML parsing here is
// deliberately minimal — a regex extraction, not a full XML parser — since
// the only thing pulled out is the escaped text content of a known element.
export function parseViewingsFromMultistatus(xml: string): LoggedViewing[] {
  const viewings: LoggedViewing[] = [];
  const pattern = /<[^:>]*:?calendar-data[^>]*>([\s\S]*?)<\/[^:>]*:?calendar-data>/g;
  for (const match of xml.matchAll(pattern)) {
    const calendarData = decodeXmlEntities(match[1] as string);
    try {
      viewings.push(parseVEventToViewing(calendarData));
    } catch {
      // A resource that isn't a well-formed VEVENT (the sidecar VJOURNAL
      // living in the same collection, most likely) is skipped rather than
      // failing the whole listing.
    }
  }
  return viewings;
}

function decodeXmlEntities(value: string): string {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

export function serializePicklistsToVJournal(picklists: Picklists): string {
  const description = JSON.stringify(picklists);
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    `PRODID:${PROD_ID}`,
    "BEGIN:VJOURNAL",
    property("UID", SIDECAR_UID),
    property("DTSTAMP", formatDateTimeUtc(new Date().toISOString())),
    property("SUMMARY", "movie-planner-web configuration — do not edit directly"),
    property("DESCRIPTION", description),
    "END:VJOURNAL",
    "END:VCALENDAR",
  ];
  return lines.join("\r\n");
}

const EMPTY_PICKLISTS: Picklists = { media: [], venues: [] };

// #452: a sidecar written before this app's Picklists.venues grew from
// `string[]` to structured VenueEntry objects still parses — a bare
// string is treated as `{name: value}` (no other fields), same as
// design.md's own "no rigid format to migrate" call. An entry that's
// neither a string nor an object with a string `name` (hand-edited
// corruption, most likely) is dropped rather than surfacing a broken
// half-entry.
export function normalizeVenueEntry(entry: unknown): VenueEntry | undefined {
  if (typeof entry === "string") return entry ? { name: entry } : undefined;
  if (
    typeof entry === "object" &&
    entry !== null &&
    typeof (entry as { name?: unknown }).name === "string" &&
    (entry as { name: string }).name
  ) {
    return entry as VenueEntry;
  }
  return undefined;
}

// location-management spec, "Missing or unparsable sidecar degrades
// gracefully": never throws, falls back to empty picklists.
export function parsePicklistsFromVJournal(raw: string | null): Picklists {
  if (!raw) return EMPTY_PICKLISTS;
  try {
    const properties = parseProperties(unfoldLines(raw), "BEGIN:VJOURNAL", "END:VJOURNAL");
    const parsed: unknown = JSON.parse(properties.DESCRIPTION as string);
    // JSON of any other shape (null, a number, media or venues that aren't
    // arrays) throws on the property read, `.filter` or `.map` below, and the
    // catch turns that into the same empty picklists.
    const media = (parsed as { media: unknown[] }).media.filter(
      (value): value is string => typeof value === "string",
    );
    const venues = (parsed as { venues: unknown[] }).venues
      .map(normalizeVenueEntry)
      .filter((entry): entry is VenueEntry => entry !== undefined);
    return { media, venues };
  } catch {
    return EMPTY_PICKLISTS;
  }
}
