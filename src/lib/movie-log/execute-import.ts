import { retryWhenBusy } from "../caldav/retry";
import type { LoggedViewing, NewViewing } from "../caldav/types";
import type { Credentials } from "../credentials/types";
import type { ImportRow } from "./import-rows";
import {
  applyImportUpdate,
  type ImportPlanEntry,
  type ImportUpdateEntry,
  importRow,
} from "./run-import";

// #842: the writes behind "Import checked rows". One at a time, so a visitor's
// own small CalDAV server isn't flooded and the progress count is exact, and
// each write waits out a 423 or 429 before it counts as a failure.
export interface ImportBatch {
  creates: Pick<ImportPlanEntry, "rowNumber" | "row">[];
  updates: {
    entry: ImportUpdateEntry;
    current: LoggedViewing;
    approvedFields: ReadonlySet<keyof NewViewing>;
  }[];
}

export interface ImportOutcome {
  imported: number;
  updated: number;
  failed: number;
}

export interface ExecuteImportDeps {
  create: (credentials: Credentials, row: ImportRow) => Promise<void>;
  update: (
    credentials: Credentials,
    current: LoggedViewing,
    entry: ImportUpdateEntry,
    approvedFields: ReadonlySet<keyof NewViewing>,
  ) => Promise<void>;
  sleep?: (ms: number) => Promise<void>;
}

const DEFAULT_DEPS: ExecuteImportDeps = { create: importRow, update: applyImportUpdate };

export async function executeImport(
  credentials: Credentials,
  batch: ImportBatch,
  onProgress: (done: number, total: number) => void,
  deps: ExecuteImportDeps = DEFAULT_DEPS,
): Promise<ImportOutcome> {
  const total = batch.creates.length + batch.updates.length;
  const outcome: ImportOutcome = { imported: 0, updated: 0, failed: 0 };
  let done = 0;

  const attempt = async (write: () => Promise<void>, onSuccess: () => void) => {
    try {
      await retryWhenBusy(write, { sleep: deps.sleep });
      onSuccess();
    } catch {
      outcome.failed++;
    }
    onProgress(++done, total);
  };

  for (const { row } of batch.creates) {
    await attempt(
      () => deps.create(credentials, row),
      () => outcome.imported++,
    );
  }
  for (const { entry, current, approvedFields } of batch.updates) {
    await attempt(
      () => deps.update(credentials, current, entry, approvedFields),
      () => outcome.updated++,
    );
  }
  return outcome;
}
