import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { reloadOnBfcacheRestore } from "./bfcache";

// #749: a bfcache restore (`persisted`) reloads; a normal load already did.
describe("reloadOnBfcacheRestore", () => {
  const original = (globalThis as { window?: unknown }).window;
  let listeners: Record<string, (event: { persisted: boolean }) => void>;

  beforeEach(() => {
    listeners = {};
    (globalThis as { window?: unknown }).window = {
      addEventListener: (type: string, fn: (event: { persisted: boolean }) => void) => {
        listeners[type] = fn;
      },
    };
  });
  afterEach(() => {
    (globalThis as { window?: unknown }).window = original;
  });

  test("reloads when the page was restored from the back/forward cache", () => {
    let reloads = 0;
    reloadOnBfcacheRestore(() => reloads++);
    listeners.pageshow?.({ persisted: true });
    expect(reloads).toBe(1);
  });

  test("does not reload on an ordinary page load", () => {
    let reloads = 0;
    reloadOnBfcacheRestore(() => reloads++);
    listeners.pageshow?.({ persisted: false });
    expect(reloads).toBe(0);
  });
});
