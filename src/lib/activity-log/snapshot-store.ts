import type { LoggedViewing } from "../caldav/types";

// #432: the last-seen state of every viewing, as of this browser's own
// last sync — a separate database from both the capped activity-log
// store (indexeddb-store.ts) and credentials' own (a different schema,
// a different growth shape: this needs to cover every live viewing,
// bounded by the current calendar size rather than an accumulating
// log, so it would be wrong to cap it the same way #349's log is).
export interface CaldavSnapshotStore {
  // null means "never synced before" — #432's first-run bootstrap seeds
  // this without logging anything. Distinct from an empty (but seeded)
  // Map, which means "synced before, and the calendar was empty then".
  load(): Promise<Map<string, LoggedViewing> | null>;
  // Replaces the entire snapshot with the given fetch and marks it
  // seeded — called at the end of every sync, whether or not anything
  // was actually diffed, so the next sync always compares against
  // what's really there now.
  replaceAll(viewings: LoggedViewing[]): Promise<void>;
  // Removes a single uid — called from deleteViewing's write path so a
  // self-made delete's snapshot entry never lingers to be misread as
  // an out-of-band deletion by the next diff pass.
  remove(uid: string): Promise<void>;
}

const DB_NAME = "movie-planner-web-caldav-snapshot";
const DB_VERSION = 1;
const VIEWINGS_STORE = "viewings";
const META_STORE = "meta";
const SEEDED_KEY = "seeded";

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(VIEWINGS_STORE)) {
        request.result.createObjectStore(VIEWINGS_STORE, { keyPath: "uid" });
      }
      if (!request.result.objectStoreNames.contains(META_STORE)) {
        request.result.createObjectStore(META_STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export class IndexedDbCaldavSnapshotStore implements CaldavSnapshotStore {
  async load(): Promise<Map<string, LoggedViewing> | null> {
    const db = await openDatabase();
    try {
      const seeded = await new Promise<boolean>((resolve, reject) => {
        const tx = db.transaction(META_STORE, "readonly");
        const request = tx.objectStore(META_STORE).get(SEEDED_KEY);
        request.onsuccess = () => resolve(request.result === true);
        request.onerror = () => reject(request.error);
      });
      if (!seeded) return null;

      const viewings = await new Promise<LoggedViewing[]>((resolve, reject) => {
        const tx = db.transaction(VIEWINGS_STORE, "readonly");
        const request = tx.objectStore(VIEWINGS_STORE).getAll();
        request.onsuccess = () => resolve(request.result as LoggedViewing[]);
        request.onerror = () => reject(request.error);
      });
      return new Map(viewings.map((v) => [v.uid, v]));
    } finally {
      db.close();
    }
  }

  async replaceAll(viewings: LoggedViewing[]): Promise<void> {
    const db = await openDatabase();
    try {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction([VIEWINGS_STORE, META_STORE], "readwrite");
        const viewingsStore = tx.objectStore(VIEWINGS_STORE);
        viewingsStore.clear();
        for (const viewing of viewings) viewingsStore.put(viewing);
        tx.objectStore(META_STORE).put(true, SEEDED_KEY);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } finally {
      db.close();
    }
  }

  async remove(uid: string): Promise<void> {
    const db = await openDatabase();
    try {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(VIEWINGS_STORE, "readwrite");
        tx.objectStore(VIEWINGS_STORE).delete(uid);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } finally {
      db.close();
    }
  }
}

let instance: CaldavSnapshotStore | undefined;

export function getCaldavSnapshotStore(): CaldavSnapshotStore {
  instance ??= new IndexedDbCaldavSnapshotStore();
  return instance;
}

// #432: best-effort, deliberately — called from client.ts's
// deleteViewing right after a real CalDAV DELETE already succeeded,
// same "a visitor's edit must never fail just because local bookkeeping
// couldn't be written" reasoning as recordActivity's own comment.
export async function forgetCaldavSnapshot(uid: string): Promise<void> {
  try {
    await getCaldavSnapshotStore().remove(uid);
  } catch {
    // Swallowed on purpose — see above.
  }
}
