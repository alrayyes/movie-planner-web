import { describe, expect, test } from "bun:test";
import {
  browserStorage,
  createRefreshAttempts,
  RETRY_AFTER_MS,
  type TriedTitle,
} from "./refresh-attempts";

function memoryStore(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
  };
}

const NOW = 1_700_000_000_000;
const KEY = "movie-planner-web:refresh-tried:acct";
const a: TriedTitle = { uid: "a", imdbId: "tt1" };
const b: TriedTitle = { uid: "b", imdbId: "tt2" };

// #898: remembers which titles OMDb already answered without completing, so a
// bulk refresh doesn't send them again on every press.
describe("createRefreshAttempts", () => {
  test("a title nobody has recorded is not tried", () => {
    const attempts = createRefreshAttempts(memoryStore(), "acct", () => NOW);
    expect(attempts.wasTried(a)).toBe(false);
  });

  test("a recorded title is tried, and only that title", () => {
    const attempts = createRefreshAttempts(memoryStore(), "acct", () => NOW);
    attempts.record([a, b]);
    expect(attempts.wasTried(a)).toBe(true);
    expect(attempts.wasTried(b)).toBe(true);
    expect(attempts.wasTried({ uid: "c", imdbId: "tt3" })).toBe(false);
  });

  // The marker is about the match OMDb was asked for. A different IMDb ID (the
  // visitor picked another film) is a different question and gets asked.
  test("a title whose IMDb ID has changed since is not tried", () => {
    const attempts = createRefreshAttempts(memoryStore(), "acct", () => NOW);
    attempts.record([a]);
    expect(attempts.wasTried({ uid: "a", imdbId: "tt999" })).toBe(false);
    expect(attempts.wasTried({ uid: "a" })).toBe(false);
  });

  test("a title with no IMDb ID is recorded and matched as such", () => {
    const attempts = createRefreshAttempts(memoryStore(), "acct", () => NOW);
    attempts.record([{ uid: "n" }]);
    expect(attempts.wasTried({ uid: "n" })).toBe(true);
    expect(attempts.wasTried({ uid: "n", imdbId: "tt1" })).toBe(false);
  });

  test("it is stored under the account's own key", () => {
    const store = memoryStore();
    createRefreshAttempts(store, "acct", () => NOW).record([a]);
    expect([...store.data.keys()]).toEqual([KEY]);
  });

  test("it survives a new instance on the same store", () => {
    const store = memoryStore();
    createRefreshAttempts(store, "acct", () => NOW).record([a]);
    expect(createRefreshAttempts(store, "acct", () => NOW).wasTried(a)).toBe(true);
  });

  test("another account's record is not this account's", () => {
    const store = memoryStore();
    createRefreshAttempts(store, "acct", () => NOW).record([a]);
    expect(createRefreshAttempts(store, "other", () => NOW).wasTried(a)).toBe(false);
  });

  test("a record just under the retry window still counts, one at it no longer does", () => {
    const store = memoryStore();
    createRefreshAttempts(store, "acct", () => NOW).record([a]);
    expect(createRefreshAttempts(store, "acct", () => NOW + RETRY_AFTER_MS - 1).wasTried(a)).toBe(
      true,
    );
    expect(createRefreshAttempts(store, "acct", () => NOW + RETRY_AFTER_MS).wasTried(a)).toBe(
      false,
    );
  });

  test("the retry window is 30 days", () => {
    expect(RETRY_AFTER_MS).toBe(30 * 24 * 60 * 60 * 1000);
  });

  test("recording again refreshes the date, and keeps the others that are still current", () => {
    const store = memoryStore();
    createRefreshAttempts(store, "acct", () => NOW).record([a, b]);
    createRefreshAttempts(store, "acct", () => NOW + RETRY_AFTER_MS - 10).record([a]);
    const later = createRefreshAttempts(store, "acct", () => NOW + RETRY_AFTER_MS + 5);
    expect(later.wasTried(a)).toBe(true);
    expect(later.wasTried(b)).toBe(false);
  });

  test("recording keeps the markers of other titles that are still current", () => {
    const store = memoryStore();
    createRefreshAttempts(store, "acct", () => NOW).record([a, b]);
    createRefreshAttempts(store, "acct", () => NOW + 1000).record([{ uid: "c", imdbId: "tt3" }]);
    const later = createRefreshAttempts(store, "acct", () => NOW + 2000);
    expect(later.wasTried(a)).toBe(true);
    expect(later.wasTried(b)).toBe(true);
    expect(later.wasTried({ uid: "c", imdbId: "tt3" })).toBe(true);
  });

  test("recording drops markers that have expired, so the store can't grow without bound", () => {
    const store = memoryStore();
    createRefreshAttempts(store, "acct", () => NOW).record([a, b]);
    createRefreshAttempts(store, "acct", () => NOW + RETRY_AFTER_MS + 1).record([
      { uid: "c", imdbId: "tt3" },
    ]);
    const stored = JSON.parse(store.data.get(KEY) as string);
    expect(Object.keys(stored)).toEqual(["c"]);
  });

  test("recording nothing writes nothing", () => {
    const store = memoryStore();
    createRefreshAttempts(store, "acct", () => NOW).record([]);
    expect(store.data.size).toBe(0);
  });

  // Whatever is in storage, a refresh must carry on and be able to record again.
  test.each([["{not json"], ["5"], ["null"], ['["x"]'], ['"text"'], ['{"a":"nope"}'], ['{"a":5}']])(
    "a stored %s is treated as empty, and can be recorded over",
    (stored) => {
      const store = memoryStore({ [KEY]: stored });
      const attempts = createRefreshAttempts(store, "acct", () => NOW);

      expect(attempts.wasTried(a)).toBe(false);
      attempts.record([a]);

      expect(attempts.wasTried(a)).toBe(true);
    },
  );

  test("storage that throws never breaks a refresh", () => {
    const broken = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    };
    const attempts = createRefreshAttempts(broken, "acct", () => NOW);
    expect(() => attempts.record([a])).not.toThrow();
    expect(attempts.wasTried(a)).toBe(false);
  });

  test("no storage at all behaves the same", () => {
    const attempts = createRefreshAttempts(undefined, "acct", () => NOW);
    attempts.record([a]);
    expect(attempts.wasTried(a)).toBe(false);
  });
});

describe("browserStorage", () => {
  test("gives the page's local storage when there is one", () => {
    const fake = memoryStore();
    Object.defineProperty(globalThis, "localStorage", { value: fake, configurable: true });
    try {
      expect(browserStorage()).toBe(fake);
    } finally {
      Reflect.deleteProperty(globalThis, "localStorage");
    }
  });

  test("gives nothing when reading it throws", () => {
    Object.defineProperty(globalThis, "localStorage", {
      get() {
        throw new Error("blocked");
      },
      configurable: true,
    });
    try {
      expect(browserStorage()).toBeUndefined();
    } finally {
      Reflect.deleteProperty(globalThis, "localStorage");
    }
  });
});
