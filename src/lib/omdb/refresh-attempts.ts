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

// What OMDb was asked about. A title whose IMDb ID has changed since (the visitor
// picked another film) is a different question, so the marker no longer applies.
export interface TriedTitle {
  uid: string;
  imdbId?: string;
}

interface Marker {
  at: number;
  imdbId?: string;
}

export function createRefreshAttempts(
  storage: AttemptStorage | undefined,
  account: string,
  now: () => number = Date.now,
) {
  const key = KEY_PREFIX + account;

  function read(): Record<string, Marker> {
    try {
      // Stryker disable next-line StringLiteral: an empty default makes JSON.parse throw and the catch below returns {} anyway.
      const parsed: unknown = JSON.parse(storage?.getItem(key) ?? "{}");
      return parsed !== null && !Array.isArray(parsed) ? (parsed as Record<string, Marker>) : {};
    } catch {
      return {};
    }
  }

  function current(marker: Marker | undefined): marker is Marker {
    return typeof marker?.at === "number" && now() - marker.at < RETRY_AFTER_MS;
  }

  function write(record: Record<string, Marker>) {
    try {
      storage?.setItem(key, JSON.stringify(record));
    } catch {
      // Storage blocked or full: the refresh still works, it just asks again next time.
    }
  }

  return {
    wasTried({ uid, imdbId }: TriedTitle): boolean {
      const marker = read()[uid];
      return current(marker) && marker.imdbId === imdbId;
    },
    record(titles: readonly TriedTitle[]): void {
      if (titles.length === 0) return;
      // Markers past the window are dropped here, so the store can't grow without bound.
      const kept = Object.fromEntries(
        Object.entries(read()).filter(([, marker]) => current(marker)),
      );
      for (const { uid, imdbId } of titles) kept[uid] = { at: now(), imdbId };
      write(kept);
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
