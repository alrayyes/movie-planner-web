// #898: a title OMDb answered for but couldn't complete (no poster or plot for it)
// stays incomplete after every refresh, so "Refresh all metadata" would send it
// again on every press and spend quota for nothing. This remembers, per account
// and in this browser only, which titles that has happened to. Not on the calendar
// entry: that would add a property to the data shared with the movie-planner CLI,
// to record what is only a hint about quota.
export const RETRY_AFTER_MS = 30 * 24 * 60 * 60 * 1000;

const KEY_PREFIX = "movie-planner-web:refresh-tried:";

interface AttemptStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function createRefreshAttempts(
  storage: AttemptStorage | undefined,
  account: string,
  now: () => number = Date.now,
) {
  const key = KEY_PREFIX + account;

  function read(): Record<string, number> {
    try {
      // Stryker disable next-line StringLiteral: an empty default makes JSON.parse throw and the catch below returns {} anyway.
      const parsed: unknown = JSON.parse(storage?.getItem(key) ?? "{}");
      return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
        ? (parsed as Record<string, number>)
        : {};
    } catch {
      return {};
    }
  }

  function write(record: Record<string, number>) {
    try {
      storage?.setItem(key, JSON.stringify(record));
    } catch {
      // Storage blocked or full: the refresh still works, it just asks again next time.
    }
  }

  return {
    wasTried(uid: string): boolean {
      const at = read()[uid];
      return typeof at === "number" && now() - at < RETRY_AFTER_MS;
    },
    record(uids: readonly string[]): void {
      if (uids.length === 0) return;
      const record = read();
      for (const uid of uids) record[uid] = now();
      write(record);
    },
    forget(uid: string): void {
      const record = read();
      delete record[uid];
      write(record);
    },
  };
}

// Reading `localStorage` itself can throw (blocked site data), so it is fetched here.
export function browserStorage(): AttemptStorage | undefined {
  try {
    return globalThis.localStorage;
  } catch {
    // Blocked site data: carry on without a store.
  }
  return undefined;
}

export function attemptsAccount(config: { baseUrl: string; username: string }): string {
  return `${config.baseUrl}|${config.username}`;
}
