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

// A fake server that forgets a viewing once it is deleted. `failing` throws on
// every delete. `stuck` answers a delete with success but keeps listing the
// viewing, as a 404 on a path that isn't the event's does. `stuckOnce` does
// that on the first delete only.
function deps(
  uids: string[],
  failing: string[] = [],
  stuck: string[] = [],
  stuckOnce: string[] = [],
) {
  const removed: string[] = [];
  const gone = new Set<string>();
  const attempts = new Map<string, number>();
  const calls: { uid: string; options?: DeleteOptions }[] = [];
  let cleared = 0;
  return {
    calls,
    removed,
    attempts,
    cleared: () => cleared,
    deps: {
      listFresh: async () => uids.filter((uid) => !gone.has(uid)).map(viewing),
      remove: async (_config: CaldavConfig, uid: string, options?: DeleteOptions) => {
        calls.push({ uid, options });
        attempts.set(uid, (attempts.get(uid) ?? 0) + 1);
        if (failing.includes(uid)) throw new Error(`boom ${uid}`);
        removed.push(uid);
        if (stuck.includes(uid)) return;
        if (stuckOnce.includes(uid) && attempts.get(uid) === 1) return;
        gone.add(uid);
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

  // #859: a delete that answers success can still leave the viewing on the
  // server (a 404 on a path that isn't the event's reads as "already gone").
  // The purge asks the server what is left instead of trusting its own count.
  test("lists again after deleting and deletes what the server still lists", async () => {
    const d = deps(["a", "b", "c"], [], [], ["b"]);
    const result = await purgeCalendar(CONFIG, () => {}, d.deps);
    expect(d.attempts.get("b")).toBe(2);
    expect(result).toEqual({ deleted: 3, failed: 0 });
  });

  test("counts a viewing the server keeps listing as failed, and says why", async () => {
    const d = deps(["a", "b", "c"], [], ["b"]);
    const result = await purgeCalendar(CONFIG, () => {}, d.deps);
    expect(result).toEqual({
      deleted: 2,
      failed: 1,
      firstError: "The server still lists 1 viewing after deleting it.",
    });
  });

  test("says how many when the server keeps listing several", async () => {
    const d = deps(["a", "b", "c"], [], ["a", "b"]);
    const result = await purgeCalendar(CONFIG, () => {}, d.deps);
    expect(result.firstError).toBe("The server still lists 2 viewings after deleting them.");
  });

  test("gives up on a viewing once a pass removes nothing more, rather than looping", async () => {
    const d = deps(["a", "b"], [], ["b"]);
    await purgeCalendar(CONFIG, () => {}, d.deps);
    expect(d.attempts.get("b")).toBe(2);
  });

  test("never makes more than three delete passes, however the listing moves", async () => {
    let listings = 0;
    let deletes = 0;
    // Shrinks every time it is asked, so a pass always looks like progress.
    await purgeCalendar(CONFIG, () => {}, {
      listFresh: async () => {
        listings++;
        return Array.from({ length: 20 - listings }, (_, i) => viewing(`u${i}`));
      },
      remove: async () => {
        deletes++;
      },
      clearCache: async () => {},
    });
    expect(listings).toBe(4);
    expect(deletes).toBe(19 + 18 + 17);
  });

  test("a failure that persists keeps its own message over the generic one", async () => {
    const d = deps(["a", "b"], ["b"]);
    const result = await purgeCalendar(CONFIG, () => {}, d.deps);
    expect(result.firstError).toBe("boom b");
  });

  test("clears the local cache even when listing again fails", async () => {
    const d = deps(["a", "b"]);
    let listings = 0;
    const attempt = purgeCalendar(CONFIG, () => {}, {
      ...d.deps,
      listFresh: async () => {
        if (++listings > 1) throw new Error("server went away");
        return [viewing("a"), viewing("b")];
      },
    });
    await expect(attempt).rejects.toThrow("server went away");
    expect(d.cleared()).toBe(1);
  });

  test("asks the server twice for a clean purge: before, and to check", async () => {
    const d = deps(["a", "b", "c"]);
    let listings = 0;
    await purgeCalendar(CONFIG, () => {}, {
      ...d.deps,
      listFresh: async () => {
        listings++;
        return d.deps.listFresh();
      },
    });
    expect(listings).toBe(2);
  });

  test("asks the server only once for an empty calendar", async () => {
    let listings = 0;
    await purgeCalendar(CONFIG, () => {}, {
      listFresh: async () => {
        listings++;
        return [];
      },
      remove: async () => {},
      clearCache: async () => {},
    });
    expect(listings).toBe(1);
  });

  test("hands each delete the address the server listed for it", async () => {
    const d = deps(["a", "b"]);
    await purgeCalendar(CONFIG, () => {}, {
      ...d.deps,
      listFresh: async () => [
        { uid: "a", title: "a", href: "/cal/elsewhere.ics" },
        { uid: "b", title: "b" },
      ],
    });
    expect(d.calls.map((c) => [c.uid, c.options?.href])).toEqual([
      ["a", "/cal/elsewhere.ics"],
      ["b", undefined],
    ]);
  });

  test("an empty calendar deletes nothing", async () => {
    const d = deps([]);
    expect(await purgeCalendar(CONFIG, () => {}, d.deps)).toEqual({ deleted: 0, failed: 0 });
  });
});
