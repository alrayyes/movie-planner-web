import type { LoggedViewing, NewViewing, Picklists } from "./types";

const PROD_ID = "-//movie-planner-web//EN";
export const SIDECAR_UID = "movie-planner-web-config";

// The custom X-properties a viewing's OMDb-enriched metadata rides in — all
// plain iCalendar RFC 5545 extensions (X- prefix), not a server-specific
// feature. See types.ts for the full field mapping.
const X_PROPERTIES: Record<string, keyof NewViewing> = {
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
  "X-LETTERBOXD-URL": "letterboxdUrl",
  "X-LETTERBOXD-RATING": "letterboxdRating",
  "X-NOTES": "notes",
};

function formatDateTimeUtc(iso: string): string {
  const date = new Date(iso);
  return date
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");
}

function parseDateTimeUtc(value: string): string {
  const dateTime = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z?$/.exec(value);
  if (dateTime) {
    const [, year, month, day, hour, minute, second] = dateTime;
    return `${year}-${month}-${day}T${hour}:${minute}:${second}.000Z`;
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

function unescapeText(value: string): string {
  return value
    .replace(/\\n/g, "\n")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\\\\/g, "\\");
}

// RFC 5545 §3.1: lines over 75 octets fold onto a continuation line starting
// with a single space.
function foldLine(line: string): string {
  if (line.length <= 75) return line;
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
  const logicalLines: string[] = [];
  for (const line of physicalLines) {
    if ((line.startsWith(" ") || line.startsWith("\t")) && logicalLines.length > 0) {
      logicalLines[logicalLines.length - 1] += line.slice(1);
    } else if (line.length > 0) {
      logicalLines.push(line);
    }
  }
  return logicalLines;
}

function property(name: string, value: string): string {
  return foldLine(`${name}:${escapeText(value)}`);
}

export function serializeViewingToVEvent(uid: string, viewing: NewViewing): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    `PRODID:${PROD_ID}`,
    "BEGIN:VEVENT",
    property("UID", uid),
    property("DTSTAMP", formatDateTimeUtc(new Date().toISOString())),
    property("DTSTART", formatDateTimeUtc(viewing.start)),
    property("DTEND", formatDateTimeUtc(viewing.end)),
    property("SUMMARY", viewing.title),
  ];
  if (viewing.venue) lines.push(property("LOCATION", viewing.venue));
  for (const [xProp, field] of Object.entries(X_PROPERTIES)) {
    const value = viewing[field];
    if (value) lines.push(property(xProp, value));
  }
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
  const start = logicalLines.indexOf(beginMarker);
  const end = logicalLines.indexOf(endMarker);
  if (start === -1 || end === -1 || end < start) {
    throw new Error(`no ${beginMarker}/${endMarker} block found`);
  }
  const properties: ParsedProperties = {};
  for (const line of logicalLines.slice(start + 1, end)) {
    const colon = line.indexOf(":");
    if (colon === -1) continue;
    // Drop any ;PARAM=value parameters before the colon — not used here.
    const name = line.slice(0, colon).split(";")[0]?.toUpperCase();
    if (!name) continue;
    properties[name] = unescapeText(line.slice(colon + 1));
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
//   Letterboxd: {letterboxd_url}
//   Letterboxd: {letterboxd_url} ({letterboxd_rating})
//   Notes: {notes}
// A sixth, unlabeled free-text line (Pathé screening details) exists in
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
    | "letterboxdUrl"
    | "letterboxdRating"
    | "notes"
  >
> {
  const result: ReturnType<typeof parseDescriptionMetadata> = {};
  for (const rawLine of description.split("\n")) {
    const line = rawLine.trim();

    const imdb = /^IMDb:\s*(.+)$/.exec(line);
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

    const rt = /^Rotten Tomatoes:\s*(.+)$/.exec(line);
    if (rt?.[1]) {
      result.ratingRottenTomatoes = rt[1];
      continue;
    }

    const metacritic = /^Metacritic:\s*(.+)$/.exec(line);
    if (metacritic?.[1]) {
      result.ratingMetacritic = metacritic[1];
      continue;
    }

    const letterboxd = /^Letterboxd:\s*(\S+)(?:\s+\((.+)\))?$/.exec(line);
    if (letterboxd?.[1]) {
      result.letterboxdUrl = letterboxd[1];
      if (letterboxd[2]) result.letterboxdRating = letterboxd[2];
      continue;
    }

    const notes = /^Notes:\s*(.+)$/.exec(line);
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
  const end = properties.DTEND;
  if (!uid || !title || !start || !end) {
    throw new Error("VEVENT is missing UID, SUMMARY, DTSTART or DTEND");
  }

  const viewing: LoggedViewing = {
    uid,
    title,
    start: parseDateTimeUtc(start),
    end: parseDateTimeUtc(end),
    medium: properties["X-MEDIUM"] ?? "",
  };
  if (properties.LOCATION) viewing.venue = properties.LOCATION;
  for (const [xProp, field] of Object.entries(X_PROPERTIES)) {
    if (field === "medium") continue;
    const value = properties[xProp];
    if (value) viewing[field] = value;
  }
  // #79: a fallback, not an override — this app's own X-* properties
  // (set above) always win when present.
  if (properties.DESCRIPTION) {
    const fromDescription = parseDescriptionMetadata(properties.DESCRIPTION);
    for (const [field, value] of Object.entries(fromDescription)) {
      const key = field as keyof typeof fromDescription;
      if (viewing[key] === undefined && value !== undefined) {
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
    const calendarData = decodeXmlEntities(match[1] ?? "");
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

// location-management spec, "Missing or unparsable sidecar degrades
// gracefully": never throws, falls back to empty picklists.
export function parsePicklistsFromVJournal(raw: string | null): Picklists {
  if (!raw) return EMPTY_PICKLISTS;
  try {
    const properties = parseProperties(unfoldLines(raw), "BEGIN:VJOURNAL", "END:VJOURNAL");
    const parsed: unknown = JSON.parse(properties.DESCRIPTION ?? "");
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      Array.isArray((parsed as Picklists).media) &&
      Array.isArray((parsed as Picklists).venues)
    ) {
      return parsed as Picklists;
    }
    return EMPTY_PICKLISTS;
  } catch {
    return EMPTY_PICKLISTS;
  }
}
