import type { LoggedViewing } from "../caldav/types";
import { diffViewings } from "./diff";
import type { ActivityAction, FieldChange } from "./types";

export interface SnapshotDiffEntry {
  action: ActivityAction;
  uid: string;
  title?: string;
  changes?: FieldChange[];
  actor: string;
}

function actorOf(viewing: LoggedViewing): string {
  return viewing.lastModifiedBy || "unknown";
}

// #432: diffs a full, unfiltered CalDAV fetch against the last-seen
// snapshot to surface changes this app didn't make itself (the CLI,
// another browser/device) — reusing diffViewings()'s own field-by-field
// shape per entry, same "exactly which fields moved" comparison a
// self-made edit already gets via client.ts's write-time logging.
//
// `previous` is assumed to already be a real, seeded snapshot — the
// caller (sync.ts) owns the first-run bootstrap (seed without diffing
// at all), mirroring diffViewings()'s own `if (!before) return []`
// contract but at the whole-map level rather than per-entry.
//
// Dedup is by attribution, not timing: a viewing whose
// X-LAST-MODIFIED-BY already reads "web" was just logged a moment ago
// by this app's own write path (client.ts's createViewing/
// updateViewing), so generating a second entry for it here — whether
// it looks new or merely changed — would log it twice. A viewing this
// app itself deleted never reaches the "deleted" loop below at all:
// deleteViewing() removes it from the snapshot at write time (there's
// nothing left on the vanished resource to attribute a delete from),
// so by the time this runs, the snapshot and the fetch already agree
// on it.
export function diffCaldavSnapshot(
  previous: Map<string, LoggedViewing>,
  current: LoggedViewing[],
): SnapshotDiffEntry[] {
  const entries: SnapshotDiffEntry[] = [];
  const currentUids = new Set<string>();

  for (const viewing of current) {
    currentUids.add(viewing.uid);
    if (viewing.lastModifiedBy === "web") continue;

    const before = previous.get(viewing.uid) ?? null;
    if (!before) {
      entries.push({
        action: "created",
        uid: viewing.uid,
        title: viewing.title,
        actor: actorOf(viewing),
      });
      continue;
    }

    const changes = diffViewings(before, viewing);
    if (changes.length > 0) {
      entries.push({
        action: "updated",
        uid: viewing.uid,
        title: viewing.title,
        changes,
        actor: actorOf(viewing),
      });
    }
  }

  for (const [uid, before] of previous) {
    if (currentUids.has(uid)) continue;
    // #432: written from the snapshot's own last-known data — there's
    // no vanished resource left to read a title, or an attribution,
    // from. Always "unknown": we genuinely don't know who deleted it.
    entries.push({ action: "deleted", uid, title: before.title, actor: "unknown" });
  }

  return entries;
}
