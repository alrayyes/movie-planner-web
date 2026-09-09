// #349: a local, per-browser record of what THIS app did to a visitor's
// calendar — not a shared audit trail with the CLI (which would need its
// own cross-repo design), and not synced across devices, since this app
// has no server to hold it centrally. The point is a reference for "what
// did I just do", not a complete history of the calendar.
export type ActivityAction = "created" | "updated" | "deleted";

export interface FieldChange {
  field: string;
  before?: string;
  after?: string;
}

export interface ActivityLogEntry {
  id: number;
  at: string; // ISO 8601
  action: ActivityAction;
  uid: string;
  title?: string;
  // Only ever set for "updated" — populated from whatever changed
  // between the previously-stored VEVENT and what got written, per
  // diffViewings(). Empty (not present) means either "created"/"deleted",
  // or an "updated" that ended up writing back identical values.
  changes?: FieldChange[];
  // #432: who made this change — "web" for this app's own write-time
  // logging (client.ts), or whatever the diff-on-sync pass read off
  // X-LAST-MODIFIED-BY ("cli", or "unknown" when absent — a resource
  // neither app has attributed yet, or a deleted one with nothing left
  // to read it from). Absent entirely on any entry logged before #432
  // shipped.
  actor?: string;
}

export interface ActivityLogStore {
  append(entry: Omit<ActivityLogEntry, "id">): Promise<void>;
  list(limit?: number): Promise<ActivityLogEntry[]>; // most recent first
}
