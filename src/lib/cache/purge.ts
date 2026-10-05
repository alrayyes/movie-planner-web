import { clearViewingsCache } from "../caldav/viewings-cache";

// #765: clears this browser's local copy of the server's data, for a device that
// shows stale or missing viewings. Two things hold such a copy:
//
// - the viewings cache (IndexedDB), the list a page shows before the server
//   answers (caldav/viewings-cache.ts), and
// - the service worker's cache (public/sw.js), the same-origin pages and
//   scripts it falls back to when the network fails.
//
// What it leaves alone is everything that isn't a copy of the server's data:
// the stored credentials (clearing them signs the visitor out, which Settings'
// own form is for), the activity log and its diff baseline (clearing the
// baseline would log the whole calendar as new), and the theme.

// The worker names its cache `movie-planner-web-v1` and bumps the suffix when it
// changes shape, so anything with this prefix is ours and nothing else is.
const SERVICE_WORKER_CACHE_PREFIX = "movie-planner-web";

export interface CacheStorageLike {
  keys(): Promise<string[]>;
  delete(key: string): Promise<boolean>;
}

export interface PurgeDeps {
  clearViewings: () => Promise<void>;
  cacheStorage: CacheStorageLike | undefined;
}

// Cache Storage is a global some contexts lack (an insecure origin, some embedded
// webviews), so the default wiring looks for it on the scope it's given rather
// than assuming it. The scope is a parameter so a test can hand it one.
export function defaultDeps(scope: { caches?: CacheStorageLike }): PurgeDeps {
  return {
    clearViewings: () => clearViewingsCache(),
    cacheStorage: scope.caches,
  };
}

async function clearServiceWorkerCaches(storage: CacheStorageLike | undefined): Promise<void> {
  if (!storage) return;
  const keys = await storage.keys();
  await Promise.all(
    keys
      .filter((key) => key.startsWith(SERVICE_WORKER_CACHE_PREFIX))
      .map((key) => storage.delete(key)),
  );
}

// Both are attempted whatever happens to the other, then the first failure is
// reported: a browser that blocks one still gets the other cleared.
export async function purgeLocalCache(deps: PurgeDeps = defaultDeps(globalThis)): Promise<void> {
  const results = await Promise.allSettled([
    deps.clearViewings(),
    clearServiceWorkerCaches(deps.cacheStorage),
  ]);
  const failed = results.find((result) => result.status === "rejected");
  if (failed) throw failed.reason;
}
