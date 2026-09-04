import { createViewing, listViewings } from "../caldav/api-client";
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

// bulk-import spec, "Duplicate detection on import": checked against both
// the visitor's existing calendar and rows already planned earlier in the
// same file — a later row can duplicate an earlier one in the same
// upload, not only something already logged.
export function planImport(rows: ParsedRow[], existing: LoggedViewing[]): ImportPlanEntry[] {
  const candidates: DuplicateCandidate[] = existing.map((v) => ({
    title: v.title,
    date: v.start.slice(0, 10),
  }));

  const plan: ImportPlanEntry[] = [];
  for (const parsed of rows) {
    if (!parsed.row) continue;
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

function toIsoDateTime(date: string, time: string | undefined): string {
  // No timezone in the import format, same as the manual log form's
  // datetime-local inputs — interpreted as the visitor's own browser
  // timezone, not assumed to be anywhere specific.
  return new Date(`${date}T${time ?? "00:00"}:00`).toISOString();
}

export async function importRow(credentials: Credentials, row: ImportRow): Promise<void> {
  const config: CaldavConfig = {
    baseUrl: credentials.caldavUrl,
    username: credentials.caldavUsername,
    password: credentials.caldavPassword,
  };
  const start = toIsoDateTime(row.date, row.startTime);
  const end = toIsoDateTime(row.date, row.endTime ?? row.startTime);
  const viewing: NewViewing = {
    title: row.title,
    start,
    end,
    medium: row.medium,
    venue: row.venue,
  };
  await createViewing(config, viewing);
}

export async function fetchExistingForImportCheck(
  credentials: Credentials,
): Promise<LoggedViewing[]> {
  const config: CaldavConfig = {
    baseUrl: credentials.caldavUrl,
    username: credentials.caldavUsername,
    password: credentials.caldavPassword,
  };
  return listViewings(config, importCheckRange());
}
