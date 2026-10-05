import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type { LoggedViewing } from "../caldav/types";
import { IndexedDbActivityLogStore } from "./indexeddb-store";
import {
  forgetCaldavSnapshot,
  getCaldavSnapshotStore,
  IndexedDbCaldavSnapshotStore,
} from "./snapshot-store";
import { getActivityLogStore, recordActivity } from "./store";
import type { ActivityLogEntry } from "./types";

// #749: both activity-log stores, run for real on fake-indexeddb so Stryker
// scores them instead of only Playwright. A fresh database per test means every
// test runs the schema upgrade, and deleting waits for every connection to close.
const LOG_DB = "movie-planner-web-activity-log";
const SNAPSHOT_DB = "movie-planner-web-caldav-snapshot";

const request = <T>(r: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });

const deleteDatabase = (name: string) =>
  new Promise<void>((resolve, reject) => {
    const r = indexedDB.deleteDatabase(name);
    r.onsuccess = () => resolve();
    r.onerror = () => reject(r.error);
  });

// A database already at a newer version refuses the store's own open.
async function makeNewer(name: string) {
  await deleteDatabase(name);
  (await request(realOpen(name, 5))).close();
}

let opened = 0;
let closed = 0;
const realOpen = indexedDB.open.bind(indexedDB);
const realClose = IDBDatabase.prototype.close;

beforeEach(async () => {
  await deleteDatabase(LOG_DB);
  await deleteDatabase(SNAPSHOT_DB);
  opened = 0;
  closed = 0;
  IDBDatabase.prototype.close = function (this: IDBDatabase) {
    closed++;
    return realClose.call(this);
  };
  indexedDB.open = ((...args: Parameters<typeof realOpen>) => {
    opened++;
    return realOpen(...args);
  }) as typeof indexedDB.open;
});
afterEach(() => {
  IDBDatabase.prototype.close = realClose;
  indexedDB.open = realOpen;
});

const entry = (uid: string): Omit<ActivityLogEntry, "id"> => ({
  at: "2026-01-01T19:00:00.000Z",
  action: "created",
  uid,
  title: uid,
  actor: "web",
});

describe("IndexedDbActivityLogStore", () => {
  const store = new IndexedDbActivityLogStore();

  test("lists nothing before anything was logged", async () => {
    expect(await store.list()).toEqual([]);
  });

  test("lists the most recent entry first, with an id each", async () => {
    await store.append(entry("one"));
    await store.append(entry("two"));
    const listed = await store.list();
    expect(listed.map((e) => e.uid)).toEqual(["two", "one"]);
    expect(listed.map((e) => e.id)).toEqual([2, 1]);
    expect(listed[0]).toMatchObject({ action: "created", actor: "web", title: "two" });
  });

  test("a limit returns only that many, newest first", async () => {
    for (const uid of ["a", "b", "c"]) await store.append(entry(uid));
    expect((await store.list(2)).map((e) => e.uid)).toEqual(["c", "b"]);
    expect(await store.list(1)).toHaveLength(1);
  });

  test("a limit of zero returns nothing", async () => {
    await store.append(entry("a"));
    expect(await store.list(0)).toEqual([]);
  });

  test("keeps all 500 entries and drops none until the 501st", async () => {
    await seed(500);
    await store.append(entry("501"));
    const listed = await store.list(1000);
    expect(listed).toHaveLength(500);
    // The oldest one went; the 2nd-oldest is the new first.
    expect(listed.at(-1)?.uid).toBe("seed-1");
    expect(listed[0]?.uid).toBe("501");
  });

  test("exactly 500 entries are all kept", async () => {
    await seed(499);
    await store.append(entry("500"));
    const listed = await store.list(1000);
    expect(listed).toHaveLength(500);
    expect(listed.at(-1)?.uid).toBe("seed-0");
  });

  test("trims however far over the cap it is, oldest first", async () => {
    await seed(510);
    await store.append(entry("last"));
    const listed = await store.list(1000);
    expect(listed).toHaveLength(500);
    expect(listed.at(-1)?.uid).toBe("seed-11");
  });

  test("list defaults to the cap", async () => {
    await seed(500);
    expect(await store.list()).toHaveLength(500);
  });

  test("every call closes the connection it opened", async () => {
    await store.append(entry("a"));
    await store.list();
    expect(opened).toBe(2);
    expect(closed).toBe(2);
  });

  test("a failed open rejects", async () => {
    await makeNewer(LOG_DB);
    await expect(store.append(entry("a"))).rejects.toBeDefined();
    await expect(store.list()).rejects.toBeDefined();
  });

  // Puts rows straight in, so a test needn't append 500 times through the store.
  async function seed(count: number) {
    const db = await request(openLog());
    const tx = db.transaction("entries", "readwrite");
    const os = tx.objectStore("entries");
    for (let i = 0; i < count; i++) os.add(entry(`seed-${i}`));
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  }
});

function openLog(): IDBOpenDBRequest {
  const r = realOpen(LOG_DB, 1);
  r.onupgradeneeded = () => {
    r.result.createObjectStore("entries", { keyPath: "id", autoIncrement: true });
  };
  return r;
}

const viewing = (uid: string, title = uid): LoggedViewing => ({
  uid,
  title,
  start: "2026-01-01T19:00:00.000Z",
  end: "2026-01-01T21:30:00.000Z",
  medium: "cinema",
});

describe("IndexedDbCaldavSnapshotStore", () => {
  const store = new IndexedDbCaldavSnapshotStore();

  test("load is null before the first sync", async () => {
    expect(await store.load()).toBeNull();
  });

  test("a synced empty calendar is an empty map, not null", async () => {
    await store.replaceAll([]);
    const loaded = await store.load();
    expect(loaded).toBeInstanceOf(Map);
    expect(loaded?.size).toBe(0);
  });

  test("replaceAll keys every viewing by uid", async () => {
    await store.replaceAll([viewing("a"), viewing("b", "Bee")]);
    const loaded = await store.load();
    expect([...(loaded?.keys() ?? [])].sort()).toEqual(["a", "b"]);
    expect(loaded?.get("b")?.title).toBe("Bee");
  });

  test("replaceAll drops what the last sync held", async () => {
    await store.replaceAll([viewing("old")]);
    await store.replaceAll([viewing("new")]);
    expect([...((await store.load())?.keys() ?? [])]).toEqual(["new"]);
  });

  test("remove drops one uid and keeps the rest", async () => {
    await store.replaceAll([viewing("a"), viewing("b")]);
    await store.remove("a");
    expect([...((await store.load())?.keys() ?? [])]).toEqual(["b"]);
  });

  // Other code and a later version of this one read the database by these names.
  test("keeps viewings by uid and the seeded marker under their documented names", async () => {
    await store.replaceAll([viewing("a")]);
    const db = await request(realOpen(SNAPSHOT_DB));
    try {
      expect([...db.objectStoreNames].sort()).toEqual(["meta", "viewings"]);
      const viewings = await request(db.transaction("viewings").objectStore("viewings").getAll());
      expect(viewings.map((v) => v.uid)).toEqual(["a"]);
      expect(await request(db.transaction("meta").objectStore("meta").get("seeded"))).toBe(true);
    } finally {
      db.close();
    }
  });

  test("remove before any sync leaves it unseeded", async () => {
    await store.remove("a");
    expect(await store.load()).toBeNull();
  });

  test("every call closes the connection it opened", async () => {
    await store.replaceAll([viewing("a")]);
    await store.load();
    await store.remove("a");
    expect(opened).toBe(3);
    expect(closed).toBe(3);
  });

  test("a failed open rejects", async () => {
    await makeNewer(SNAPSHOT_DB);
    await expect(store.load()).rejects.toBeDefined();
    await expect(store.replaceAll([])).rejects.toBeDefined();
    await expect(store.remove("a")).rejects.toBeDefined();
  });
});

describe("the shared helpers", () => {
  test("each store getter returns one shared instance", () => {
    expect(getActivityLogStore()).toBe(getActivityLogStore());
    expect(getActivityLogStore()).toBeInstanceOf(IndexedDbActivityLogStore);
    expect(getCaldavSnapshotStore()).toBe(getCaldavSnapshotStore());
    expect(getCaldavSnapshotStore()).toBeInstanceOf(IndexedDbCaldavSnapshotStore);
  });

  test("recordActivity appends to the shared log", async () => {
    await recordActivity(entry("logged"));
    expect((await getActivityLogStore().list()).map((e) => e.uid)).toEqual(["logged"]);
  });

  test("forgetCaldavSnapshot removes the uid from the shared snapshot", async () => {
    await getCaldavSnapshotStore().replaceAll([viewing("a"), viewing("b")]);
    await forgetCaldavSnapshot("a");
    expect([...((await getCaldavSnapshotStore().load())?.keys() ?? [])]).toEqual(["b"]);
  });

  describe("when storage is unavailable", () => {
    beforeEach(() => {
      indexedDB.open = (() => {
        throw new Error("storage disabled");
      }) as typeof indexedDB.open;
    });

    test("recordActivity never throws", async () => {
      await expect(recordActivity(entry("x"))).resolves.toBeUndefined();
    });

    test("forgetCaldavSnapshot never throws", async () => {
      await expect(forgetCaldavSnapshot("x")).resolves.toBeUndefined();
    });
  });
});
