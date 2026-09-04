// The browser-side counterpart to src/pages/api/caldav/** — every call here
// goes to this app's own origin (the caldav-proxy), never straight to a
// visitor's CalDAV server. See client.ts for the server-side code that
// actually speaks CalDAV; this file only knows JSON in, JSON out.
import type { CaldavConfig, DateRange, LoggedViewing, NewViewing, Picklists } from "./types";

async function post<TResponse>(path: string, body: unknown): Promise<TResponse> {
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const { error } = (await response.json().catch(() => ({ error: response.statusText }))) as {
      error?: string;
    };
    throw new Error(error ?? `${path} failed with status ${response.status}`);
  }
  if (response.status === 204) return undefined as TResponse;
  return (await response.json()) as TResponse;
}

export function listViewings(config: CaldavConfig, range: DateRange): Promise<LoggedViewing[]> {
  return post("/api/caldav/events/list", { config, range });
}

export function getViewing(config: CaldavConfig, uid: string): Promise<LoggedViewing | null> {
  return post("/api/caldav/events/get", { config, uid });
}

export function createViewing(config: CaldavConfig, viewing: NewViewing): Promise<LoggedViewing> {
  return post("/api/caldav/events/create", { config, viewing });
}

export function updateViewing(
  config: CaldavConfig,
  uid: string,
  viewing: NewViewing,
): Promise<LoggedViewing> {
  return post("/api/caldav/events/update", { config, uid, viewing });
}

export function deleteViewing(config: CaldavConfig, uid: string): Promise<void> {
  return post("/api/caldav/events/delete", { config, uid });
}

export function getPicklists(config: CaldavConfig): Promise<Picklists> {
  return post("/api/caldav/sidecar/get", { config });
}

export function updatePicklists(config: CaldavConfig, picklists: Picklists): Promise<void> {
  return post("/api/caldav/sidecar/update", { config, picklists });
}
