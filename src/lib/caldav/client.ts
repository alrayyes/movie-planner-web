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
  const response = await boundedFetch(resourceUrl(config, uid), {
    method: "GET",
    headers: { Authorization: authHeader(config) },
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
  return putViewing(config, uid, viewing);
}

// #294: reads the existing raw VEVENT first (best-effort — a fetch or
// parse failure here just means nothing extra to carry forward, not a
// blocked save) so any property this app doesn't itself read or write
// (X-CITY/X-COUNTRY, X-ROW/X-SEAT, or a future movie-planner extension)
// survives being edited through this app instead of silently vanishing
// the moment the PUT below regenerates the whole VEVENT body.
export async function updateViewing(
  config: CaldavConfig,
  uid: string,
  viewing: NewViewing,
): Promise<LoggedViewing> {
  validateCaldavConfig(config);
  let extraLines: string[] = [];
  try {
    const raw = await fetchRawViewing(config, uid);
    if (raw !== null) extraLines = extractUnknownProperties(raw);
  } catch {
    // Best-effort — an edit shouldn't fail just because this
    // preservation step couldn't read the existing resource.
  }
  return putViewing(config, uid, viewing, extraLines);
}

export async function deleteViewing(config: CaldavConfig, uid: string): Promise<void> {
  validateCaldavConfig(config);

  const response = await boundedFetch(resourceUrl(config, uid), {
    method: "DELETE",
    headers: { Authorization: authHeader(config) },
  });
  if (response.status === 404) return;
  await assertOk(response, "deleting event");
}

export async function getPicklists(config: CaldavConfig): Promise<Picklists> {
  validateCaldavConfig(config);

  const response = await boundedFetch(resourceUrl(config, SIDECAR_UID), {
    method: "GET",
    headers: { Authorization: authHeader(config) },
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
