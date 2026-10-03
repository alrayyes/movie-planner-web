import { describe, expect, test } from "bun:test";
import type { CaldavConfig, LoggedViewing } from "./types";
import type { CachedViewings, ViewingsCacheStore } from "./viewings-cache";
import { createViewingsSource } from "./viewings-source";

const CONFIG: CaldavConfig = {
  baseUrl: "https://caldav.example.com/calendars/me/movies/",
  username: "me",
  password: "secret",
};

const DUNE: LoggedViewing = {
  uid: "dune",
  title: "Dune",
  start: "2026-01-01T19:00:00.000Z",
  end: "2026-01-01T21:30:00.000Z",
  medium: "cinema",
};
const ANORA: LoggedViewing = { ...DUNE, uid: "anora", title: "Anora" };

// No fake-indexeddb in this project (the real IndexedDB stores are covered by
// Playwright), so this fake exercises the source's own contract with the store.
function fakeStore(initial: LoggedViewing[] | null) {
  let state: CachedViewings | null = initial ? { viewings: initial, fetchedAt: 1 } : null;
  const store = {
    saved: [] as LoggedViewing[][],
    failLoad: false,
    async load(): Promise<CachedViewings | null> {
      if (store.failLoad) throw new Error("idb unavailable");
      return state;
    },
    async replaceAll(_account: string, viewings: LoggedViewing[]) {
      store.saved.push(viewings);
      state = { viewings, fetchedAt: 2 };
    },
  };
  return store;
}

// A fetch the test resolves by hand, so "cached data came back first" is a
// fact about ordering, not about timing.
function deferredFetch() {
  let calls = 0;
  let resolve!: (v: LoggedViewing[]) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<LoggedViewing[]>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return {
    get calls() {
      return calls;
    },
    fetchAll: () => {
      calls += 1;
      return promise;
    },
    resolve,
    reject,
  };
}

function source(
  store: ReturnType<typeof fakeStore>,
  fetchAll: () => Promise<LoggedViewing[]>,
  epoch: { value: number } = { value: 0 },
) {
  return createViewingsSource({
    fetchAll,
    store: store as unknown as ViewingsCacheStore,
    accountKey: async () => "account-1",
    writeEpoch: () => epoch.value,
  });
}

const tick = () => new Promise((r) => setTimeout(r, 0));

describe("listAllViewings", () => {
  test("with nothing cached, waits for the network, saves it and returns it", async () => {
    const store = fakeStore(null);
    const net = deferredFetch();
    const refreshed: LoggedViewing[][] = [];

    const pending = source(store, net.fetchAll).listAll(CONFIG, {
      onRefresh: (v) => refreshed.push(v),
    });
    net.resolve([DUNE]);

    expect(await pending).toEqual([DUNE]);
    expect(store.saved).toEqual([[DUNE]]);
    expect(refreshed).toEqual([]);
  });

  test("with a cache, returns it without waiting for the network", async () => {
    const store = fakeStore([DUNE]);
    const net = deferredFetch(); // never resolves in this test

    const result = await source(store, net.fetchAll).listAll(CONFIG);

    expect(result).toEqual([DUNE]);
    expect(net.calls).toBe(1); // the background refresh started
  });

  test("tells the caller when the refresh differs, and saves it", async () => {
    const store = fakeStore([DUNE]);
    const net = deferredFetch();
    const refreshed: LoggedViewing[][] = [];

    await source(store, net.fetchAll).listAll(CONFIG, { onRefresh: (v) => refreshed.push(v) });
    net.resolve([DUNE, ANORA]);
    await tick();

    expect(refreshed).toEqual([[DUNE, ANORA]]);
    expect(store.saved).toEqual([[DUNE, ANORA]]);
  });

  test("stays quiet when the refresh matches what was cached", async () => {
    const store = fakeStore([DUNE]);
    const net = deferredFetch();
    const refreshed: LoggedViewing[][] = [];

    await source(store, net.fetchAll).listAll(CONFIG, { onRefresh: (v) => refreshed.push(v) });
    net.resolve([{ ...DUNE }]);
    await tick();

    expect(refreshed).toEqual([]);
  });

  test("notices a changed field, not just a changed set of uids", async () => {
    const store = fakeStore([DUNE]);
    const net = deferredFetch();
    const refreshed: LoggedViewing[][] = [];

    await source(store, net.fetchAll).listAll(CONFIG, { onRefresh: (v) => refreshed.push(v) });
    net.resolve([{ ...DUNE, venue: "Grand Vista" }]);
    await tick();

    expect(refreshed).toHaveLength(1);
  });

  test("a failed refresh keeps the cache and is reported, not thrown", async () => {
    const store = fakeStore([DUNE]);
    const net = deferredFetch();
    const errors: unknown[] = [];

    const result = await source(store, net.fetchAll).listAll(CONFIG, {
      onRefreshError: (e) => errors.push(e),
    });
    net.reject(new Error("401"));
    await tick();

    expect(result).toEqual([DUNE]);
    expect(errors).toHaveLength(1);
    expect(store.saved).toEqual([]);
  });

  test("a failed cold fetch rejects, as listViewings did", async () => {
    const store = fakeStore(null);
    const net = deferredFetch();

    const pending = source(store, net.fetchAll).listAll(CONFIG);
    net.reject(new Error("boom"));

    await expect(pending).rejects.toThrow("boom");
  });

  test("callers asking at the same time share one network request", async () => {
    const store = fakeStore(null);
    const net = deferredFetch();
    const s = source(store, net.fetchAll);

    const a = s.listAll(CONFIG);
    const b = s.listAll(CONFIG);
    const c = s.fetchFresh(CONFIG);
    net.resolve([DUNE]);

    expect(await Promise.all([a, b, c])).toEqual([[DUNE], [DUNE], [DUNE]]);
    expect(net.calls).toBe(1);
  });

  test("a newer call doesn't join a request that started before it, and the older answer can't clobber it", async () => {
    const store = fakeStore([DUNE, ANORA]);
    const resolvers: ((v: LoggedViewing[]) => void)[] = [];
    const fetchAll = () => new Promise<LoggedViewing[]>((resolve) => resolvers.push(resolve));
    const s = source(store, fetchAll);
    const first: LoggedViewing[][] = [];
    const second: LoggedViewing[][] = [];

    await s.listAll(CONFIG, { onRefresh: (v) => first.push(v) });
    await tick();
    await s.listAll(CONFIG, { onRefresh: (v) => second.push(v) });
    await tick();
    expect(resolvers).toHaveLength(2); // the second call started its own request

    resolvers[1]?.([DUNE]); // the newer one answers first: ANORA was removed
    await tick();
    resolvers[0]?.([DUNE, ANORA]); // the older answer, from before the removal
    await tick();

    expect(second).toEqual([[DUNE]]);
    expect(first).toEqual([]);
    expect(store.saved).toEqual([[DUNE]]); // the stale list never reached the cache
  });

  test("stays silent once the caller's signal has aborted", async () => {
    const store = fakeStore([DUNE]);
    const net = deferredFetch();
    const refreshed: LoggedViewing[][] = [];
    const controller = new AbortController();

    await source(store, net.fetchAll).listAll(CONFIG, {
      signal: controller.signal,
      onRefresh: (v) => refreshed.push(v),
    });
    controller.abort();
    net.resolve([DUNE, ANORA]);
    await tick();

    expect(refreshed).toEqual([]);
  });

  test("an aborted cold load rejects with AbortError", async () => {
    const store = fakeStore(null);
    const net = deferredFetch();
    const controller = new AbortController();

    const pending = source(store, net.fetchAll).listAll(CONFIG, { signal: controller.signal });
    controller.abort();

    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  });

  test("drops a refresh that raced a local write, so it can't bring back a stale row", async () => {
    const store = fakeStore([DUNE]);
    const net = deferredFetch();
    const epoch = { value: 0 };
    const refreshed: LoggedViewing[][] = [];

    await source(store, net.fetchAll, epoch).listAll(CONFIG, {
      onRefresh: (v) => refreshed.push(v),
    });
    epoch.value += 1; // a create/edit/delete landed while the REPORT was out
    net.resolve([DUNE]);
    await tick();

    expect(refreshed).toEqual([]);
    expect(store.saved).toEqual([]);
  });

  test("falls back to the network when the cache can't be read", async () => {
    const store = fakeStore([DUNE]);
    store.failLoad = true;
    const net = deferredFetch();

    const pending = source(store, net.fetchAll).listAll(CONFIG);
    net.resolve([ANORA]);

    expect(await pending).toEqual([ANORA]);
  });
});

describe("fetchFreshViewings", () => {
  test("always goes to the network, even with a cache, and saves the result", async () => {
    const store = fakeStore([DUNE]);
    const net = deferredFetch();

    const pending = source(store, net.fetchAll).fetchFresh(CONFIG);
    net.resolve([DUNE, ANORA]);

    expect(await pending).toEqual([DUNE, ANORA]);
    expect(store.saved).toEqual([[DUNE, ANORA]]);
  });
});
