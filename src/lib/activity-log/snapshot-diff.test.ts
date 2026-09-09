import { describe, expect, test } from "bun:test";
import type { LoggedViewing } from "../caldav/types";
import { diffCaldavSnapshot } from "./snapshot-diff";

const DUNE: LoggedViewing = {
  uid: "dune-uid",
  title: "Dune",
  start: "2026-01-01T19:00:00.000Z",
  end: "2026-01-01T21:30:00.000Z",
  medium: "cinema",
  venue: "Grand Vista Cinema",
};

describe("diffCaldavSnapshot", () => {
  // #432: the caller (sync.ts) is responsible for the first-run
  // bootstrap — this function always assumes a real, already-seeded
  // snapshot, mirroring diffViewings()'s own "before" contract but at
  // the whole-map level rather than per-entry.
  test("returns nothing when nothing changed since the snapshot", () => {
    const previous = new Map([[DUNE.uid, DUNE]]);
    expect(diffCaldavSnapshot(previous, [DUNE])).toEqual([]);
  });

  test("reports a created entry for a uid not in the snapshot, attributed from X-LAST-MODIFIED-BY", () => {
    const previous = new Map<string, LoggedViewing>();
    const fromCli: LoggedViewing = { ...DUNE, lastModifiedBy: "cli" };
    expect(diffCaldavSnapshot(previous, [fromCli])).toEqual([
      { action: "created", uid: DUNE.uid, title: "Dune", actor: "cli" },
    ]);
  });

  test('attributes a created entry with no X-LAST-MODIFIED-BY as "unknown"', () => {
    const previous = new Map<string, LoggedViewing>();
    expect(diffCaldavSnapshot(previous, [DUNE])).toEqual([
      { action: "created", uid: DUNE.uid, title: "Dune", actor: "unknown" },
    ]);
  });

  // #432 dedup: a viewing this app just created itself was already
  // logged at write time by client.ts's createViewing — the diff pass
  // must not log it a second time.
  test("skips a self-made creation already logged by the write-time path", () => {
    const previous = new Map<string, LoggedViewing>();
    const fromWeb: LoggedViewing = { ...DUNE, lastModifiedBy: "web" };
    expect(diffCaldavSnapshot(previous, [fromWeb])).toEqual([]);
  });

  test("reports an updated entry with field-level changes for a non-self change", () => {
    const previous = new Map([[DUNE.uid, DUNE]]);
    const changed: LoggedViewing = { ...DUNE, venue: "Pathé De Munt", lastModifiedBy: "cli" };
    expect(diffCaldavSnapshot(previous, [changed])).toEqual([
      {
        action: "updated",
        uid: DUNE.uid,
        title: "Dune",
        changes: [{ field: "venue", before: "Grand Vista Cinema", after: "Pathé De Munt" }],
        actor: "cli",
      },
    ]);
  });

  test("skips a self-made update already logged by the write-time path", () => {
    const previous = new Map([[DUNE.uid, DUNE]]);
    const changed: LoggedViewing = { ...DUNE, venue: "Pathé De Munt", lastModifiedBy: "web" };
    expect(diffCaldavSnapshot(previous, [changed])).toEqual([]);
  });

  // #432: written from the snapshot's own last-known data, not the
  // vanished resource — there's nothing left on a deleted VEVENT to
  // read a title (or an X-LAST-MODIFIED-BY) from.
  test("reports a deleted entry using the snapshot's last-known title", () => {
    const previous = new Map([[DUNE.uid, DUNE]]);
    expect(diffCaldavSnapshot(previous, [])).toEqual([
      { action: "deleted", uid: DUNE.uid, title: "Dune", actor: "unknown" },
    ]);
  });

  test("reports nothing for a uid that never appears in the snapshot or the fetch", () => {
    expect(diffCaldavSnapshot(new Map(), [])).toEqual([]);
  });

  test("handles a mix of created, updated and deleted uids in one pass", () => {
    const paddington: LoggedViewing = {
      uid: "paddington-uid",
      title: "Paddington",
      start: "2026-02-01T18:00:00.000Z",
      end: "2026-02-01T19:40:00.000Z",
      medium: "netflix",
    };
    const previous = new Map([
      [DUNE.uid, DUNE],
      [paddington.uid, paddington],
    ]);
    const newArrival: LoggedViewing = {
      uid: "new-uid",
      title: "Arrival",
      start: "2026-03-01T18:00:00.000Z",
      end: "2026-03-01T20:00:00.000Z",
      medium: "cinema",
      lastModifiedBy: "cli",
    };
    const updatedPaddington: LoggedViewing = {
      ...paddington,
      medium: "cinema",
      lastModifiedBy: "cli",
    };
    const current = [updatedPaddington, newArrival];

    const entries = diffCaldavSnapshot(previous, current);
    expect(entries).toContainEqual({
      action: "deleted",
      uid: DUNE.uid,
      title: "Dune",
      actor: "unknown",
    });
    expect(entries).toContainEqual({
      action: "created",
      uid: "new-uid",
      title: "Arrival",
      actor: "cli",
    });
    expect(entries).toContainEqual({
      action: "updated",
      uid: paddington.uid,
      title: "Paddington",
      changes: [{ field: "medium", before: "netflix", after: "cinema" }],
      actor: "cli",
    });
    expect(entries).toHaveLength(3);
  });
});
