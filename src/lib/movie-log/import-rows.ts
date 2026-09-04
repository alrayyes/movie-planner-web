// Ported from movie-planner's own src/movie_planner/importers.py — same
// required/optional fields (examples/README.md: "title, date, medium are
// required; start_time, end_time, venue, imdb_url are optional"), same
// per-row error isolation so one bad row doesn't fail the whole import.
export interface ImportRow {
  title: string;
  date: string; // YYYY-MM-DD
  medium: string;
  startTime?: string; // HH:MM
  endTime?: string; // HH:MM
  venue?: string;
  imdbUrl?: string;
}

export interface ParsedRow {
  rowNumber: number;
  row?: ImportRow;
  error?: string;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;

function rowFromRecord(rowNumber: number, raw: Record<string, string | undefined>): ParsedRow {
  const title = raw.title?.trim();
  if (!title) return { rowNumber, error: "title is required" };

  const medium = raw.medium?.trim();
  if (!medium) return { rowNumber, error: "medium is required" };

  const date = raw.date?.trim();
  if (!date || !DATE_RE.test(date))
    return { rowNumber, error: `not a valid date: "${raw.date ?? ""}"` };

  for (const [field, value] of [
    ["start_time", raw.start_time],
    ["end_time", raw.end_time],
  ] as const) {
    if (value && !TIME_RE.test(value)) {
      return { rowNumber, error: `${field} is not a valid time: "${value}"` };
    }
  }

  return {
    rowNumber,
    row: {
      title,
      date,
      medium,
      startTime: raw.start_time || undefined,
      endTime: raw.end_time || undefined,
      venue: raw.venue || undefined,
      imdbUrl: raw.imdb_url || undefined,
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

  return data.map((raw, i) => rowFromRecord(i + 1, raw as Record<string, string | undefined>));
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
