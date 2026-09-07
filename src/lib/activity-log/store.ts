import { IndexedDbActivityLogStore } from "./indexeddb-store";
import type { ActivityLogEntry, ActivityLogStore } from "./types";

export type { ActivityAction, ActivityLogEntry, ActivityLogStore, FieldChange } from "./types";

let instance: ActivityLogStore | undefined;

export function getActivityLogStore(): ActivityLogStore {
  instance ??= new IndexedDbActivityLogStore();
  return instance;
}

// #349: best-effort, deliberately — client.ts calls this right after a
// real CalDAV write already succeeded, and a visitor's edit/delete/import
// must never fail (or even appear to hang) just because the local,
// browser-only debugging log couldn't be written (private browsing,
// storage quota, IndexedDB unavailable).
export async function recordActivity(entry: Omit<ActivityLogEntry, "id">): Promise<void> {
  try {
    await getActivityLogStore().append(entry);
  } catch {
    // Swallowed on purpose — see above.
  }
}
