// Ported from movie-planner's own src/movie_planner/importers.py — same
// required/optional fields (examples/README.md: "title, date, medium are
// required; start_time, end_time, venue, imdb_url are optional"), same
// per-row error isolation so one bad row doesn't fail the whole import.
//
// #69: also accepts the OMDb-derived fields this app's own "Export as
// JSON" produces, using the CLI's own canonical snake_case field names
// (director, actors, genre, release_year, poster_url, imdb_rating,
// rotten_tomatoes_rating, metacritic_rating, booking_ref, letterboxd_url,
// letterboxd_rating, notes — confirmed directly with a peer session
// working on movie-planner, movie_planner/omdb.py as of their #88) so a
// file either side produces needs no translation layer to read on the
// other. See public/schemas/movie-viewings.schema.json for the full
// shape.
import { localDateAndTime } from "./export-viewings";

export interface ImportRow {
  title: string;
  date: string; // YYYY-MM-DD
  medium: string;
  startTime?: string; // HH:MM
  endTime?: string; // HH:MM
  venue?: string;
  imdbUrl?: string;
  // Present only when this app's own "Export as JSON" wrote it — what
  // lets run-import.ts's planUpdates recognise "this row is a
  // previously exported entry" and treat it as a candidate update to
  // that exact CalDAV event rather than a new create. No other
  // consumer of this format is expected to set or understand it.
  uid?: string;
  // Full ISO instants — present only from this app's own export,
  // alongside date/startTime/endTime rather than instead of them (a
  // consumer that only understands the minimal format's date/time
  // split still gets a fully usable file). When present, importRow
  // (run-import.ts) uses these directly instead of reconstructing from
  // date/startTime/endTime, which would silently shift by the gap
  // between the exporting and importing visitor's own browser
  // timezones.
  start?: string;
  end?: string;
  director?: string;
  actors?: string;
  ratingImdb?: string;
  ratingRottenTomatoes?: string;
  ratingMetacritic?: string;
  genre?: string;
  year?: string;
  posterUrl?: string;
  imdbId?: string;
  bookingRef?: string;
  letterboxdUrl?: string;
  letterboxdRating?: string;
  notes?: string;
}

export interface ParsedRow {
  rowNumber: number;
  row?: ImportRow;
  error?: string;
}

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
// HH:MM or HH:MM:SS, what the CLI's time.fromisoformat and both published
// schemas accept (#753). Checked against the clock below, not only the shape.
const TIME_RE = /^(\d{2}):(\d{2})(?::(\d{2}))?$/;
const YEAR_RE = /^\d+$/;
const IMDB_URL_RE = /\/title\/(tt\d+)\/?/;

function str(value: unknown): string | undefined {
  return typeof value === "string" && value ? value : undefined;
}

// The CLI's date.fromisoformat refuses 2024-02-30; a shape check alone didn't.
// setUTCFullYear rather than Date.UTC, which reads a year below 100 as 19xx.
function isCalendarDate(value: string): boolean {
  const match = DATE_RE.exec(value);
  if (!match) return false;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  if (year < 1) return false;
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}

function isClockTime(value: string): boolean {
  const match = TIME_RE.exec(value);
  if (!match) return false;
  const [hour, minute, second] = [Number(match[1]), Number(match[2]), Number(match[3] ?? 0)];
  return hour <= 23 && minute <= 59 && second <= 59;
}

// A release year is digits, as the CLI's int() requires ("N/A" is refused), and
// JSON may hand in a plain integer where CSV hands in a string. Undefined for a
// blank, an error message for anything else.
function releaseYear(value: unknown): { year?: string; error?: string } {
  if (typeof value === "number") {
    return Number.isInteger(value)
      ? { year: String(value) }
      : { error: `release_year is not a valid year: "${value}"` };
  }
  const text = str(value)?.trim();
  if (!text) return {};
  if (!YEAR_RE.test(text)) return { error: `release_year is not a valid year: "${text}"` };
  return { year: text };
}

function rowFromRecord(rowNumber: number, raw: Record<string, unknown>): ParsedRow {
  const title = str(raw.title)?.trim();
  if (!title) return { rowNumber, error: "title is required" };

  const medium = str(raw.medium)?.trim();
  if (!medium) return { rowNumber, error: "medium is required" };

  const start = str(raw.start);
  if (start && Number.isNaN(new Date(start).getTime())) {
    return { rowNumber, error: `not a valid start date-time: "${start}"` };
  }
  const end = str(raw.end);
  if (end && Number.isNaN(new Date(end).getTime())) {
    return { rowNumber, error: `not a valid end date-time: "${end}"` };
  }

  // A plain `date` field, or (this app's own export) derived from the
  // higher-precision `start` instant when `date` itself isn't given.
  const date = str(raw.date)?.trim() ?? (start ? localDateAndTime(start).date : undefined);
  if (!date || !isCalendarDate(date)) {
    return { rowNumber, error: `not a valid date: "${String(raw.date ?? "")}"` };
  }

  const startTime = str(raw.start_time);
  const endTime = str(raw.end_time);
  for (const [field, value] of [
    ["start_time", startTime],
    ["end_time", endTime],
  ] as const) {
    if (value && !isClockTime(value)) {
      return { rowNumber, error: `${field} is not a valid time: "${value}"` };
    }
  }

  const year = releaseYear(raw.release_year);
  if (year.error) return { rowNumber, error: year.error };

  const imdbUrlValue = str(raw.imdb_url);
  // #79's ical.ts parses the same shape out of a CLI-authored
  // DESCRIPTION line — this is that same link-to-bare-ID extraction,
  // just for a JSON/CSV field instead of free text.
  const imdbId = imdbUrlValue ? IMDB_URL_RE.exec(imdbUrlValue)?.[1] : undefined;

  return {
    rowNumber,
    row: {
      title,
      date,
      medium,
      startTime,
      endTime,
      venue: str(raw.venue),
      imdbUrl: imdbUrlValue,
      uid: str(raw.uid),
      start,
      end,
      director: str(raw.director),
      actors: str(raw.actors),
      ratingImdb: str(raw.imdb_rating),
      ratingRottenTomatoes: str(raw.rotten_tomatoes_rating),
      ratingMetacritic: str(raw.metacritic_rating),
      genre: str(raw.genre),
      year: year.year,
      posterUrl: str(raw.poster_url),
      imdbId,
      bookingRef: str(raw.booking_ref),
      letterboxdUrl: str(raw.letterboxd_url),
      letterboxdRating: str(raw.letterboxd_rating),
      notes: str(raw.notes),
    },
  };
}

export function parseJsonImport(text: string): ParsedRow[] {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return [{ rowNumber: 1, error: "not valid JSON" }];
  }
  if (!Array.isArray(data)) return [{ rowNumber: 1, error: "expected a JSON array of rows" }];

  return data.map((raw, i) => rowFromRecord(i + 1, raw as Record<string, unknown>));
}

// A minimal RFC 4180 line parser — quoted fields (so a title can contain a
// comma), doubled-quote escaping, nothing fancier.
function parseCsvLines(text: string): string[][] {
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (inQuotes) {
      if (char === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.some((cell) => cell !== "")) rows.push(row);
      row = [];
    } else {
      field += char;
    }
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    if (row.some((cell) => cell !== "")) rows.push(row);
  }
  return rows;
}

export function parseCsvImport(text: string): ParsedRow[] {
  const lines = parseCsvLines(text);
  const header = lines[0];
  if (!header) return [];

  return lines.slice(1).map((line, i) => {
    const raw: Record<string, string | undefined> = {};
    header.forEach((key, columnIndex) => {
      raw[key.trim()] = line[columnIndex];
    });
    // Row 1 is the header, so the first data row is 2 — matches the CLI's
    // own row numbering in its error/skip messages.
    return rowFromRecord(i + 2, raw);
  });
}
