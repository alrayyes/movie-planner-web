// #843: checks a chosen file before it's read, so a wrong type or an enormous
// file is turned away with a reason rather than hanging the tab.
export const MAX_IMPORT_BYTES = 25 * 1024 * 1024;

export type FileCheck = { ok: true } | { ok: false; error: string };

export function validateImportFile(file: { name: string; size: number }): FileCheck {
  if (!/\.(csv|json)$/i.test(file.name)) {
    return { ok: false, error: `${file.name} isn't a .csv or .json file.` };
  }
  if (file.size > MAX_IMPORT_BYTES) {
    const megabytes = (file.size / (1024 * 1024)).toFixed(1);
    return { ok: false, error: `${file.name} is ${megabytes} MB; the limit is 25 MB.` };
  }
  return { ok: true };
}

// The importer's own minimal columns: title, date and medium are required, the
// rest are optional.
export const SAMPLE_CSV = `title,date,start_time,end_time,medium,venue
Paddington,2026-02-01,18:00,19:40,netflix,
Dune: Part Two,2026-02-15,19:30,22:15,cinema,Grand Vista Cinema
`;
