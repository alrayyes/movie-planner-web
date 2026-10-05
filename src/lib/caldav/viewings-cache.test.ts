import { describe, expect, test } from "bun:test";
import { clearViewingsCache } from "./viewings-cache";

// #765: clearing the cache is IndexedDB work, which bun doesn't have, so the
// database is a fake that records what it was asked to do. The e2e test
// (tests/purge-cache.spec.ts) does it against a real browser's IndexedDB; this
// pins the details that one can't tell apart from a lucky pass: both stores, in
// one write transaction, waited for, and the database closed whatever happens.
interface FakeTransaction {
  error?: Error;
  oncomplete?: () => void;
  onerror?: () => void;
  onabort?: () => void;
  objectStore: (name: string) => { clear: () => void };
}

function fakeDatabase(
  log: string[],
  how: { failWith?: Error; abort?: boolean; holdOpen?: { tx?: FakeTransaction } } = {},
) {
  const database = {
    transaction(stores: string[], mode: string) {
      log.push(`transaction ${stores.join(",")} ${mode}`);
      const tx: FakeTransaction = {
        objectStore: (name) => ({ clear: () => log.push(`clear ${name}`) }),
      };
      if (how.holdOpen) {
        how.holdOpen.tx = tx;
        return tx;
      }
      if (how.failWith) tx.error = how.failWith;
      // The handlers are set by the time this runs: it waits for the stack to unwind.
      queueMicrotask(() => {
        if (!how.failWith) tx.oncomplete?.();
        else if (how.abort) tx.onabort?.();
        else tx.onerror?.();
      });
      return tx;
    },
    close: () => log.push("close"),
  };
  return database as unknown as IDBDatabase;
}

describe("clearViewingsCache", () => {
  test("clears the viewings and the per-account markers in one write transaction, then closes", async () => {
    const log: string[] = [];
    await clearViewingsCache(async () => fakeDatabase(log));
    expect(log).toEqual([
      "transaction viewings,meta readwrite",
      "clear viewings",
      "clear meta",
      "close",
    ]);
  });

  test("doesn't finish until the transaction does", async () => {
    const log: string[] = [];
    const held: { tx?: FakeTransaction } = {};
    let finished = false;
    const cleared = clearViewingsCache(async () => fakeDatabase(log, { holdOpen: held })).then(
      () => {
        finished = true;
      },
    );
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(finished).toBe(false);
    expect(log).not.toContain("close");

    held.tx?.oncomplete?.();
    await cleared;
    expect(finished).toBe(true);
    expect(log.at(-1)).toBe("close");
  });

  test("closes the database and reports the error when the transaction fails", async () => {
    const log: string[] = [];
    await expect(
      clearViewingsCache(async () => fakeDatabase(log, { failWith: new Error("quota") })),
    ).rejects.toThrow("quota");
    expect(log.at(-1)).toBe("close");
  });

  test("an aborted transaction rejects with its error too", async () => {
    const log: string[] = [];
    await expect(
      clearViewingsCache(async () =>
        fakeDatabase(log, { failWith: new Error("aborted"), abort: true }),
      ),
    ).rejects.toThrow("aborted");
    expect(log.at(-1)).toBe("close");
  });
});
