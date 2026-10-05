import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type { LoggedViewing } from "./types";
import {
  accountKeyFor,
  cacheViewing,
  clearViewingsCache,
  getViewingsCacheStore,
  IndexedDbViewingsCacheStore,
  retainViewingsCacheFor,
  uncacheViewing,
  writeEpochFor,
} from "./viewings-cache";

// #749: the real store code against fake-indexeddb, so it is scored by Stryker
// instead of only by Playwright. The other file for this module fakes just the
// database handle, for the transaction plumbing.
const viewing = (uid: string, title = uid): LoggedViewing => ({
  uid,
  title,
  start: "2026-01-01T19:00:00.000Z",
  end: "2026-01-01T21:30:00.000Z",
  medium: "cinema",
});

const store = new IndexedDbViewingsCacheStore();
const DB_NAME = "movie-planner-web-viewings-cache";

// A fresh database per test, so every test runs the schema upgrade too. Deleting
// waits for every open connection to close, so a store that leaks one hangs here.
function deleteDatabase(): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DB_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

function openRaw(version?: number): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, version);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// What is really in the viewings object store, whatever the meta store says.
async function rawViewings(): Promise<{ account: string; uid: string }[]> {
  const db = await openRaw();
  try {
    return await new Promise((resolve, reject) => {
      const request = db.transaction("viewings").objectStore("viewings").getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } finally {
    db.close();
  }
}

// Every connection a store opens must be closed again.
let opened = 0;
let closed = 0;
const realOpen = indexedDB.open.bind(indexedDB);
const realClose = IDBDatabase.prototype.close;

beforeEach(async () => {
  await deleteDatabase();
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

describe("accountKeyFor", () => {
  test("is the SHA-256 of the URL and username, never the password", async () => {
    const bytes = new TextEncoder().encode("https://cal.example/dav/\nme");
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    const expected = [...new Uint8Array(digest)]
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    const key = await accountKeyFor({ baseUrl: "https://cal.example/dav/", username: "me" });
    expect(key).toBe(expected);
    expect(key).toMatch(/^[0-9a-f]{64}$/);
  });

  test("a different username or URL is a different calendar", async () => {
    const a = await accountKeyFor({ baseUrl: "https://cal.example/dav/", username: "me" });
    expect(await accountKeyFor({ baseUrl: "https://cal.example/dav/", username: "you" })).not.toBe(
      a,
    );
    expect(await accountKeyFor({ baseUrl: "https://other.example/dav/", username: "me" })).not.toBe(
      a,
    );
  });

  test("the separator keeps URL and username from running together", async () => {
    const a = await accountKeyFor({ baseUrl: "https://x/ab", username: "c" });
    const b = await accountKeyFor({ baseUrl: "https://x/a", username: "bc" });
    expect(a).not.toBe(b);
  });
});

describe("IndexedDbViewingsCacheStore", () => {
  test("load is null for an account that was never fetched", async () => {
    expect(await store.load("a")).toBeNull();
  });

  test("a cached empty calendar is not the same as never fetched", async () => {
    await store.replaceAll("a", []);
    const loaded = await store.load("a");
    expect(loaded?.viewings).toEqual([]);
  });

  test("replaceAll keeps the order the server gave and stamps fetchedAt", async () => {
    const before = Date.now();
    await store.replaceAll("a", [viewing("z"), viewing("m"), viewing("b")]);
    const loaded = await store.load("a");
    expect(loaded?.viewings.map((v) => v.uid)).toEqual(["z", "m", "b"]);
    expect(loaded?.fetchedAt).toBeGreaterThanOrEqual(before);
    expect(loaded?.fetchedAt).toBeLessThanOrEqual(Date.now());
  });

  test("replaceAll drops what the account held before, and only that account's", async () => {
    await store.replaceAll("a", [viewing("old")]);
    await store.replaceAll("b", [viewing("other")]);
    await store.replaceAll("a", [viewing("new")]);
    expect((await store.load("a"))?.viewings.map((v) => v.uid)).toEqual(["new"]);
    expect((await store.load("b"))?.viewings.map((v) => v.uid)).toEqual(["other"]);
  });

  test("accounts whose names share a prefix stay apart", async () => {
    await store.replaceAll("ab", [viewing("1")]);
    await store.replaceAll("a", [viewing("2")]);
    expect((await store.load("a"))?.viewings.map((v) => v.uid)).toEqual(["2"]);
    expect((await store.load("ab"))?.viewings.map((v) => v.uid)).toEqual(["1"]);
  });

  test("upsert does nothing for an account with no full copy", async () => {
    await store.upsert("a", viewing("x"));
    expect(await store.load("a")).toBeNull();
    expect(await rawViewings()).toEqual([]);
  });

  test("upsert replaces an existing viewing in place, keeping its position", async () => {
    await store.replaceAll("a", [viewing("one"), viewing("two"), viewing("three")]);
    await store.upsert("a", viewing("two", "Renamed"));
    const loaded = await store.load("a");
    expect(loaded?.viewings.map((v) => [v.uid, v.title])).toEqual([
      ["one", "one"],
      ["two", "Renamed"],
      ["three", "three"],
    ]);
  });

  test("upsert puts a new viewing after everything the server listed", async () => {
    await store.replaceAll("a", [viewing("one"), viewing("two")]);
    await store.upsert("a", viewing("fresh"));
    expect((await store.load("a"))?.viewings.map((v) => v.uid)).toEqual(["one", "two", "fresh"]);
  });

  test("a later new viewing sorts after an earlier new one", async () => {
    await store.replaceAll("a", [viewing("one")]);
    await store.upsert("a", viewing("first-new"));
    await new Promise((resolve) => setTimeout(resolve, 3));
    await store.upsert("a", viewing("second-new"));
    expect((await store.load("a"))?.viewings.map((v) => v.uid)).toEqual([
      "one",
      "first-new",
      "second-new",
    ]);
  });

  test("remove drops one viewing and leaves the rest", async () => {
    await store.replaceAll("a", [viewing("one"), viewing("two")]);
    await store.replaceAll("b", [viewing("one")]);
    await store.remove("a", "one");
    expect((await store.load("a"))?.viewings.map((v) => v.uid)).toEqual(["two"]);
    expect((await store.load("b"))?.viewings.map((v) => v.uid)).toEqual(["one"]);
  });

  test("retainOnly drops every other account, copy and marker", async () => {
    await store.replaceAll("keep", [viewing("k")]);
    await store.replaceAll("drop1", [viewing("d1")]);
    await store.replaceAll("drop2", [viewing("d2")]);
    await store.retainOnly("keep");
    expect((await store.load("keep"))?.viewings.map((v) => v.uid)).toEqual(["k"]);
    expect(await store.load("drop1")).toBeNull();
    expect(await store.load("drop2")).toBeNull();
    expect((await rawViewings()).map((r) => r.account)).toEqual(["keep"]);
  });

  test("retainOnly with nothing else cached changes nothing", async () => {
    await store.replaceAll("keep", [viewing("k")]);
    await store.retainOnly("keep");
    expect((await store.load("keep"))?.viewings).toHaveLength(1);
  });
});

describe("connections", () => {
  test("every operation closes the connection it opened", async () => {
    await store.replaceAll("a", [viewing("x")]);
    await store.load("a");
    await store.upsert("a", viewing("y"));
    await store.remove("a", "x");
    await store.retainOnly("a");
    await clearViewingsCache();
    expect(opened).toBe(6);
    expect(closed).toBe(6);
  });

  test("a failed open rejects instead of hanging", async () => {
    // A database already at a newer version refuses the store's open.
    await deleteDatabase();
    const newer = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = realOpen(DB_NAME, 5);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    newer.close();
    await expect(store.load("a")).rejects.toBeDefined();
  });
});

describe("clearViewingsCache against a real database", () => {
  test("empties every account", async () => {
    await store.replaceAll("a", [viewing("x")]);
    await store.replaceAll("b", [viewing("y")]);
    await clearViewingsCache();
    expect(await store.load("a")).toBeNull();
    expect(await store.load("b")).toBeNull();
  });
});

const config = { baseUrl: "https://cal.example/dav/", username: "me", password: "pw" };

describe("the write-path helpers", () => {
  test("getViewingsCacheStore is one shared store", () => {
    expect(getViewingsCacheStore()).toBe(getViewingsCacheStore());
    expect(getViewingsCacheStore()).toBeInstanceOf(IndexedDbViewingsCacheStore);
  });

  test("cacheViewing writes into a full copy and bumps the write epoch by one", async () => {
    const account = await accountKeyFor(config);
    await store.replaceAll(account, [viewing("one")]);
    const epoch = writeEpochFor(account);
    await cacheViewing(config, viewing("two"));
    expect(writeEpochFor(account)).toBe(epoch + 1);
    expect((await store.load(account))?.viewings.map((v) => v.uid)).toEqual(["one", "two"]);
  });

  test("uncacheViewing removes it and bumps the epoch by one", async () => {
    const account = await accountKeyFor(config);
    await store.replaceAll(account, [viewing("one"), viewing("two")]);
    const epoch = writeEpochFor(account);
    await uncacheViewing(config, "one");
    expect(writeEpochFor(account)).toBe(epoch + 1);
    expect((await store.load(account))?.viewings.map((v) => v.uid)).toEqual(["two"]);
  });

  test("an account nobody wrote to is at epoch 0", () => {
    expect(writeEpochFor("never-written")).toBe(0);
  });

  test("retainViewingsCacheFor keeps this calendar and drops the others", async () => {
    const account = await accountKeyFor(config);
    await store.replaceAll(account, [viewing("mine")]);
    await store.replaceAll("someone-else", [viewing("theirs")]);
    await retainViewingsCacheFor(config);
    expect((await store.load(account))?.viewings).toHaveLength(1);
    expect(await store.load("someone-else")).toBeNull();
  });
});

describe("the helpers are best-effort", () => {
  const g = globalThis as unknown as { indexedDB: unknown };
  let original: unknown;
  beforeEach(() => {
    original = g.indexedDB;
    g.indexedDB = {
      open: () => {
        throw new Error("storage disabled");
      },
    };
  });
  afterEach(() => {
    g.indexedDB = original;
  });

  test("cacheViewing never throws when the cache can't be written", async () => {
    await expect(cacheViewing(config, viewing("x"))).resolves.toBeUndefined();
  });

  test("uncacheViewing never throws either", async () => {
    await expect(uncacheViewing(config, "x")).resolves.toBeUndefined();
  });

  test("nor does retainViewingsCacheFor", async () => {
    await expect(retainViewingsCacheFor(config)).resolves.toBeUndefined();
  });

  test("the epoch still moves, so an in-flight refresh knows to hold back", async () => {
    const account = await accountKeyFor(config);
    const epoch = writeEpochFor(account);
    await cacheViewing(config, viewing("x"));
    expect(writeEpochFor(account)).toBe(epoch + 1);
  });
});
