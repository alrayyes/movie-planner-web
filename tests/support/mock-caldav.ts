import type { Page, Route } from "@playwright/test";
import { parseVEventToViewing, serializeViewingToVEvent } from "../../src/lib/caldav/ical";
import type { LoggedViewing } from "../../src/lib/caldav/types";

export interface MockCaldavServer {
  creates: LoggedViewing[];
  updates: LoggedViewing[];
  deletes: string[];
  listRequests: { from: Date; to: Date }[];
  authHeaders: string[];
}

function escapeXml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function toMultistatus(viewings: LoggedViewing[]): string {
  const responses = viewings
    .map(
      (v) =>
        `<D:response><D:propstat><D:prop><C:calendar-data>${escapeXml(
          serializeViewingToVEvent(v.uid, v),
        )}</C:calendar-data></D:prop></D:propstat></D:response>`,
    )
    .join("");
  return `<D:multistatus xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav">${responses}</D:multistatus>`;
}

// The iCal basic UTC timestamp format (YYYYMMDDTHHMMSSZ) client.ts's
// listViewings sends in the REPORT body's <C:time-range> filter.
function parseIcalTimestamp(value: string): Date {
  const match = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(value);
  if (!match) throw new Error(`not an iCal timestamp: "${value}"`);
  const [, y, mo, d, h, mi, s] = match;
  return new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s)));
}

function uidFromResourceUrl(url: URL): string {
  return decodeURIComponent(
    url.pathname
      .split("/")
      .pop()
      ?.replace(/\.ics$/, "") ?? "",
  );
}

// Simulates a visitor's own CalDAV server for a given base URL — the real
// wire protocol client.ts speaks directly (REPORT/GET/PUT/DELETE,
// multistatus/iCal bodies), now that there's no server-side proxy
// translating it to and from JSON. Lets these page-level tests exercise
// this app's own logic (rendering, filtering, which requests it makes)
// without a real or fake CalDAV server — same rationale the old
// JSON-mocking helpers had, just at the actual protocol boundary.
export function mockCaldavServer(
  page: Page,
  baseUrl: string,
  initialViewings: LoggedViewing[] = [],
): MockCaldavServer {
  const viewings = new Map(initialViewings.map((v) => [v.uid, v]));
  const state: MockCaldavServer = {
    creates: [],
    updates: [],
    deletes: [],
    listRequests: [],
    authHeaders: [],
  };

  const origin = new URL(baseUrl).origin;
  page.route(`${origin}/**`, async (route: Route) => {
    const request = route.request();
    const method = request.method();
    const url = new URL(request.url());
    const auth = await request.headerValue("authorization");
    if (auth) state.authHeaders.push(auth);

    if (method === "REPORT") {
      const body = request.postData() ?? "";
      const match = /<C:time-range start="([^"]+)" end="([^"]+)"/.exec(body);
      const range = match
        ? {
            from: parseIcalTimestamp(match[1] as string),
            to: parseIcalTimestamp(match[2] as string),
          }
        : undefined;
      if (range) state.listRequests.push(range);

      const inRange = [...viewings.values()].filter((v) => {
        if (!range) return true;
        const start = new Date(v.start);
        return start >= range.from && start <= range.to;
      });
      await route.fulfill({
        status: 207,
        contentType: "application/xml",
        body: toMultistatus(inRange),
      });
      return;
    }

    if (method === "PUT") {
      const body = request.postData() ?? "";
      const parsed = parseVEventToViewing(body);
      const existed = viewings.has(parsed.uid);
      viewings.set(parsed.uid, parsed);
      (existed ? state.updates : state.creates).push(parsed);
      await route.fulfill({ status: 201, body: "" });
      return;
    }

    if (method === "DELETE") {
      const uid = uidFromResourceUrl(url);
      const existed = viewings.delete(uid);
      if (existed) state.deletes.push(uid);
      await route.fulfill({ status: existed ? 204 : 404, body: "" });
      return;
    }

    if (method === "GET") {
      const viewing = viewings.get(uidFromResourceUrl(url));
      if (!viewing) {
        await route.fulfill({ status: 404, body: "" });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "text/calendar",
        body: serializeViewingToVEvent(viewing.uid, viewing),
      });
      return;
    }

    await route.fulfill({ status: 405, body: "" });
  });

  return state;
}
