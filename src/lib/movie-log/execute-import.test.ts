import { afterEach, describe, expect, mock, test } from "bun:test";
import { CaldavRequestFailedError } from "../caldav/errors";
import type { Credentials } from "../credentials/types";
import { type ExecuteImportDeps, executeImport } from "./execute-import";
import type { ImportRow } from "./import-rows";

// #842: writes the checked rows one at a time and reports progress after each.
const CREDENTIALS = { caldavUrl: "https://c.example/" } as Credentials;
const row = (title: string): ImportRow => ({ title, date: "2026-01-01", medium: "cinema" });
const create = (n: number, title = `T${n}`) => ({ rowNumber: n, row: row(title) });
const update = (uid: string) => ({
  entry: { rowNumber: 9, uid, title: uid, changes: [] },
  current: { uid } as never,
  approvedFields: new Set<never>(),
});

function deps(overrides: Partial<ExecuteImportDeps> = {}): ExecuteImportDeps {
  return {
    create: async () => {},
    update: async () => {},
    sleep: async () => {},
    ...overrides,
  };
}

describe("executeImport", () => {
  test("writes every create and update and counts them", async () => {
    const written: string[] = [];
    const result = await executeImport(
      CREDENTIALS,
      { creates: [create(1), create(2)], updates: [update("u1")] },
      () => {},
      deps({
        create: async (_c, r) => void written.push(r.title),
        update: async (_c, _cur, entry) => void written.push(entry.uid),
      }),
    );
    expect(written).toEqual(["T1", "T2", "u1"]);
    expect(result).toEqual({ imported: 2, updated: 1, failed: 0 });
  });

  test("reports progress as done of total after each write", async () => {
    const seen: [number, number][] = [];
    await executeImport(
      CREDENTIALS,
      { creates: [create(1), create(2)], updates: [update("u1")] },
      (done, total) => seen.push([done, total]),
      deps(),
    );
    expect(seen).toEqual([
      [1, 3],
      [2, 3],
      [3, 3],
    ]);
  });

  test("writes one at a time", async () => {
    let inFlight = 0;
    let peak = 0;
    await executeImport(
      CREDENTIALS,
      { creates: [create(1), create(2), create(3)], updates: [] },
      () => {},
      deps({
        create: async () => {
          peak = Math.max(peak, ++inFlight);
          await new Promise((resolve) => setTimeout(resolve, 2));
          inFlight--;
        },
      }),
    );
    expect(peak).toBe(1);
  });

  test("counts a failure and keeps going", async () => {
    const result = await executeImport(
      CREDENTIALS,
      { creates: [create(1, "bad"), create(2)], updates: [update("u1")] },
      () => {},
      deps({
        create: async (_c, r) => {
          if (r.title === "bad") throw new Error("boom");
        },
        update: async () => {
          throw new Error("boom");
        },
      }),
    );
    expect(result).toEqual({ imported: 1, updated: 0, failed: 2 });
  });

  test("waits and retries a 429 instead of failing the row", async () => {
    const slept: number[] = [];
    let attempts = 0;
    const result = await executeImport(
      CREDENTIALS,
      { creates: [create(1)], updates: [] },
      () => {},
      deps({
        create: async () => {
          if (attempts++ === 0) throw new CaldavRequestFailedError("slow down", 429, 1500);
        },
        sleep: async (ms) => void slept.push(ms),
      }),
    );
    expect(slept).toEqual([1500]);
    expect(result).toEqual({ imported: 1, updated: 0, failed: 0 });
  });

  test("an empty batch writes nothing and reports no progress", async () => {
    const seen: number[] = [];
    const result = await executeImport(
      CREDENTIALS,
      { creates: [], updates: [] },
      (done) => seen.push(done),
      deps(),
    );
    expect(seen).toEqual([]);
    expect(result).toEqual({ imported: 0, updated: 0, failed: 0 });
  });
});

describe("executeImport with the real writers", () => {
  const realFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = realFetch;
  });
  const credentials = {
    caldavUrl: "https://c.example/cal/",
    caldavUsername: "me",
    caldavPassword: "pw",
  } as Credentials;

  test("creates and updates through CalDAV PUTs", async () => {
    const puts: string[] = [];
    globalThis.fetch = mock(async (url: string, init?: RequestInit) => {
      if (init?.method === "PUT") puts.push(url);
      return new Response("", { status: init?.method === "GET" ? 404 : 201 });
    }) as unknown as typeof fetch;

    await executeImport(
      credentials,
      {
        creates: [create(1)],
        updates: [
          {
            entry: { rowNumber: 2, uid: "u1", title: "Dune", changes: [] },
            current: {
              uid: "u1",
              title: "Dune",
              start: "2026-01-01T19:00:00.000Z",
              end: "2026-01-01T21:00:00.000Z",
              medium: "cinema",
            },
            approvedFields: new Set(),
          },
        ],
      },
      () => {},
    );
    expect(puts).toHaveLength(2);
    expect(puts[1]).toContain("/cal/u1.ics");
  });

  // #935: the retry itself is retry.test.ts and the wrapping is the test above,
  // but this is the one that shows a real PUT's 429 reaches it.
  test("waits out a 429 on a real PUT and still writes the row", async () => {
    let attempts = 0;
    globalThis.fetch = mock(async (_url: string, init?: RequestInit) => {
      if (init?.method !== "PUT") return new Response("", { status: 404 });
      attempts += 1;
      return attempts === 1
        ? new Response("", { status: 429, headers: { "Retry-After": "0" } })
        : new Response("", { status: 201 });
    }) as unknown as typeof fetch;

    const result = await executeImport(
      credentials,
      { creates: [create(1)], updates: [] },
      () => {},
    );

    expect(attempts).toBe(2);
    expect(result).toEqual({ imported: 1, updated: 0, failed: 0 });
  });
});
