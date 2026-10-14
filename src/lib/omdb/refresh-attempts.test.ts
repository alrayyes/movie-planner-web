import { describe, expect, test } from "bun:test";
import {
  attemptsAccount,
  browserStorage,
  createRefreshAttempts,
  RETRY_AFTER_MS,
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

// #898: remembers which titles OMDb already answered without completing, so a
// bulk refresh doesn't send them again on every press.
describe("createRefreshAttempts", () => {
  test("a title nobody has recorded is not tried", () => {
    const attempts = createRefreshAttempts(memoryStore(), "me@example", () => NOW);
    expect(attempts.wasTried("a")).toBe(false);
  });

  test("a recorded title is tried, and only that title", () => {
    const attempts = createRefreshAttempts(memoryStore(), "me@example", () => NOW);
    attempts.record(["a", "b"]);
    expect(attempts.wasTried("a")).toBe(true);
    expect(attempts.wasTried("b")).toBe(true);
    expect(attempts.wasTried("c")).toBe(false);
  });

  test("it is stored under the account's own key", () => {
    const store = memoryStore();
    createRefreshAttempts(store, "me@example", () => NOW).record(["a"]);
    expect([...store.data.keys()]).toEqual(["movie-planner-web:refresh-tried:me@example"]);
  });

  test("a stored date that isn't a number doesn't count", () => {
    const store = memoryStore({
      "movie-planner-web:refresh-tried:me@example": JSON.stringify({ a: String(NOW) }),
    });
    expect(createRefreshAttempts(store, "me@example", () => NOW).wasTried("a")).toBe(false);
  });

  test("it survives a new instance on the same store", () => {
    const store = memoryStore();
    createRefreshAttempts(store, "me@example", () => NOW).record(["a"]);
    expect(createRefreshAttempts(store, "me@example", () => NOW).wasTried("a")).toBe(true);
  });

  test("another account's record is not this account's", () => {
    const store = memoryStore();
    createRefreshAttempts(store, "me@example", () => NOW).record(["a"]);
    expect(createRefreshAttempts(store, "you@example", () => NOW).wasTried("a")).toBe(false);
  });

  test("a record just under the retry window still counts, one at it no longer does", () => {
    const store = memoryStore();
    createRefreshAttempts(store, "me@example", () => NOW).record(["a"]);
    expect(
      createRefreshAttempts(store, "me@example", () => NOW + RETRY_AFTER_MS - 1).wasTried("a"),
    ).toBe(true);
    expect(
      createRefreshAttempts(store, "me@example", () => NOW + RETRY_AFTER_MS).wasTried("a"),
    ).toBe(false);
  });

  test("the retry window is 30 days", () => {
    expect(RETRY_AFTER_MS).toBe(30 * 24 * 60 * 60 * 1000);
  });

  test("recording again refreshes the date, and keeps the others", () => {
    const store = memoryStore();
    createRefreshAttempts(store, "me@example", () => NOW).record(["a", "b"]);
    createRefreshAttempts(store, "me@example", () => NOW + RETRY_AFTER_MS - 10).record(["a"]);
    const later = createRefreshAttempts(store, "me@example", () => NOW + RETRY_AFTER_MS + 5);
    expect(later.wasTried("a")).toBe(true);
    expect(later.wasTried("b")).toBe(false);
  });

  test("forgetting a title makes it a target again, and leaves the rest", () => {
    const attempts = createRefreshAttempts(memoryStore(), "me@example", () => NOW);
    attempts.record(["a", "b"]);
    attempts.forget("a");
    expect(attempts.wasTried("a")).toBe(false);
    expect(attempts.wasTried("b")).toBe(true);
  });

  test("recording nothing writes nothing", () => {
    const store = memoryStore();
    createRefreshAttempts(store, "me@example", () => NOW).record([]);
    expect(store.data.size).toBe(0);
  });

  // Whatever is in storage, a refresh must carry on and be able to record again.
  test.each([["{not json"], ["5"], ["null"], ['["x"]'], ['"text"']])(
    "a stored %s is treated as empty, and can be recorded over",
    (stored) => {
      const store = memoryStore();
      const attempts = createRefreshAttempts(store, "me@example", () => NOW);
      attempts.record(["seed"]);
      const [storedKey] = [...store.data.keys()];
      store.data.set(storedKey as string, stored);

      expect(attempts.wasTried("a")).toBe(false);
      attempts.record(["a"]);

      expect(attempts.wasTried("a")).toBe(true);
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
    const attempts = createRefreshAttempts(broken, "me@example", () => NOW);
    expect(() => attempts.record(["a"])).not.toThrow();
    expect(attempts.wasTried("a")).toBe(false);
    expect(() => attempts.forget("a")).not.toThrow();
  });

  test("no storage at all behaves the same", () => {
    const attempts = createRefreshAttempts(undefined, "me@example", () => NOW);
    attempts.record(["a"]);
    expect(attempts.wasTried("a")).toBe(false);
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

describe("attemptsAccount", () => {
  test("names the calendar and the user", () => {
    expect(attemptsAccount({ baseUrl: "https://c.example/me/", username: "me" })).toBe(
      "https://c.example/me/|me",
    );
  });
});
