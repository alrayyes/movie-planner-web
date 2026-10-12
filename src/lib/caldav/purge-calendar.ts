import { type DeleteOptions, deleteViewing } from "./client";
import type { CaldavConfig, LoggedViewing } from "./types";
import { clearViewingsCache } from "./viewings-cache";
import { fetchFreshViewings } from "./viewings-source";

// #835: deletes every viewing on the visitor's calendar, for starting over.
// The picklist sidecar (venues, mediums) isn't a viewing and is left alone.
// One failed delete doesn't stop the rest; the caller gets the counts.
export interface PurgeCalendarDeps {
  listFresh: (config: CaldavConfig) => Promise<LoggedViewing[]>;
  remove: (config: CaldavConfig, uid: string, options?: DeleteOptions) => Promise<void>;
  clearCache: () => Promise<void>;
}

export interface PurgeCalendarResult {
  deleted: number;
  failed: number;
  // Why the first failure happened, so the visitor can act on it.
  firstError?: string;
}

const DEFAULT_DEPS: PurgeCalendarDeps = {
  listFresh: fetchFreshViewings,
  remove: deleteViewing,
  clearCache: () => clearViewingsCache(),
};

// Two at a time: one by one is slow for hundreds of events, and a visitor's own
// small server (#840: a Baikal that took over 10 seconds per request) queues
// more than that behind each other until they all time out.
const CONCURRENCY = 2;
// Longer than the 10 seconds a normal request gets, since a purge is the one
// place a slow server is worth waiting on.
const DELETE_TIMEOUT_MS = 30_000;

export async function purgeCalendar(
  config: CaldavConfig,
  onProgress: (done: number, total: number) => void,
  deps: PurgeCalendarDeps = DEFAULT_DEPS,
): Promise<PurgeCalendarResult> {
  const viewings = await deps.listFresh(config);
  const total = viewings.length;
  let next = 0;
  let done = 0;
  let deleted = 0;
  let failed = 0;
  let firstError: string | undefined;

  async function worker() {
    while (next < total) {
      const { uid, title } = viewings[next++] as LoggedViewing;
      try {
        await deps.remove(config, uid, { title, timeoutMs: DELETE_TIMEOUT_MS });
        deleted++;
      } catch (error) {
        failed++;
        firstError ??= error instanceof Error ? error.message : String(error);
      }
      onProgress(++done, total);
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, total) }, worker));

  await deps.clearCache();
  return { deleted, failed, firstError };
}
