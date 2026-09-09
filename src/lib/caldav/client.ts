import { diffViewings } from "../activity-log/diff";
import { recordActivity } from "../activity-log/store";
import { boundedFetch, readBoundedText } from "./bounded-fetch";
import { CaldavRequestFailedError } from "./errors";
import {
  extractUnknownProperties,
  parsePicklistsFromVJournal,
  parseVEventToViewing,
  parseViewingsFromMultistatus,
  SIDECAR_UID,
  serializePicklistsToVJournal,
  serializeViewingToVEvent,
} from "./ical";
import type { CaldavConfig, DateRange, LoggedViewing, NewViewing, Picklists } from "./types";
import { validateCaldavConfig } from "./validate-config";

function authHeader(config: CaldavConfig): string {
  return `Basic ${btoa(`${config.username}:${config.password}`)}`;
}

function resourceUrl(config: CaldavConfig, uid: string): string {
  const base = config.baseUrl.endsWith("/") ? config.baseUrl : `${config.baseUrl}/`;
  return `${base}${encodeURIComponent(uid)}.ics`;
}

function toIcalTimestamp(iso: string): string {
  return new Date(iso)
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");
}

async function assertOk(response: Response, action: string): Promise<void> {
  if (!response.ok) {
    throw new CaldavRequestFailedError(
      `${action} failed: the CalDAV server responded ${response.status} ${response.statusText}`,
      response.status,
    );
  }
}

export async function listViewings(
  config: CaldavConfig,
  range: DateRange,
  options: { signal?: AbortSignal } = {},
): Promise<LoggedViewing[]> {
  validateCaldavConfig(config);

  const body = `<?xml version="1.0" encoding="utf-8" ?>
<C:calendar-query xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav">
  <D:prop>
    <C:calendar-data/>
  </D:prop>
  <C:filter>
    <C:comp-filter name="VCALENDAR">
      <C:comp-filter name="VEVENT">
        <C:time-range start="${toIcalTimestamp(range.from)}" end="${toIcalTimestamp(range.to)}"/>
      </C:comp-filter>
    </C:comp-filter>
  </C:filter>
</C:calendar-query>`;

  const response = await boundedFetch(
    config.baseUrl,
    {
      method: "REPORT",
      headers: {
        Authorization: authHeader(config),
        Depth: "1",
        "Content-Type": "application/xml; charset=utf-8",
      },
      body,
      // #445: a REPORT is never cached by the browser itself (#418's
      // reasoning still holds for that layer), but that doesn't cover an
      // intermediate cache — a reverse proxy or CDN in front of a
      // visitor's real CalDAV server — which can otherwise keep serving
      // a list response that predates a write that just succeeded (e.g.
      // a delete), until a full page reload happens to bypass it.
      cache: "no-store",
    },
    { signal: options.signal },
  );
  await assertOk(response, "listing events");

  const xml = await readBoundedText(response);
  return parseViewingsFromMultistatus(xml);
}

// Raw, unparsed — shared by getViewing (parses it) and updateViewing
// (only wants whatever properties it doesn't itself know about, per
// #294's own comment on extractUnknownProperties).
async function fetchRawViewing(config: CaldavConfig, uid: string): Promise<string | null> {
  // #418: unlike listViewings's own REPORT (never cached by browsers by
  // default), a GET on one event's own resource URL is a genuinely
  // cacheable request — a CalDAV server's ETag/Last-Modified headers
  // could otherwise leave the browser quietly serving a stale copy of
  // just this one event even after it's changed server-side.
  const response = await boundedFetch(resourceUrl(config, uid), {
    method: "GET",
    headers: { Authorization: authHeader(config) },
    cache: "no-store",
  });
  if (response.status === 404) return null;
  await assertOk(response, "getting event");
  return readBoundedText(response);
}

export async function getViewing(config: CaldavConfig, uid: string): Promise<LoggedViewing | null> {
  validateCaldavConfig(config);

  const raw = await fetchRawViewing(config, uid);
  if (raw === null) return null;
  return parseVEventToViewing(raw);
}

async function putViewing(
  config: CaldavConfig,
  uid: string,
  viewing: NewViewing,
  extraLines: string[] = [],
): Promise<LoggedViewing> {
  const response = await boundedFetch(resourceUrl(config, uid), {
    method: "PUT",
    headers: {
      Authorization: authHeader(config),
      "Content-Type": "text/calendar; charset=utf-8",
    },
    body: serializeViewingToVEvent(uid, viewing, extraLines),
  });
  await assertOk(response, "saving event");
  return { ...viewing, uid };
}

export async function createViewing(
  config: CaldavConfig,
  viewing: NewViewing,
): Promise<LoggedViewing> {
  validateCaldavConfig(config);
  const uid = crypto.randomUUID();
  const created = await putViewing(config, uid, viewing);
  await recordActivity({
    at: new Date().toISOString(),
    action: "created",
    uid,
    title: viewing.title,
  });
  return created;
}

// #294: reads the existing raw VEVENT first (best-effort — a fetch or
// parse failure here just means nothing extra to carry forward, not a
// blocked save) so any property this app doesn't itself read or write
// (X-CITY/X-COUNTRY, X-ROW/X-SEAT, or a future movie-planner extension)
// survives being edited through this app instead of silently vanishing
// the moment the PUT below regenerates the whole VEVENT body. #349: the
// same read also gives the activity log its "before" state for free —
// no second fetch just to compute a diff.
export async function updateViewing(
  config: CaldavConfig,
  uid: string,
  viewing: NewViewing,
): Promise<LoggedViewing> {
  validateCaldavConfig(config);
  let extraLines: string[] = [];
  let before: LoggedViewing | null = null;
  try {
    const raw = await fetchRawViewing(config, uid);
    if (raw !== null) {
      extraLines = extractUnknownProperties(raw);
      before = parseVEventToViewing(raw);
    }
  } catch {
    // Best-effort — an edit shouldn't fail just because this
    // preservation step couldn't read the existing resource.
  }
  const updated = await putViewing(config, uid, viewing, extraLines);
  const changes = diffViewings(before, viewing);
  if (changes.length > 0) {
    await recordActivity({
      at: new Date().toISOString(),
      action: "updated",
      uid,
      title: viewing.title,
      changes,
    });
  }
  return updated;
}

export async function deleteViewing(config: CaldavConfig, uid: string): Promise<void> {
  validateCaldavConfig(config);

  // Best-effort, same reasoning as updateViewing's own read above — a
  // delete shouldn't fail just because grabbing the title for the
  // activity log couldn't read the resource first.
  let title: string | undefined;
  try {
    const raw = await fetchRawViewing(config, uid);
    if (raw !== null) title = parseVEventToViewing(raw).title;
  } catch {
    // Best-effort.
  }

  const response = await boundedFetch(resourceUrl(config, uid), {
    method: "DELETE",
    headers: { Authorization: authHeader(config) },
  });
  if (response.status === 404) return;
  await assertOk(response, "deleting event");
  await recordActivity({ at: new Date().toISOString(), action: "deleted", uid, title });
}

export async function getPicklists(config: CaldavConfig): Promise<Picklists> {
  validateCaldavConfig(config);

  // #418: same reasoning as fetchRawViewing's own cache: "no-store" —
  // this is a single-resource GET too, so it's cacheable by the browser
  // the same way.
  const response = await boundedFetch(resourceUrl(config, SIDECAR_UID), {
    method: "GET",
    headers: { Authorization: authHeader(config) },
    cache: "no-store",
  });
  if (response.status === 404) return parsePicklistsFromVJournal(null);
  if (!response.ok) return parsePicklistsFromVJournal(null);

  const raw = await readBoundedText(response);
  return parsePicklistsFromVJournal(raw);
}

export async function updatePicklists(config: CaldavConfig, picklists: Picklists): Promise<void> {
  validateCaldavConfig(config);

  const response = await boundedFetch(resourceUrl(config, SIDECAR_UID), {
    method: "PUT",
    headers: {
      Authorization: authHeader(config),
      "Content-Type": "text/calendar; charset=utf-8",
    },
    body: serializePicklistsToVJournal(picklists),
  });
  await assertOk(response, "saving the picklist sidecar");
}
