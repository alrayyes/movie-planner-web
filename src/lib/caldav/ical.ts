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
  "X-BOOKING-REF": "bookingRef",
};

function formatDateTimeUtc(iso: string): string {
  const date = new Date(iso);
  return date
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");
}

function parseDateTimeUtc(value: string): string {
  const match = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z?$/.exec(value);
  if (!match) {
    throw new Error(`not a recognised iCalendar date-time: "${value}"`);
  }
  const [, year, month, day, hour, minute, second] = match;
  return `${year}-${month}-${day}T${hour}:${minute}:${second}.000Z`;
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
