import PostalMime from "postal-mime";

// Ported from movie-planner's own src/movie_planner/pathe.py — same
// regexes, same field shape — so a real Pathé confirmation email parses
// the same way here as it does through the CLI's `from-pathe-email`.
export class PatheEmailParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PatheEmailParseError";
  }
}

export interface PatheBooking {
  title: string;
  start: string; // ISO 8601, UTC
  end: string; // ISO 8601, UTC
  cinema: string;
  bookingRef: string;
  screeningDetails?: string;
}

// A raw piped .eml has real RFC 822 headers before the first blank line;
// already-pasted plain text doesn't. This is how the two are told apart.
const HEADER_RE = /^(From|To|Subject|Date|MIME-Version|Content-Type|Message-ID):/m;
const TITLE_RE = /\n([^\n]+)\n=+\n/;
const DATETIME_RE =
  /\b\w+day (\d{2}\/\d{2}\/\d{2}), (\d{2}:\d{2}) Expected to end at (\d{2}:\d{2})/;
const CINEMA_RE = /^(Pathé [^\n]+)$/m;
const AUDITORIUM_RE = /^(Auditorium[^\n]*)$/m;
const BOOKING_REF_RE = /Booking number\s*\n+\s*(N°\S+)/;

async function extractBody(raw: string): Promise<string> {
  const head = raw.split("\n\n", 1)[0] ?? "";
  if (!HEADER_RE.test(head)) return raw;

  const parsed = await PostalMime.parse(raw);
  if (parsed.text) return parsed.text;
  throw new PatheEmailParseError("could not find a text/plain part in the email");
}

function screeningDetails(body: string, after: number, before: number): string | undefined {
  const languageBlock = body.slice(after, before).trim();
  const language = languageBlock
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line.length > 0);
  const auditorium = AUDITORIUM_RE.exec(body)?.[1]?.trim();
  const parts = [language, auditorium].filter((part): part is string => Boolean(part));
  return parts.length > 0 ? parts.join(", ") : undefined;
}

// Pathé's own confirmation emails carry no timezone — the cinema chain
// this parses is NL/BE only, so wall-clock times are interpreted as
// Europe/Amsterdam (CET/CEST) and converted to UTC accordingly.
function amsterdamWallClockToUtcIso(
  day: string,
  month: string,
  year: string,
  time: string,
): string {
  const fullYear = 2000 + Number(year);
  const [hour, minute] = time.split(":").map(Number);

  // A UTC guess, then corrected by the real Europe/Amsterdam offset at
  // that date — DST-safe without a timezone-database dependency.
  const utcGuess = Date.UTC(fullYear, Number(month) - 1, Number(day), hour, minute);
  const offsetMinutes = amsterdamOffsetMinutes(new Date(utcGuess));
  return new Date(utcGuess - offsetMinutes * 60_000).toISOString();
}

function amsterdamOffsetMinutes(date: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Amsterdam",
    timeZoneName: "shortOffset",
  }).formatToParts(date);
  const offset = parts.find((p) => p.type === "timeZoneName")?.value ?? "GMT+1";
  const match = /GMT([+-]\d{1,2})(?::(\d{2}))?/.exec(offset);
  const hours = Number(match?.[1] ?? 1);
  const minutes = Number(match?.[2] ?? 0);
  return hours * 60 + (hours < 0 ? -minutes : minutes);
}

export async function parsePatheEmail(raw: string): Promise<PatheBooking> {
  const body = await extractBody(raw);

  const bookingMatch = BOOKING_REF_RE.exec(body);
  const titleMatch = TITLE_RE.exec(body);
  const datetimeMatch = DATETIME_RE.exec(body);
  const cinemaMatch = CINEMA_RE.exec(body);
  if (!bookingMatch || !titleMatch || !datetimeMatch || !cinemaMatch) {
    throw new PatheEmailParseError("could not parse this as a Pathé booking confirmation email");
  }

  const [, dateStr, startTime, endTime] = datetimeMatch;
  const [day, month, year] = (dateStr ?? "").split("/");
  if (!day || !month || !year || !startTime || !endTime) {
    throw new PatheEmailParseError("could not parse this as a Pathé booking confirmation email");
  }

  return {
    title: titleMatch[1]?.trim() ?? "",
    start: amsterdamWallClockToUtcIso(day, month, year, startTime),
    end: amsterdamWallClockToUtcIso(day, month, year, endTime),
    cinema: cinemaMatch[1]?.trim() ?? "",
    bookingRef: bookingMatch[1]?.trim() ?? "",
    screeningDetails: screeningDetails(
      body,
      (titleMatch.index ?? 0) + titleMatch[0].length,
      datetimeMatch.index ?? 0,
    ),
  };
}
