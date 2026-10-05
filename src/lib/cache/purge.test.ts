import { describe, expect, test } from "bun:test";
import { purgeLocalCache } from "./purge";

// #765: the button in Settings that clears this browser's local copy of the
// server's data. What it clears is the viewings cache (IndexedDB, covered by the
// e2e test, since bun has no IndexedDB) and the service worker's cache. This
// is the part that decides what counts as this app's own cache.
function fakeCaches(keys: string[]) {
  const deleted: string[] = [];
  return {
    deleted,
    storage: {
      keys: async () => keys,
      delete: async (key: string) => {
        deleted.push(key);
        return true;
      },
    },
  };
}

describe("purgeLocalCache", () => {
  test("clears the viewings cache", async () => {
    let cleared = 0;
    await purgeLocalCache({
      clearViewings: async () => {
        cleared++;
      },
      cacheStorage: undefined,
    });
    expect(cleared).toBe(1);
  });

  test("deletes this app's service worker caches and no one else's", async () => {
    const { storage, deleted } = fakeCaches([
      "movie-planner-web-v1",
      "movie-planner-web-v2",
      "workbox-precache",
      "other-app",
    ]);
    await purgeLocalCache({ clearViewings: async () => {}, cacheStorage: storage });
    expect(deleted.sort()).toEqual(["movie-planner-web-v1", "movie-planner-web-v2"]);
  });

  test("works where there is no Cache Storage at all", async () => {
    await expect(
      purgeLocalCache({ clearViewings: async () => {}, cacheStorage: undefined }),
    ).resolves.toBeUndefined();
  });

  test("still clears the service worker's cache when the viewings cache fails", async () => {
    const { storage, deleted } = fakeCaches(["movie-planner-web-v1"]);
    await expect(
      purgeLocalCache({
        clearViewings: async () => {
          throw new Error("indexeddb blocked");
        },
        cacheStorage: storage,
      }),
    ).rejects.toThrow("indexeddb blocked");
    expect(deleted).toEqual(["movie-planner-web-v1"]);
  });

  test("still clears the viewings cache when the service worker's fails", async () => {
    let cleared = 0;
    await expect(
      purgeLocalCache({
        clearViewings: async () => {
          cleared++;
        },
        cacheStorage: {
          keys: async () => {
            throw new Error("storage unavailable");
          },
          delete: async () => true,
        },
      }),
    ).rejects.toThrow("storage unavailable");
    expect(cleared).toBe(1);
  });
});
