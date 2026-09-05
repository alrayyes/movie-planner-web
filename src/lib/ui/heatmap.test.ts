import { describe, expect, test } from "bun:test";
import type { LoggedViewing } from "../caldav/types";
import { bucketViewingsByLocalDay, groupViewingsByLocalDay } from "./heatmap";

function viewing(uid: string, start: string): LoggedViewing {
  return { uid, title: uid, start, end: start, medium: "cinema" };
}

describe("bucketViewingsByLocalDay", () => {
  test("counts several viewings on one day, one on another, none on a third", () => {
    const now = new Date();
    const dayA = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 10, 0, 0);
    const dayB = new Date(dayA.getTime() + 24 * 60 * 60 * 1000);

    const counts = bucketViewingsByLocalDay([
      viewing("a1", new Date(dayA.getTime()).toISOString()),
      viewing("a2", new Date(dayA.getTime() + 60 * 60 * 1000).toISOString()),
      viewing("a3", new Date(dayA.getTime() + 2 * 60 * 60 * 1000).toISOString()),
      viewing("b1", dayB.toISOString()),
    ]);

    const pad = (n: number) => String(n).padStart(2, "0");
    const keyFor = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

    expect(counts.get(keyFor(dayA))).toBe(3);
    expect(counts.get(keyFor(dayB))).toBe(1);
    // A day with no viewings simply isn't a key — the caller fills in 0
    // for every day in its own displayed range.
    const dayC = new Date(dayB.getTime() + 24 * 60 * 60 * 1000);
    expect(counts.has(keyFor(dayC))).toBe(false);
  });

  test("no viewings at all buckets to an empty map, not an error", () => {
    expect(bucketViewingsByLocalDay([]).size).toBe(0);
  });

  test("buckets by the visitor's own local day, not UTC (the #188 bug class)", () => {
    // A fixed UTC instant whose local day genuinely differs from its
    // UTC day in any timezone but UTC — the expected key is derived
    // from the same local Date accessors the implementation itself
    // must use, not a hardcoded date, so this still means something
    // regardless of which timezone actually runs it.
    const start = "2026-08-06T23:30:00.000Z";
    const localDate = new Date(start);
    const pad = (n: number) => String(n).padStart(2, "0");
    const expectedKey = `${localDate.getFullYear()}-${pad(localDate.getMonth() + 1)}-${pad(localDate.getDate())}`;

    const counts = bucketViewingsByLocalDay([viewing("uid", start)]);

    expect(counts.get(expectedKey)).toBe(1);
  });
});

describe("groupViewingsByLocalDay", () => {
  test("groups the real viewings by day, preserving each one", () => {
    const now = new Date();
    const dayA = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 10, 0, 0);
    const a1 = viewing("a1", dayA.toISOString());
    const a2 = viewing("a2", new Date(dayA.getTime() + 60 * 60 * 1000).toISOString());
    const b1 = viewing("b1", new Date(dayA.getTime() + 24 * 60 * 60 * 1000).toISOString());

    const groups = groupViewingsByLocalDay([a1, a2, b1]);

    const pad = (n: number) => String(n).padStart(2, "0");
    const keyFor = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const dayAGroup = groups.get(keyFor(dayA));
    expect(dayAGroup?.map((v) => v.uid)).toEqual(["a1", "a2"]);
    expect(
      groups.get(keyFor(new Date(dayA.getTime() + 24 * 60 * 60 * 1000)))?.map((v) => v.uid),
    ).toEqual(["b1"]);
  });
});
