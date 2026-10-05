import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { registerServiceWorker } from "./register-service-worker";

// #749: registration waits for the window's load event and is skipped without the API.
describe("registerServiceWorker", () => {
  const g = globalThis as unknown as Record<string, unknown>;
  const KEYS = ["navigator", "window"];
  let saved: Record<string, unknown>;
  let listeners: Record<string, () => void>;
  let registered: string[];

  const install = (withServiceWorker: boolean) => {
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: withServiceWorker
        ? { serviceWorker: { register: (url: string) => registered.push(url) } }
        : {},
    });
  };

  beforeEach(() => {
    saved = Object.fromEntries(
      KEYS.map((k) => [k, Object.getOwnPropertyDescriptor(globalThis, k)]),
    );
    listeners = {};
    registered = [];
    g.window = {
      addEventListener: (type: string, fn: () => void) => {
        listeners[type] = fn;
      },
    };
  });
  afterEach(() => {
    for (const k of KEYS) {
      const descriptor = saved[k] as PropertyDescriptor | undefined;
      if (descriptor) Object.defineProperty(globalThis, k, descriptor);
      else delete g[k];
    }
  });

  test("registers /sw.js once the window has loaded, not before", () => {
    install(true);
    registerServiceWorker();
    expect(registered).toEqual([]);
    listeners.load?.();
    expect(registered).toEqual(["/sw.js"]);
  });

  test("does nothing in a browser without service workers", () => {
    install(false);
    registerServiceWorker();
    expect(listeners.load).toBeUndefined();
  });

  test("does nothing where there is no navigator at all", () => {
    Object.defineProperty(globalThis, "navigator", { configurable: true, value: undefined });
    registerServiceWorker();
    expect(listeners.load).toBeUndefined();
  });
});
