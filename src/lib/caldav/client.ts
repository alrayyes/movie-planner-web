import { boundedFetch, readBoundedText } from "./bounded-fetch";
import { CaldavRequestFailedError } from "./errors";
import {
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

export async function getViewing(config: CaldavConfig, uid: string): Promise<LoggedViewing | null> {
  validateCaldavConfig(config);

  const response = await boundedFetch(resourceUrl(config, uid), {
    method: "GET",
    headers: { Authorization: authHeader(config) },
  });
  if (response.status === 404) return null;
  await assertOk(response, "getting event");

  const raw = await readBoundedText(response);
  return parseVEventToViewing(raw);
}

async function putViewing(
  config: CaldavConfig,
  uid: string,
  viewing: NewViewing,
): Promise<LoggedViewing> {
  const response = await boundedFetch(resourceUrl(config, uid), {
    method: "PUT",
    headers: {
      Authorization: authHeader(config),
      "Content-Type": "text/calendar; charset=utf-8",
    },
    body: serializeViewingToVEvent(uid, viewing),
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

export async function updateViewing(
  config: CaldavConfig,
  uid: string,
  viewing: NewViewing,
): Promise<LoggedViewing> {
  validateCaldavConfig(config);
  return putViewing(config, uid, viewing);
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
