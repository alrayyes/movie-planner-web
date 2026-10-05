import type { LoggedViewing } from "../caldav/types";
import { done, openDatabase, result } from "../idb/helpers";

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

function openSnapshot(): Promise<IDBDatabase> {
  return openDatabase(DB_NAME, DB_VERSION, (db) => {
    db.createObjectStore(VIEWINGS_STORE, { keyPath: "uid" });
    db.createObjectStore(META_STORE);
  });
}

export class IndexedDbCaldavSnapshotStore implements CaldavSnapshotStore {
  async load(): Promise<Map<string, LoggedViewing> | null> {
    const db = await openSnapshot();
    try {
      const seeded = await result(
        db.transaction(META_STORE, "readonly").objectStore(META_STORE).get(SEEDED_KEY),
      );
      if (seeded !== true) return null;

      const viewings = await result<LoggedViewing[]>(
        db.transaction(VIEWINGS_STORE, "readonly").objectStore(VIEWINGS_STORE).getAll(),
      );
      return new Map(viewings.map((v) => [v.uid, v]));
    } finally {
      db.close();
    }
  }

  async replaceAll(viewings: LoggedViewing[]): Promise<void> {
    const db = await openSnapshot();
    try {
      const tx = db.transaction([VIEWINGS_STORE, META_STORE], "readwrite");
      const viewingsStore = tx.objectStore(VIEWINGS_STORE);
      viewingsStore.clear();
      for (const viewing of viewings) viewingsStore.put(viewing);
      tx.objectStore(META_STORE).put(true, SEEDED_KEY);
      await done(tx);
    } finally {
      db.close();
    }
  }

  async remove(uid: string): Promise<void> {
    const db = await openSnapshot();
    try {
      const tx = db.transaction(VIEWINGS_STORE, "readwrite");
      tx.objectStore(VIEWINGS_STORE).delete(uid);
      await done(tx);
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
