import { describe, expect, test } from "bun:test";
import type { DeleteOptions } from "./client";
import { purgeCalendar } from "./purge-calendar";
import type { CaldavConfig, LoggedViewing } from "./types";

// #835: deletes every viewing on the visitor's calendar.
const CONFIG: CaldavConfig = { baseUrl: "https://c.example/", username: "me", password: "pw" };
const viewing = (uid: string): LoggedViewing => ({
  uid,
  title: uid,
  start: "2026-09-20T17:30:00Z",
  end: "2026-09-20T19:45:00Z",
  medium: "cinema",
});

function deps(uids: string[], failing: string[] = []) {
  const removed: string[] = [];
  const progress: [number, number][] = [];
  const calls: { uid: string; options?: DeleteOptions }[] = [];
  let cleared = 0;
  return {
    calls,
    removed,
    progress,
    cleared: () => cleared,
    deps: {
      listFresh: async () => uids.map(viewing),
      remove: async (_config: CaldavConfig, uid: string, options?: DeleteOptions) => {
        calls.push({ uid, options });
        if (failing.includes(uid)) throw new Error(`boom ${uid}`);
        removed.push(uid);
      },
      clearCache: async () => {
        cleared++;
      },
    },
  };
}

describe("purgeCalendar", () => {
  test("deletes every viewing and reports the count", async () => {
    const d = deps(["a", "b", "c"]);
    const result = await purgeCalendar(CONFIG, () => {}, d.deps);
    expect(d.removed.sort()).toEqual(["a", "b", "c"]);
    expect(result).toStrictEqual({ deleted: 3, failed: 0, firstError: undefined });
  });

  test("keeps going past a failure and counts it", async () => {
    const d = deps(["a", "b", "c"], ["b"]);
    const result = await purgeCalendar(CONFIG, () => {}, d.deps);
    expect(d.removed.sort()).toEqual(["a", "c"]);
    expect(result).toEqual({ deleted: 2, failed: 1, firstError: "boom b" });
  });

  test("reports the first failure, not the last", async () => {
    const d = deps(["a", "b", "c"], ["a", "c"]);
    const result = await purgeCalendar(CONFIG, () => {}, d.deps);
    expect(result).toEqual({ deleted: 1, failed: 2, firstError: "boom a" });
  });

  test("reports a failure that isn't an Error as text", async () => {
    const d = deps(["a"]);
    const result = await purgeCalendar(CONFIG, () => {}, {
      ...d.deps,
      remove: () => Promise.reject("nope"),
    });
    expect(result).toEqual({ deleted: 0, failed: 1, firstError: "nope" });
  });

  test("reports progress as done of total after each delete", async () => {
    const d = deps(["a", "b"]);
    const seen: [number, number][] = [];
    await purgeCalendar(CONFIG, (done, total) => seen.push([done, total]), d.deps);
    expect(seen).toEqual([
      [1, 2],
      [2, 2],
    ]);
  });

  test("clears the local cache afterwards, even when some deletes failed", async () => {
    const d = deps(["a", "b"], ["a"]);
    await purgeCalendar(CONFIG, () => {}, d.deps);
    expect(d.cleared()).toBe(1);
  });

  test("hands each delete the title it listed and a timeout for a slow server", async () => {
    const d = deps(["a"]);
    await purgeCalendar(CONFIG, () => {}, d.deps);
    expect(d.calls).toEqual([{ uid: "a", options: { title: "a", timeoutMs: 30_000 } }]);
  });

  test("never has more than two deletes in flight, and uses both when it can", async () => {
    let inFlight = 0;
    let peak = 0;
    const d = deps(Array.from({ length: 10 }, (_, i) => `u${i}`));
    await purgeCalendar(CONFIG, () => {}, {
      ...d.deps,
      remove: async () => {
        peak = Math.max(peak, ++inFlight);
        await new Promise((resolve) => setTimeout(resolve, 5));
        inFlight--;
      },
    });
    expect(peak).toBe(2);
  });

  test("starts no more workers than there are viewings", async () => {
    let inFlight = 0;
    let peak = 0;
    const d = deps(["a"]);
    await purgeCalendar(CONFIG, () => {}, {
      ...d.deps,
      remove: async () => {
        peak = Math.max(peak, ++inFlight);
        await new Promise((resolve) => setTimeout(resolve, 5));
        inFlight--;
      },
    });
    expect(peak).toBe(1);
  });

  test("an empty calendar deletes nothing", async () => {
    const d = deps([]);
    expect(await purgeCalendar(CONFIG, () => {}, d.deps)).toEqual({ deleted: 0, failed: 0 });
  });
});
