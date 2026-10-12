import { deleteViewing } from "./client";
import type { CaldavConfig, LoggedViewing } from "./types";
import { clearViewingsCache } from "./viewings-cache";
import { fetchFreshViewings } from "./viewings-source";

// #835: deletes every viewing on the visitor's calendar, for starting over.
// The picklist sidecar (venues, mediums) isn't a viewing and is left alone.
// One failed delete doesn't stop the rest; the caller gets the counts.
export interface PurgeCalendarDeps {
  listFresh: (config: CaldavConfig) => Promise<LoggedViewing[]>;
  remove: (config: CaldavConfig, uid: string) => Promise<void>;
  clearCache: () => Promise<void>;
}

export interface PurgeCalendarResult {
  deleted: number;
  failed: number;
}

const DEFAULT_DEPS: PurgeCalendarDeps = {
  listFresh: fetchFreshViewings,
  remove: deleteViewing,
  clearCache: () => clearViewingsCache(),
};

// A few at a time: one by one is slow for hundreds of events, all at once would
// open hundreds of connections to a visitor's own small server.
const CONCURRENCY = 4;

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

  async function worker() {
    while (next < total) {
      const { uid } = viewings[next++] as LoggedViewing;
      try {
        await deps.remove(config, uid);
        deleted++;
      } catch {
        failed++;
      }
      onProgress(++done, total);
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, total) }, worker));

  await deps.clearCache();
  return { deleted, failed };
}
