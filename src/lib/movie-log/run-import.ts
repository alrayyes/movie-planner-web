import { createViewing, listViewings, updateViewing } from "../caldav/client";
import type { CaldavConfig, LoggedViewing, NewViewing } from "../caldav/types";
import type { Credentials } from "../credentials/types";
import { isLikelyDuplicateTitle } from "./duplicates";
import type { ImportRow, ParsedRow } from "./import-rows";

export interface ImportPlanEntry {
  rowNumber: number;
  row: ImportRow;
  isDuplicate: boolean;
  duplicateOfTitle?: string;
}

interface DuplicateCandidate {
  title: string;
  date: string; // YYYY-MM-DD
}

function existingByUid(existing: LoggedViewing[]): Map<string, LoggedViewing> {
  return new Map(existing.map((v) => [v.uid, v]));
}

// #69: a row from the exported format whose uid matches something
// already on the calendar is a candidate *update* to that entry, not a
// new create — planImport (below) excludes these; planUpdates (further
// below) is where they're actually handled.
function isUidMatch(row: ImportRow, existing: Map<string, LoggedViewing>): boolean {
  return Boolean(row.uid && existing.has(row.uid));
}

// bulk-import spec, "Duplicate detection on import": checked against both
// the visitor's existing calendar and rows already planned earlier in the
// same file — a later row can duplicate an earlier one in the same
// upload, not only something already logged.
//
// #69: a row whose uid matches an existing entry never reaches this
// fuzzy title+date matching at all — it's handled as an update instead
// (planUpdates), never offered as a new create.
export function planImport(rows: ParsedRow[], existing: LoggedViewing[]): ImportPlanEntry[] {
  const byUid = existingByUid(existing);
  const candidates: DuplicateCandidate[] = existing.map((v) => ({
    title: v.title,
    date: v.start.slice(0, 10),
  }));

  const plan: ImportPlanEntry[] = [];
  for (const parsed of rows) {
    if (!parsed.row || isUidMatch(parsed.row, byUid)) continue;
    const { row, rowNumber } = parsed;
    const duplicate = candidates.find(
      (c) => c.date === row.date && isLikelyDuplicateTitle(row.title, c.title),
    );
    plan.push({
      rowNumber,
      row,
      isDuplicate: Boolean(duplicate),
      duplicateOfTitle: duplicate?.title,
    });
    candidates.push({ title: row.title, date: row.date });
  }
  return plan;
}

// Every NewViewing field a row from the exported format might specify —
// start/end handled separately below since they don't map onto a single
// ImportRow field the same simple way (the minimal format's date +
// startTime/endTime split versus the exported format's own start/end).
const COMPARABLE_FIELDS: { field: keyof NewViewing; label: string }[] = [
  { field: "title", label: "Title" },
  { field: "medium", label: "Medium" },
  { field: "venue", label: "Venue" },
  { field: "director", label: "Director" },
  { field: "actors", label: "Actors" },
  { field: "genre", label: "Genre" },
  { field: "year", label: "Year" },
  { field: "posterUrl", label: "Poster" },
  { field: "imdbId", label: "IMDb ID" },
  { field: "bookingRef", label: "Booking reference" },
  { field: "letterboxdUrl", label: "Letterboxd URL" },
  { field: "letterboxdRating", label: "Letterboxd rating" },
  { field: "notes", label: "Notes" },
  { field: "ratingImdb", label: "IMDb rating" },
  { field: "ratingRottenTomatoes", label: "Rotten Tomatoes rating" },
  { field: "ratingMetacritic", label: "Metacritic rating" },
];

export interface FieldChange {
  field: keyof NewViewing;
  label: string;
  oldValue?: string;
  newValue: string;
}

export interface ImportUpdateEntry {
  rowNumber: number;
  uid: string;
  title: string;
  changes: FieldChange[];
}

// bulk-import spec, "Updating an existing entry by uid": the calendar is
// the source of truth, so a re-imported row only ever touches a field it
// actually specifies and that genuinely differs — a field the row
// leaves unset is left alone, never treated as "clear this", and a row
// with no real differences produces no entry (and so no request) at all.
export function planUpdates(rows: ParsedRow[], existing: LoggedViewing[]): ImportUpdateEntry[] {
  const byUid = existingByUid(existing);
  const updates: ImportUpdateEntry[] = [];

  for (const parsed of rows) {
    const row = parsed.row;
    if (!row?.uid) continue;
    const current = byUid.get(row.uid);
    if (!current) continue;
    const uid = row.uid;

    const changes: FieldChange[] = [];
    for (const { field, label } of COMPARABLE_FIELDS) {
      const newValue = row[field as keyof ImportRow];
      if (typeof newValue !== "string" || newValue === "") continue;
      const oldValue = current[field as keyof LoggedViewing] as string | undefined;
      if (newValue !== oldValue) changes.push({ field, label, oldValue, newValue });
    }
    if (row.start && row.start !== current.start) {
      changes.push({
        field: "start",
        label: "Start",
        oldValue: current.start,
        newValue: row.start,
      });
    }
    if (row.end && row.end !== current.end) {
      changes.push({ field: "end", label: "End", oldValue: current.end, newValue: row.end });
    }

    if (changes.length > 0) {
      updates.push({ rowNumber: parsed.rowNumber, uid, title: row.title, changes });
    }
  }
  return updates;
}

// A wide-enough window to cover essentially any import file without the
// visitor having to pick a range up front — mirrors calendar-overview's
// own default range for the same reason.
export function importCheckRange(): { from: string; to: string } {
  const now = new Date();
  const from = new Date(now);
  from.setFullYear(now.getFullYear() - 15);
  const to = new Date(now);
  to.setFullYear(now.getFullYear() + 1);
  return { from: from.toISOString(), to: to.toISOString() };
}

// No timezone in the minimal import format, same as the manual log
// form's date + optional time fields — interpreted as the visitor's own
// browser timezone, not assumed to be anywhere specific. A missing time
// defaults to midnight; shared with movie-log-form.ts so both entry
// points treat "no time given" identically.
export function toIsoDateTime(date: string, time: string | undefined): string {
  return new Date(`${date}T${time ?? "00:00"}:00`).toISOString();
}

function configFromCredentials(credentials: Credentials): CaldavConfig {
  return {
    baseUrl: credentials.caldavUrl,
    username: credentials.caldavUsername,
    password: credentials.caldavPassword,
  };
}

export async function importRow(credentials: Credentials, row: ImportRow): Promise<void> {
  // #69: the exported format supplies full ISO instants directly —
  // using those (rather than reconstructing from date + startTime/
  // endTime in this browser's own timezone) is what keeps a re-import
  // exact regardless of which timezone the importing visitor is in.
  const start = row.start ?? toIsoDateTime(row.date, row.startTime);
  const end = row.end ?? toIsoDateTime(row.date, row.endTime ?? row.startTime);
  const viewing: NewViewing = {
    title: row.title,
    start,
    end,
    medium: row.medium,
    venue: row.venue,
    director: row.director,
    actors: row.actors,
    ratingImdb: row.ratingImdb,
    ratingRottenTomatoes: row.ratingRottenTomatoes,
    ratingMetacritic: row.ratingMetacritic,
    genre: row.genre,
    year: row.year,
    posterUrl: row.posterUrl,
    imdbId: row.imdbId,
    bookingRef: row.bookingRef,
    letterboxdUrl: row.letterboxdUrl,
    letterboxdRating: row.letterboxdRating,
    notes: row.notes,
  };
  await createViewing(configFromCredentials(credentials), viewing);
}

// #69: applies only the fields the visitor approved (checked on the
// review page) — every other field on the existing entry is carried
// forward unchanged, same principle as any other edit in this app.
export async function applyImportUpdate(
  credentials: Credentials,
  current: LoggedViewing,
  entry: ImportUpdateEntry,
  approvedFields: ReadonlySet<keyof NewViewing>,
): Promise<void> {
  const updated: NewViewing = { ...current };
  for (const change of entry.changes) {
    if (approvedFields.has(change.field)) {
      (updated as Record<string, string>)[change.field] = change.newValue;
    }
  }
  await updateViewing(configFromCredentials(credentials), entry.uid, updated);
}

export async function fetchExistingForImportCheck(
  credentials: Credentials,
): Promise<LoggedViewing[]> {
  return listViewings(configFromCredentials(credentials), importCheckRange());
}
