import { describe, expect, test } from "bun:test";
import type { CaldavConfig, LoggedViewing } from "../caldav/types";
import { syncCaldavActivityLog } from "./sync";
import type { ActivityLogEntry } from "./types";

const CONFIG: CaldavConfig = {
  baseUrl: "https://caldav.example.com/calendars/me/movies/",
  username: "me",
  password: "secret",
};

const DUNE: LoggedViewing = {
  uid: "dune-uid",
  title: "Dune",
  start: "2026-01-01T19:00:00.000Z",
  end: "2026-01-01T21:30:00.000Z",
  medium: "cinema",
};

// A tiny in-memory fake of the CaldavSnapshotStore interface — this
// project has no fake-indexeddb dependency (the existing
// IndexedDbActivityLogStore/IndexedDbCredentialsStore have no direct
// unit tests either, only Playwright coverage of the real thing), so
// this is what exercises the orchestration's own load/replaceAll
// contract without touching a real IndexedDB.
function fakeStore(seeded: Map<string, LoggedViewing> | null) {
  let state = seeded;
  return {
    replaceAllCalls: [] as LoggedViewing[][],
    async load() {
      return state;
    },
    async replaceAll(viewings: LoggedViewing[]) {
      this.replaceAllCalls.push(viewings);
      state = new Map(viewings.map((v) => [v.uid, v]));
    },
    async remove(uid: string) {
      state?.delete(uid);
    },
  };
}

describe("syncCaldavActivityLog", () => {
  test("first run: seeds the snapshot and logs nothing", async () => {
    const store = fakeStore(null);
    const recorded: Omit<ActivityLogEntry, "id">[] = [];

    await syncCaldavActivityLog(CONFIG, {
      fetchAllViewings: async () => [DUNE],
      store,
      record: async (entry) => {
        recorded.push(entry);
      },
    });

    expect(recorded).toEqual([]);
    expect(store.replaceAllCalls).toEqual([[DUNE]]);
  });

  test("an already-seeded snapshot: records each diff-derived entry, then refreshes the snapshot", async () => {
    const store = fakeStore(new Map([[DUNE.uid, DUNE]]));
    const recorded: Omit<ActivityLogEntry, "id">[] = [];
    const fromCli: LoggedViewing = { ...DUNE, venue: "Pathé De Munt", lastModifiedBy: "cli" };

    await syncCaldavActivityLog(CONFIG, {
      fetchAllViewings: async () => [fromCli],
      store,
      record: async (entry) => {
        recorded.push(entry);
      },
    });

    expect(recorded).toEqual([
      {
        at: expect.any(String),
        action: "updated",
        uid: DUNE.uid,
        title: "Dune",
        changes: [{ field: "venue", before: undefined, after: "Pathé De Munt" }],
        actor: "cli",
      },
    ]);
    expect(store.replaceAllCalls).toEqual([[fromCli]]);
  });

  test("a self-made change already logged at write time produces no diff-derived entry", async () => {
    const store = fakeStore(new Map([[DUNE.uid, DUNE]]));
    const recorded: Omit<ActivityLogEntry, "id">[] = [];
    const fromWeb: LoggedViewing = { ...DUNE, venue: "Pathé De Munt", lastModifiedBy: "web" };

    await syncCaldavActivityLog(CONFIG, {
      fetchAllViewings: async () => [fromWeb],
      store,
      record: async (entry) => {
        recorded.push(entry);
      },
    });

    expect(recorded).toEqual([]);
  });

  test("never throws, even when fetching or storing fails (best-effort, like recordActivity)", async () => {
    const store = fakeStore(null);
    await expect(
      syncCaldavActivityLog(CONFIG, {
        fetchAllViewings: async () => {
          throw new Error("network down");
        },
        store,
        record: async () => {},
      }),
    ).resolves.toBeUndefined();
  });
});
