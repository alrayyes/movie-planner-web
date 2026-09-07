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

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME, { keyPath: "id", autoIncrement: true });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export class IndexedDbActivityLogStore implements ActivityLogStore {
  async append(entry: Omit<ActivityLogEntry, "id">): Promise<void> {
    const db = await openDatabase();
    try {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readwrite");
        const store = tx.objectStore(STORE_NAME);
        store.add(entry);
        // Trim oldest-first (auto-increment key order = insertion order)
        // once over the cap, in the same transaction as the add.
        const countRequest = store.count();
        countRequest.onsuccess = () => {
          const excess = countRequest.result - MAX_ENTRIES;
          if (excess <= 0) return;
          const cursorRequest = store.openCursor();
          let toDelete = excess;
          cursorRequest.onsuccess = () => {
            const cursor = cursorRequest.result;
            if (!cursor || toDelete <= 0) return;
            cursor.delete();
            toDelete--;
            cursor.continue();
          };
        };
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } finally {
      db.close();
    }
  }

  async list(limit = MAX_ENTRIES): Promise<ActivityLogEntry[]> {
    const db = await openDatabase();
    try {
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readonly");
        const request = tx.objectStore(STORE_NAME).openCursor(null, "prev");
        const results: ActivityLogEntry[] = [];
        request.onsuccess = () => {
          const cursor = request.result;
          if (!cursor || results.length >= limit) {
            resolve(results);
            return;
          }
          results.push(cursor.value as ActivityLogEntry);
          cursor.continue();
        };
        request.onerror = () => reject(request.error);
      });
    } finally {
      db.close();
    }
  }
}
