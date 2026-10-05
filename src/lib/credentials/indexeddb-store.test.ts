import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { accountKeyFor, IndexedDbViewingsCacheStore } from "../caldav/viewings-cache";
import { IndexedDbCredentialsStore } from "./indexeddb-store";
import { CREDENTIALS_CONNECTED_EVENT, getCredentialsStore } from "./store";
import type { Credentials } from "./types";

// #749: the credentials store on fake-indexeddb, so Stryker scores it instead
// of only Playwright. A fresh database per test runs the schema upgrade too.
const DB_NAME = "movie-planner-web";
const store = new IndexedDbCredentialsStore();

const credentials: Credentials = {
  caldavUrl: "https://cal.example/dav/",
  caldavUsername: "me",
  caldavPassword: "secret",
  omdbApiKey: "key",
  webMcpEnabled: true,
};

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

let opened = 0;
let closed = 0;
const realOpen = indexedDB.open.bind(indexedDB);
const realClose = IDBDatabase.prototype.close;

beforeEach(async () => {
  await deleteDatabase(DB_NAME);
  await deleteDatabase("movie-planner-web-viewings-cache");
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

describe("IndexedDbCredentialsStore", () => {
  test("has nothing before the first save", async () => {
    expect(await store.get()).toBeNull();
  });

  test("gives back exactly what was saved", async () => {
    await store.save(credentials);
    expect(await store.get()).toEqual(credentials);
  });

  test("a later save replaces the earlier one whole", async () => {
    await store.save(credentials);
    await store.save({
      caldavUrl: "https://other.example/",
      caldavUsername: "you",
      caldavPassword: "pw",
    });
    expect(await store.get()).toEqual({
      caldavUrl: "https://other.example/",
      caldavUsername: "you",
      caldavPassword: "pw",
    });
  });

  // The record's place is part of how an existing browser finds it again.
  test("keeps the record under its documented database, store and key", async () => {
    await store.save(credentials);
    const db = await request(realOpen(DB_NAME));
    try {
      expect([...db.objectStoreNames]).toEqual(["credentials"]);
      const stored = await request(
        db.transaction("credentials").objectStore("credentials").get("current"),
      );
      expect(stored).toEqual(credentials);
    } finally {
      db.close();
    }
  });

  test("every call closes the connection it opened", async () => {
    await store.save(credentials);
    await store.get();
    // save opens the credentials database and the viewings cache's.
    expect(closed).toBe(opened);
    expect(opened).toBeGreaterThanOrEqual(3);
  });

  test("a failed open rejects instead of hanging", async () => {
    (await request(realOpen(DB_NAME, 5))).close();
    await expect(store.get()).rejects.toBeDefined();
    await expect(store.save(credentials)).rejects.toBeDefined();
  });

  test("saving keeps the viewings cached for this calendar and drops the others", async () => {
    const cache = new IndexedDbViewingsCacheStore();
    const mine = await accountKeyFor({ baseUrl: credentials.caldavUrl, username: "me" });
    const viewing = {
      uid: "u",
      title: "Dune",
      start: "2026-01-01T19:00:00.000Z",
      end: "2026-01-01T21:00:00.000Z",
      medium: "cinema",
    };
    await cache.replaceAll(mine, [viewing]);
    await cache.replaceAll("someone-else", [viewing]);
    await store.save(credentials);
    expect((await cache.load(mine))?.viewings).toHaveLength(1);
    expect(await cache.load("someone-else")).toBeNull();
  });
});

describe("getCredentialsStore", () => {
  test("is one shared store", () => {
    expect(getCredentialsStore()).toBe(getCredentialsStore());
    expect(getCredentialsStore()).toBeInstanceOf(IndexedDbCredentialsStore);
  });

  // Other pages listen for it by this name, so a rename here is a breaking change.
  test("announces a first save under a fixed event name", () => {
    expect(CREDENTIALS_CONNECTED_EVENT).toBe("movie-planner-web:credentials-connected");
  });
});
