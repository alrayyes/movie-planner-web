import { describe, expect, test } from "bun:test";
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
  let cleared = 0;
  return {
    removed,
    progress,
    cleared: () => cleared,
    deps: {
      listFresh: async () => uids.map(viewing),
      remove: async (_config: CaldavConfig, uid: string) => {
        if (failing.includes(uid)) throw new Error("boom");
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
    expect(result).toEqual({ deleted: 3, failed: 0 });
  });

  test("keeps going past a failure and counts it", async () => {
    const d = deps(["a", "b", "c"], ["b"]);
    const result = await purgeCalendar(CONFIG, () => {}, d.deps);
    expect(d.removed.sort()).toEqual(["a", "c"]);
    expect(result).toEqual({ deleted: 2, failed: 1 });
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

  test("an empty calendar deletes nothing", async () => {
    const d = deps([]);
    expect(await purgeCalendar(CONFIG, () => {}, d.deps)).toEqual({ deleted: 0, failed: 0 });
  });
});
