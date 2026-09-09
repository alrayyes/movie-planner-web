import { listViewings } from "../caldav/client";
import type { CaldavConfig, LoggedViewing } from "../caldav/types";
import { importCheckRange } from "../movie-log/run-import";
import { diffCaldavSnapshot } from "./snapshot-diff";
import { type CaldavSnapshotStore, getCaldavSnapshotStore } from "./snapshot-store";
import { recordActivity } from "./store";
import type { ActivityLogEntry } from "./types";

interface SyncDeps {
  fetchAllViewings?: (config: CaldavConfig) => Promise<LoggedViewing[]>;
  store?: CaldavSnapshotStore;
  record?: (entry: Omit<ActivityLogEntry, "id">) => Promise<void>;
  // #432: Astro's <ClientRouter/> keeps a page's own script running
  // across a soft, client-side navigation (see Layout.astro's own
  // astro:before-swap handling) — without a way to cancel, this
  // fire-and-forget sync would keep making network/IndexedDB calls
  // well into whatever page a visitor navigated to next. The caller
  // aborts this on astro:before-swap; an already-aborted signal (or one
  // that fires mid-fetch) just makes fetchAllViewings reject, caught by
  // the try/catch below like any other best-effort failure.
  signal?: AbortSignal;
}

// #432: this app's own equivalent of the CLI's manual `sync pull` — run
// on every sync, it fetches the visitor's ENTIRE calendar (independent
// of whatever the overview's own filter narrows the visible page to; a
// filtered fetch would misread anything outside the filter as deleted),
// diffs it against the last-seen snapshot, and logs whatever changed
// that this app didn't already log itself at write time.
//
// Best-effort end to end, same reasoning as recordActivity's own
// comment: a visitor's page must never fail, or even visibly hang, just
// because this debugging aid couldn't run (a network hiccup on the
// extra fetch, IndexedDB unavailable). `deps` exists purely so this
// orchestration is unit-testable against a fake snapshot store, the
// same reason recordActivity's own IndexedDB-backed store has no direct
// unit test either — only the pure diff logic and this wiring are.
export async function syncCaldavActivityLog(
  config: CaldavConfig,
  deps: SyncDeps = {},
): Promise<void> {
  const fetchAllViewings =
    deps.fetchAllViewings ?? ((c) => listViewings(c, importCheckRange(), { signal: deps.signal }));
  const store = deps.store ?? getCaldavSnapshotStore();
  const record = deps.record ?? recordActivity;

  try {
    const current = await fetchAllViewings(config);
    const previous = await store.load();

    if (previous === null) {
      // First run: nothing to diff against yet. Seeding now, without
      // logging anything, is what keeps a fresh browser from reading a
      // visitor's entire pre-existing history as newly "created".
      await store.replaceAll(current);
      return;
    }

    for (const entry of diffCaldavSnapshot(previous, current)) {
      await record({
        at: new Date().toISOString(),
        action: entry.action,
        uid: entry.uid,
        title: entry.title,
        changes: entry.changes,
        actor: entry.actor,
      });
    }

    await store.replaceAll(current);
  } catch {
    // Swallowed on purpose — see above.
  }
}
