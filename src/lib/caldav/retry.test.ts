import { describe, expect, test } from "bun:test";
import { CaldavRequestFailedError } from "./errors";
import { parseRetryAfter, retryWhenBusy } from "./retry";

// #842: a CalDAV server that answers 423 (locked) or 429 (slow down) is asking
// for a pause, not reporting a bad row.
const busy = (status: number, retryAfterMs?: number) =>
  new CaldavRequestFailedError(`responded ${status}`, status, retryAfterMs);

function flaky(failures: Error[], result = "ok") {
  let calls = 0;
  return {
    calls: () => calls,
    fn: async () => {
      const failure = failures[calls++];
      if (failure) throw failure;
      return result;
    },
  };
}

describe("retryWhenBusy", () => {
  test("returns at once when the first attempt works", async () => {
    const slept: number[] = [];
    const f = flaky([]);
    expect(await retryWhenBusy(f.fn, { sleep: async (ms) => void slept.push(ms) })).toBe("ok");
    expect(slept).toEqual([]);
  });

  test("waits the server's Retry-After, then retries", async () => {
    const slept: number[] = [];
    const f = flaky([busy(429, 2500)]);
    expect(await retryWhenBusy(f.fn, { sleep: async (ms) => void slept.push(ms) })).toBe("ok");
    expect(slept).toEqual([2500]);
    expect(f.calls()).toBe(2);
  });

  test("retries a 423 too, backing off exponentially without a Retry-After", async () => {
    const slept: number[] = [];
    const f = flaky([busy(423), busy(423), busy(429)]);
    await retryWhenBusy(f.fn, { sleep: async (ms) => void slept.push(ms) });
    expect(slept).toEqual([1000, 2000, 4000]);
  });

  test("caps a long Retry-After at thirty seconds", async () => {
    const slept: number[] = [];
    await retryWhenBusy(flaky([busy(429, 600_000)]).fn, {
      sleep: async (ms) => void slept.push(ms),
    });
    expect(slept).toEqual([30_000]);
  });

  test("gives up after four attempts and throws the last error", async () => {
    const f = flaky([busy(429), busy(429), busy(429), busy(423), busy(429)]);
    const error = await retryWhenBusy(f.fn, { sleep: async () => {} }).catch((e) => e);
    expect(f.calls()).toBe(4);
    expect(error.status).toBe(423);
  });

  test("doesn't retry any other failure", async () => {
    for (const failure of [busy(500), busy(404), new Error("network down")]) {
      const f = flaky([failure]);
      await expect(retryWhenBusy(f.fn, { sleep: async () => {} })).rejects.toBe(failure);
      expect(f.calls()).toBe(1);
    }
  });
});

describe("retryWhenBusy without an injected sleep", () => {
  test("really waits the requested time", async () => {
    const started = Date.now();
    await retryWhenBusy(flaky([busy(429, 30)]).fn);
    expect(Date.now() - started).toBeGreaterThanOrEqual(25);
  });
});

describe("parseRetryAfter", () => {
  test("reads multi-digit seconds", () => expect(parseRetryAfter("30")).toBe(30_000));
  test("reads an HTTP date that begins with digits as a date, not seconds", () => {
    const now = Date.parse("2026-10-12T10:00:00Z");
    expect(parseRetryAfter("12 Oct 2026 10:00:07 GMT", now)).toBe(7000);
  });
  test("doesn't read seconds out of the end of other text", () => {
    expect(parseRetryAfter("x3")).toBeUndefined();
  });
  test("ignores surrounding spaces", () => expect(parseRetryAfter(" 3 ")).toBe(3000));
  test("measures an HTTP date against the clock when none is given", () => {
    const wait = parseRetryAfter(new Date(Date.now() + 5000).toUTCString());
    expect(wait).toBeGreaterThan(3000);
    expect(wait).toBeLessThanOrEqual(5000);
  });
  test("reads seconds", () => expect(parseRetryAfter("3")).toBe(3000));
  test("reads an HTTP date relative to now", () => {
    const now = Date.parse("2026-10-12T10:00:00Z");
    expect(parseRetryAfter("Mon, 12 Oct 2026 10:00:07 GMT", now)).toBe(7000);
  });
  test("a date in the past is no wait", () => {
    const now = Date.parse("2026-10-12T10:00:00Z");
    expect(parseRetryAfter("Mon, 12 Oct 2026 09:00:00 GMT", now)).toBe(0);
  });
  test("ignores a missing or unreadable header", () => {
    expect(parseRetryAfter(null)).toBeUndefined();
    expect(parseRetryAfter("soon")).toBeUndefined();
  });
});
