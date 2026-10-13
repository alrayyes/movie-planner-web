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

// #859: a delete that answers success can still leave the viewing on the
// server (a 404 on a path that isn't the event's reads as "already gone"), so
// the purge asks the server what is left. It deletes again while that list
// shrinks, up to this many passes, and reports whatever the server still lists.
const MAX_PASSES = 3;

function stillListed(count: number): string {
  return count === 1
    ? "The server still lists 1 viewing after deleting it."
    : `The server still lists ${count} viewings after deleting them.`;
}

export async function purgeCalendar(
  config: CaldavConfig,
  onProgress: (done: number, total: number) => void,
  deps: PurgeCalendarDeps = DEFAULT_DEPS,
): Promise<PurgeCalendarResult> {
  let viewings = await deps.listFresh(config);
  const initial = viewings.length;
  let firstError: string | undefined;

  async function deletePass(batch: LoggedViewing[]) {
    const total = batch.length;
    let next = 0;
    let done = 0;
    async function worker() {
      while (next < total) {
        const { uid, title } = batch[next++] as LoggedViewing;
        try {
          await deps.remove(config, uid, { title, timeoutMs: DELETE_TIMEOUT_MS });
        } catch (error) {
          firstError ??= error instanceof Error ? error.message : String(error);
        }
        onProgress(++done, total);
      }
    }
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, total) }, worker));
  }

  try {
    for (let pass = 0; pass < MAX_PASSES && viewings.length > 0; pass++) {
      const before = viewings.length;
      await deletePass(viewings);
      viewings = await deps.listFresh(config);
      if (viewings.length >= before) break;
    }
  } finally {
    // The deletes happened whatever listing again did, so the copy this
    // browser holds is stale either way.
    await deps.clearCache();
  }
  const failed = viewings.length;
  if (failed > 0) firstError ??= stillListed(failed);
  return { deleted: initial - failed, failed, firstError };
}
