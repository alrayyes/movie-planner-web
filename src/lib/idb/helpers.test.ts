import "fake-indexeddb/auto";
import { describe, expect, test } from "bun:test";
import { done, openDatabase, result } from "./helpers";

// #749: plain objects stand in for the request and transaction, so the failure
// handlers run, which a healthy database never lets a test do.
type Handlers = {
  onsuccess?: () => void;
  onerror?: () => void;
  oncomplete?: () => void;
  onabort?: () => void;
};

describe("result", () => {
  test("resolves with the request's result on success", async () => {
    const request = { result: 42 } as unknown as IDBRequest<number> & Handlers;
    const settled = result(request);
    request.onsuccess?.();
    expect(await settled).toBe(42);
  });

  test("rejects with the request's error on failure", async () => {
    const request = { error: new Error("boom") } as unknown as IDBRequest<number> & Handlers;
    const settled = result(request);
    request.onerror?.();
    await expect(settled).rejects.toThrow("boom");
  });
});

describe("done", () => {
  const tx = (error?: Error) => ({ error }) as unknown as IDBTransaction & Handlers;

  test("resolves when the transaction completes", async () => {
    const t = tx();
    const settled = done(t);
    t.oncomplete?.();
    expect(await settled).toBeUndefined();
  });

  test("rejects with the transaction's error when it fails", async () => {
    const t = tx(new Error("failed"));
    const settled = done(t);
    t.onerror?.();
    await expect(settled).rejects.toThrow("failed");
  });

  test("rejects with the transaction's error when it aborts", async () => {
    const t = tx(new Error("aborted"));
    const settled = done(t);
    t.onabort?.();
    await expect(settled).rejects.toThrow("aborted");
  });
});

describe("openDatabase", () => {
  const name = "idb-helpers-test";
  const remove = () =>
    new Promise<void>((resolve) => {
      const r = indexedDB.deleteDatabase(name);
      r.onsuccess = () => resolve();
    });

  test("runs the upgrade on a new database and hands back the connection", async () => {
    await remove();
    const upgraded: number[] = [];
    const db = await openDatabase(name, 1, (created) => {
      upgraded.push(created.version);
      created.createObjectStore("things");
    });
    expect(upgraded).toEqual([1]);
    expect(db.objectStoreNames.contains("things")).toBe(true);
    db.close();
  });

  test("doesn't upgrade again at the same version", async () => {
    await remove();
    (await openDatabase(name, 1, () => {})).close();
    let upgrades = 0;
    (
      await openDatabase(name, 1, () => {
        upgrades++;
      })
    ).close();
    expect(upgrades).toBe(0);
  });

  test("rejects when the stored version is newer", async () => {
    await remove();
    (await openDatabase(name, 3, () => {})).close();
    await expect(openDatabase(name, 1, () => {})).rejects.toBeDefined();
  });
});
