import { done, openDatabase, result } from "../idb/helpers";
import type { CaldavConfig, LoggedViewing } from "./types";

// #715: a browser-side copy of the visitor's viewings, so a page can render
// at once from what this browser saw last time while a fresh request runs in
// the background (viewings-source.ts). Kept in its own database, separate
// from the activity log's snapshot store (activity-log/snapshot-store.ts):
// that one is the diff baseline for "what changed on the server", and
// serving pages from it would blind that diff.
//
// It holds the whole history for one account, or nothing. A partial cache
// would look complete to the next page, so a write only touches an account
// that already has a full copy.
export interface CachedViewings {
  viewings: LoggedViewing[];
  fetchedAt: number;
}

export interface ViewingsCacheStore {
  // null means "never fetched for this account", which is different from a
  // cached, empty calendar.
  load(account: string): Promise<CachedViewings | null>;
  // Replaces the account's whole copy, keeping the order the server gave.
  replaceAll(account: string, viewings: LoggedViewing[]): Promise<void>;
  // No-ops for an account with no full copy yet (see above).
  upsert(account: string, viewing: LoggedViewing): Promise<void>;
  remove(account: string, uid: string): Promise<void>;
  // Drops every account except this one, so a visitor who points the app at
  // a different calendar never sees the old one's viewings.
  retainOnly(account: string): Promise<void>;
}

// Which calendar a cached copy belongs to. A hash of the URL and username,
// never the password: the cache must hold nothing that could stand in for a
// credential, and a changed password still reaches the same calendar.
export async function accountKeyFor(config: Pick<CaldavConfig, "baseUrl" | "username">) {
  const bytes = new TextEncoder().encode(`${config.baseUrl}\n${config.username}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

const DB_NAME = "movie-planner-web-viewings-cache";
const DB_VERSION = 1;
const VIEWINGS_STORE = "viewings";
const META_STORE = "meta";

interface ViewingRecord {
  account: string;
  uid: string;
  // Position in the server's own list, so a cached read comes back in the
  // same order a fresh one would.
  seq: number;
  viewing: LoggedViewing;
}

function openViewingsCache(): Promise<IDBDatabase> {
  return openDatabase(DB_NAME, DB_VERSION, (db) => {
    db.createObjectStore(VIEWINGS_STORE, { keyPath: ["account", "uid"] });
    db.createObjectStore(META_STORE, { keyPath: "account" });
  });
}

function accountRange(account: string): IDBKeyRange {
  return IDBKeyRange.bound([account, ""], [account, "￿"]);
}

export class IndexedDbViewingsCacheStore implements ViewingsCacheStore {
  async load(account: string): Promise<CachedViewings | null> {
    const db = await openViewingsCache();
    try {
      const tx = db.transaction([VIEWINGS_STORE, META_STORE], "readonly");
      const meta = await result<{ fetchedAt: number } | undefined>(
        tx.objectStore(META_STORE).get(account),
      );
      if (!meta) return null;
      const records = await result<ViewingRecord[]>(
        tx.objectStore(VIEWINGS_STORE).getAll(accountRange(account)),
      );
      records.sort((a, b) => a.seq - b.seq);
      return { viewings: records.map((r) => r.viewing), fetchedAt: meta.fetchedAt };
    } finally {
      db.close();
    }
  }

  async replaceAll(account: string, viewings: LoggedViewing[]): Promise<void> {
    const db = await openViewingsCache();
    try {
      const tx = db.transaction([VIEWINGS_STORE, META_STORE], "readwrite");
      const store = tx.objectStore(VIEWINGS_STORE);
      store.delete(accountRange(account));
      viewings.forEach((viewing, seq) => {
        store.put({ account, uid: viewing.uid, seq, viewing } satisfies ViewingRecord);
      });
      tx.objectStore(META_STORE).put({ account, fetchedAt: Date.now() });
      await done(tx);
    } finally {
      db.close();
    }
  }

  async upsert(account: string, viewing: LoggedViewing): Promise<void> {
    const db = await openViewingsCache();
    try {
      const tx = db.transaction([VIEWINGS_STORE, META_STORE], "readwrite");
      const meta = await result(tx.objectStore(META_STORE).get(account));
      if (!meta) return;
      const store = tx.objectStore(VIEWINGS_STORE);
      const existing = await result<ViewingRecord | undefined>(store.get([account, viewing.uid]));
      // A new viewing goes after everything the server listed.
      const seq = existing?.seq ?? Date.now();
      store.put({ account, uid: viewing.uid, seq, viewing } satisfies ViewingRecord);
      await done(tx);
    } finally {
      db.close();
    }
  }

  async remove(account: string, uid: string): Promise<void> {
    const db = await openViewingsCache();
    try {
      const tx = db.transaction(VIEWINGS_STORE, "readwrite");
      tx.objectStore(VIEWINGS_STORE).delete([account, uid]);
      await done(tx);
    } finally {
      db.close();
    }
  }

  async retainOnly(account: string): Promise<void> {
    const db = await openViewingsCache();
    try {
      const tx = db.transaction([VIEWINGS_STORE, META_STORE], "readwrite");
      const accounts = await result<IDBValidKey[]>(tx.objectStore(META_STORE).getAllKeys());
      for (const other of accounts) {
        if (other === account) continue;
        tx.objectStore(VIEWINGS_STORE).delete(accountRange(String(other)));
        tx.objectStore(META_STORE).delete(other);
      }
      await done(tx);
    } finally {
      db.close();
    }
  }
}

// #765: the whole cache, every account, for the Settings button that clears a
// browser's local copy. A page opened afterwards finds nothing cached and waits
// for the server, as it did before there was a cache. A background refresh that
// was already in flight can still write its fresh answer back, which is fine.
export async function clearViewingsCache(
  open: () => Promise<IDBDatabase> = openViewingsCache,
): Promise<void> {
  const db = await open();
  try {
    const tx = db.transaction([VIEWINGS_STORE, META_STORE], "readwrite");
    tx.objectStore(VIEWINGS_STORE).clear();
    tx.objectStore(META_STORE).clear();
    await done(tx);
  } finally {
    db.close();
  }
}

let instance: ViewingsCacheStore | undefined;

export function getViewingsCacheStore(): ViewingsCacheStore {
  instance ??= new IndexedDbViewingsCacheStore();
  return instance;
}

// Bumped by every write this app makes, so a background refresh that started
// before the write can tell its answer may predate it and must not overwrite
// the cache with an older list.
const writeEpochs = new Map<string, number>();

export function writeEpochFor(account: string): number {
  return writeEpochs.get(account) ?? 0;
}

function noteWrite(account: string) {
  writeEpochs.set(account, writeEpochFor(account) + 1);
}

// The three below run from client.ts's own write paths, best-effort like the
// activity log beside them: a cache the browser can't write must never fail
// a save that already succeeded on the server.
export async function cacheViewing(config: CaldavConfig, viewing: LoggedViewing): Promise<void> {
  try {
    const account = await accountKeyFor(config);
    noteWrite(account);
    await getViewingsCacheStore().upsert(account, viewing);
  } catch {
    // Best-effort.
  }
}

export async function uncacheViewing(config: CaldavConfig, uid: string): Promise<void> {
  try {
    const account = await accountKeyFor(config);
    noteWrite(account);
    await getViewingsCacheStore().remove(account, uid);
  } catch {
    // Best-effort.
  }
}

// Called when credentials are saved: whatever calendar they now point at
// keeps its copy, every other one is dropped.
export async function retainViewingsCacheFor(
  config: Pick<CaldavConfig, "baseUrl" | "username">,
): Promise<void> {
  try {
    await getViewingsCacheStore().retainOnly(await accountKeyFor(config));
  } catch {
    // Best-effort.
  }
}
