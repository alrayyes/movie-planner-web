import { done, openDatabase, result } from "../idb/helpers";
import type { ActivityLogEntry, ActivityLogStore } from "./types";

// A separate database from credentials/indexeddb-store.ts's own —
// keeps this store's schema (and any future version bump) from ever
// having to coordinate with credentials', which has nothing to do with
// activity logging.
const DB_NAME = "movie-planner-web-activity-log";
const DB_VERSION = 1;
const STORE_NAME = "entries";

// #349: caps unbounded growth — a visitor who's used this app for a
// year shouldn't carry an ever-growing IndexedDB store just from normal
// use. The oldest entries drop off; this is a debugging aid, not a
// permanent record.
const MAX_ENTRIES = 500;

function openActivityLog(): Promise<IDBDatabase> {
  return openDatabase(DB_NAME, DB_VERSION, (db) => {
    db.createObjectStore(STORE_NAME, { keyPath: "id", autoIncrement: true });
  });
}

export class IndexedDbActivityLogStore implements ActivityLogStore {
  async append(entry: Omit<ActivityLogEntry, "id">): Promise<void> {
    const db = await openActivityLog();
    try {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      store.add(entry);
      // Trim oldest-first (auto-increment key order = insertion order)
      // once over the cap, in the same transaction as the add. A count at or
      // under the cap leaves `toDelete` at zero or less, and the cursor stops
      // at once.
      const countRequest = store.count();
      countRequest.onsuccess = () => {
        const cursorRequest = store.openCursor();
        let toDelete = countRequest.result - MAX_ENTRIES;
        cursorRequest.onsuccess = () => {
          const cursor = cursorRequest.result;
          if (!cursor || toDelete <= 0) return;
          cursor.delete();
          toDelete--;
          cursor.continue();
        };
      };
      await done(tx);
    } finally {
      db.close();
    }
  }

  async list(limit = MAX_ENTRIES): Promise<ActivityLogEntry[]> {
    const db = await openActivityLog();
    try {
      const entries = await result<ActivityLogEntry[]>(
        db.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).getAll(),
      );
      // Keys are insertion order, so newest first is the reverse.
      return entries.reverse().slice(0, limit);
    } finally {
      db.close();
    }
  }
}
