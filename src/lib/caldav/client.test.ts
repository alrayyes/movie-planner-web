import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from "bun:test";
import { getCaldavSnapshotStore } from "../activity-log/snapshot-store";
import { getActivityLogStore } from "../activity-log/store";
import {
  createViewing,
  deleteViewing,
  getPicklists,
  getViewing,
  listViewings,
  updatePicklists,
  updateViewing,
} from "./client";
import { CaldavRequestFailedError, InvalidCaldavUrlError } from "./errors";
import { serializePicklistsToVJournal, serializeViewingToVEvent } from "./ical";
import type { CaldavConfig, NewViewing } from "./types";

const CONFIG: CaldavConfig = {
  baseUrl: "https://caldav.example.com/calendars/me/movies/",
  username: "me",
  password: "secret",
};

const VIEWING: NewViewing = {
  title: "Dune",
  start: "2026-01-01T19:00:00.000Z",
  end: "2026-01-01T21:30:00.000Z",
  medium: "cinema",
};

let originalFetch: typeof fetch;

beforeEach(() => {
  originalFetch = globalThis.fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("listViewings", () => {
  test("sends a REPORT calendar-query and parses the multistatus response", async () => {
    const eventIcal = serializeViewingToVEvent("uid-1", VIEWING);
    const xml = `<D:multistatus xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav">
  <D:response><D:propstat><D:prop>
    <C:calendar-data>${eventIcal.replace(/&/g, "&amp;")}</C:calendar-data>
  </D:prop></D:propstat></D:response>
</D:multistatus>`;

    const fetchMock = mock(async (_url: string, init: RequestInit) => {
      expect(init.method).toBe("REPORT");
      expect((init.headers as Record<string, string>).Authorization).toBe(
        `Basic ${btoa("me:secret")}`,
      );
      return new Response(xml, { status: 207 });
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const viewings = await listViewings(CONFIG, {
      from: "2026-01-01T00:00:00.000Z",
      to: "2026-02-01T00:00:00.000Z",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(viewings).toHaveLength(1);
    expect(viewings[0]?.title).toBe("Dune");
  });

  test("aborts via a caller-supplied signal, so a superseded reload can cancel its own stale request", async () => {
    const fetchMock = mock(async (_url: string, init: RequestInit) => {
      const signal = init.signal as AbortSignal;
      return new Promise<Response>((_resolve, reject) => {
        signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
      });
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const controller = new AbortController();
    const pending = listViewings(
      CONFIG,
      { from: "2026-01-01T00:00:00.000Z", to: "2026-02-01T00:00:00.000Z" },
      { signal: controller.signal },
    );
    controller.abort();

    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  });

  test("rejects a non-https base URL before making any request", async () => {
    const fetchMock = mock(async () => new Response("", { status: 200 }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await expect(
      listViewings(
        { ...CONFIG, baseUrl: "http://caldav.example.com/" },
        { from: "2026-01-01T00:00:00.000Z", to: "2026-02-01T00:00:00.000Z" },
      ),
    ).rejects.toThrow(InvalidCaldavUrlError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  // #445: a REPORT is never cached by the browser itself (#418's own
  // reasoning), but that doesn't account for an intermediate cache — a
  // reverse proxy or CDN in front of a visitor's real CalDAV server —
  // which is exactly what let a just-deleted viewing's row keep showing
  // in the table until a full page reload. Confirmed live.
  test("forces the browser (and any intermediate cache) to skip a cached response", async () => {
    const fetchMock = mock(async (_url: string, init: RequestInit) => {
      expect(init.cache).toBe("no-store");
      return new Response('<D:multistatus xmlns:D="DAV:"/>', { status: 207 });
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await listViewings(CONFIG, {
      from: "2026-01-01T00:00:00.000Z",
      to: "2026-02-01T00:00:00.000Z",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test("sequential requests for different visitors use only each request's own credentials", async () => {
    const seenAuth: string[] = [];
    globalThis.fetch = (async (_url: string, init: RequestInit) => {
      seenAuth.push((init.headers as Record<string, string>).Authorization);
      return new Response('<D:multistatus xmlns:D="DAV:"/>', { status: 207 });
    }) as unknown as typeof fetch;

    const range = { from: "2026-01-01T00:00:00.000Z", to: "2026-02-01T00:00:00.000Z" };
    await listViewings(CONFIG, range);
    await listViewings(
      { ...CONFIG, username: "someone-else", password: "different-secret" },
      range,
    );

    expect(seenAuth).toEqual([
      `Basic ${btoa("me:secret")}`,
      `Basic ${btoa("someone-else:different-secret")}`,
    ]);
  });
});

describe("getViewing", () => {
  test("returns null for a 404", async () => {
    globalThis.fetch = mock(
      async () => new Response("", { status: 404 }),
    ) as unknown as typeof fetch;
    expect(await getViewing(CONFIG, "missing-uid")).toBeNull();
  });

  test("parses a found event", async () => {
    const ical = serializeViewingToVEvent("uid-1", VIEWING);
    globalThis.fetch = mock(
      async () => new Response(ical, { status: 200 }),
    ) as unknown as typeof fetch;

    const viewing = await getViewing(CONFIG, "uid-1");
    expect(viewing?.title).toBe("Dune");
  });

  test("throws CaldavRequestFailedError on a server error", async () => {
    globalThis.fetch = mock(
      async () => new Response("", { status: 500 }),
    ) as unknown as typeof fetch;
    await expect(getViewing(CONFIG, "uid-1")).rejects.toThrow(CaldavRequestFailedError);
  });

  // A specific event's own resource URL, unlike REPORT's calendar-query,
  // is a real, cacheable GET — a CalDAV server's ETag/Last-Modified
  // headers can otherwise leave the browser serving last visit's stale
  // copy of just this one event even after it's genuinely changed
  // server-side, while listViewings's own REPORT (never cached by
  // browsers) always sees fresh data. Confirmed live: exactly one
  // venue's details page lagged behind a real server-side data refresh
  // that every other entry picked up immediately.
  test("forces the browser to skip its own HTTP cache for this event's resource", async () => {
    const ical = serializeViewingToVEvent("uid-1", VIEWING);
    const fetchMock = mock(async (_url: string, init: RequestInit) => {
      expect(init.cache).toBe("no-store");
      return new Response(ical, { status: 200 });
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await getViewing(CONFIG, "uid-1");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("createViewing / updateViewing", () => {
  test("PUTs a serialized VEVENT and returns the viewing with its UID", async () => {
    const fetchMock = mock(async (url: string, init: RequestInit) => {
      expect(init.method).toBe("PUT");
      expect(url).toContain(CONFIG.baseUrl);
      expect(url.endsWith(".ics")).toBe(true);
      return new Response("", { status: 201 });
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const created = await createViewing(CONFIG, VIEWING);
    expect(created.uid).toBeTruthy();
    expect(created.title).toBe("Dune");
    // #432: every write this app makes attributes itself.
    expect(created.lastModifiedBy).toBe("web");
  });

  test("updateViewing PUTs to the given UID's resource", async () => {
    const fetchMock = mock(async (url: string) => {
      expect(url).toContain("existing-uid.ics");
      return new Response("", { status: 204 });
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const updated = await updateViewing(CONFIG, "existing-uid", {
      ...VIEWING,
      title: "Dune: Part Two",
    });
    expect(updated).toEqual({
      uid: "existing-uid",
      ...VIEWING,
      title: "Dune: Part Two",
      lastModifiedBy: "web",
    });
  });

  // #294: this app's own X_PROPERTIES allow-list can't know about every
  // movie-planner extension in advance — confirmed this was silently
  // dropping an unrecognized one on any edit, since updateViewing used
  // to PUT a VEVENT regenerated purely from its own known fields.
  test("updateViewing preserves an existing VEVENT's properties this app doesn't itself know", async () => {
    const existingIcal = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//movie-planner//EN",
      "BEGIN:VEVENT",
      "UID:existing-uid",
      "DTSTAMP:20260101T000000Z",
      "DTSTART:20260101T190000Z",
      "DTEND:20260101T213000Z",
      "SUMMARY:Dune",
      "LOCATION:Pathé De Munt, Amsterdam, Netherlands",
      "X-FUTURE-FIELD:some value",
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n");

    const requests: { method: string }[] = [];
    let putBody = "";
    const fetchMock = mock(async (url: string, init?: RequestInit) => {
      expect(url).toContain("existing-uid.ics");
      const method = init?.method ?? "GET";
      requests.push({ method });
      if (method === "GET") return new Response(existingIcal, { status: 200 });
      putBody = String(init?.body ?? "");
      return new Response("", { status: 204 });
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await updateViewing(CONFIG, "existing-uid", { ...VIEWING, title: "Dune: Part Two" });

    expect(requests.map((r) => r.method)).toEqual(["GET", "PUT"]);
    expect(putBody).toContain("X-FUTURE-FIELD:some value");
    expect(putBody).toContain("SUMMARY:Dune: Part Two");
    // #432: written on every write this app makes.
    expect(putBody).toContain("X-LAST-MODIFIED-BY:web");
  });
});

describe("deleteViewing", () => {
  // #349: reads the resource first (best-effort, same pattern as
  // updateViewing's own preservation read) purely to grab a title for
  // the activity log — the DELETE itself doesn't need it.
  test("DELETEs the resource, after a best-effort read for the activity log", async () => {
    const requests: string[] = [];
    const fetchMock = mock(async (_url: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      requests.push(method);
      if (method === "GET")
        return new Response(serializeViewingToVEvent("uid-1", VIEWING), {
          status: 200,
        });
      return new Response("", { status: 204 });
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await deleteViewing(CONFIG, "uid-1");
    expect(requests).toEqual(["GET", "DELETE"]);
  });

  test("treats a 404 as already deleted rather than an error", async () => {
    globalThis.fetch = mock(
      async () => new Response("", { status: 404 }),
    ) as unknown as typeof fetch;
    await expect(deleteViewing(CONFIG, "already-gone")).resolves.toBeUndefined();
  });
});

describe("sidecar picklists", () => {
  test("getPicklists returns empty picklists when the sidecar doesn't exist yet", async () => {
    globalThis.fetch = mock(
      async () => new Response("", { status: 404 }),
    ) as unknown as typeof fetch;
    expect(await getPicklists(CONFIG)).toEqual({ media: [], venues: [] });
  });

  test("getPicklists parses an existing sidecar", async () => {
    const ical = serializePicklistsToVJournal({
      media: ["cinema"],
      venues: [{ name: "Grand Vista Cinema" }],
    });
    globalThis.fetch = mock(
      async () => new Response(ical, { status: 200 }),
    ) as unknown as typeof fetch;

    expect(await getPicklists(CONFIG)).toEqual({
      media: ["cinema"],
      venues: [{ name: "Grand Vista Cinema" }],
    });
  });

  test("getPicklists forces the browser to skip its own HTTP cache too, same as getViewing", async () => {
    const fetchMock = mock(async (_url: string, init: RequestInit) => {
      expect(init.cache).toBe("no-store");
      return new Response("", { status: 404 });
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await getPicklists(CONFIG);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test("updatePicklists PUTs the serialized sidecar to its well-known UID", async () => {
    const fetchMock = mock(async (url: string, init: RequestInit) => {
      expect(url).toContain("movie-planner-web-config.ics");
      expect(init.method).toBe("PUT");
      return new Response("", { status: 204 });
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await updatePicklists(CONFIG, { media: ["cinema"], venues: [] });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

// #749: pins the details the tests above can't tell apart from a lucky pass:
// the exact URL, headers, bodies and error messages each call sends, that
// every call validates its config first, and what reaches the activity log.
interface Call {
  url: string;
  init: RequestInit;
}

function recordFetch(respond: (call: Call) => Response): Call[] {
  const calls: Call[] = [];
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    const call = { url: String(url), init };
    calls.push(call);
    return respond(call);
  }) as unknown as typeof fetch;
  return calls;
}

const AUTH = `Basic ${btoa("me:secret")}`;
const INSECURE: CaldavConfig = { ...CONFIG, baseUrl: "http://caldav.example.com/" };
const RANGE = { from: "2026-01-01T00:00:00.000Z", to: "2026-02-01T10:20:30.000Z" };

describe("request details", () => {
  test("adds the missing trailing slash to the base URL, and keeps an existing one", async () => {
    const calls = recordFetch(() => new Response("", { status: 404 }));
    await getViewing({ ...CONFIG, baseUrl: "https://caldav.example.com/cal" }, "a b");
    await getViewing(CONFIG, "uid-1");
    expect(calls.map((c) => c.url)).toEqual([
      "https://caldav.example.com/cal/a%20b.ics",
      "https://caldav.example.com/calendars/me/movies/uid-1.ics",
    ]);
  });

  test("listViewings sends the calendar-query with compact UTC timestamps", async () => {
    const calls = recordFetch(
      () => new Response('<D:multistatus xmlns:D="DAV:"/>', { status: 207 }),
    );
    await listViewings(CONFIG, RANGE);
    const headers = calls[0]?.init.headers as Record<string, string>;
    expect(calls[0]?.url).toBe(CONFIG.baseUrl);
    expect(headers).toEqual({
      Authorization: AUTH,
      Depth: "1",
      "Content-Type": "application/xml; charset=utf-8",
    });
    const body = String(calls[0]?.init.body);
    expect(body).toContain('<?xml version="1.0" encoding="utf-8" ?>');
    expect(body).toContain("<C:calendar-query");
    expect(body).toContain('<C:comp-filter name="VCALENDAR">');
    expect(body).toContain('<C:comp-filter name="VEVENT">');
    expect(body).toContain('<C:time-range start="20260101T000000Z" end="20260201T102030Z"/>');
  });

  test("listViewings reports a failing server with its action and status", async () => {
    recordFetch(() => new Response("", { status: 503, statusText: "Unavailable" }));
    const error = await listViewings(CONFIG, RANGE).catch((e) => e);
    expect(error).toBeInstanceOf(CaldavRequestFailedError);
    expect(error.message).toBe(
      "listing events failed: the CalDAV server responded 503 Unavailable",
    );
    expect(error.status).toBe(503);
  });

  test("getViewing GETs with credentials, and names its action in a failure", async () => {
    const calls = recordFetch(() => new Response("", { status: 500, statusText: "Boom" }));
    const error = await getViewing(CONFIG, "uid-1").catch((e) => e);
    expect(calls[0]?.init.method).toBe("GET");
    expect(calls[0]?.init.headers).toEqual({ Authorization: AUTH });
    expect(error.message).toBe("getting event failed: the CalDAV server responded 500 Boom");
  });

  test("createViewing PUTs a body with no leftover lines, and names its action in a failure", async () => {
    const calls = recordFetch(() => new Response("", { status: 201 }));
    await createViewing(CONFIG, VIEWING);
    expect(calls[0]?.init.headers).toEqual({
      Authorization: AUTH,
      "Content-Type": "text/calendar; charset=utf-8",
    });
    expect(String(calls[0]?.init.body)).toContain("SUMMARY:Dune");
    expect(String(calls[0]?.init.body)).not.toContain("Stryker");

    recordFetch(() => new Response("", { status: 403, statusText: "Nope" }));
    const error = await createViewing(CONFIG, VIEWING).catch((e) => e);
    expect(error.message).toBe("saving event failed: the CalDAV server responded 403 Nope");
  });

  test("updateViewing carries nothing extra forward when the read fails", async () => {
    const calls = recordFetch(({ init }) =>
      init.method === "GET" ? new Response("", { status: 500 }) : new Response("", { status: 204 }),
    );
    await updateViewing(CONFIG, "uid-1", VIEWING);
    expect(String(calls[1]?.init.body)).not.toContain("Stryker");
    expect(String(calls[1]?.init.body)).toContain("SUMMARY:Dune");
  });

  test("deleteViewing sends credentials and names its action in a failure", async () => {
    const calls = recordFetch(({ init }) =>
      init.method === "GET"
        ? new Response("", { status: 404 })
        : new Response("", { status: 500, statusText: "Boom" }),
    );
    const error = await deleteViewing(CONFIG, "uid-1").catch((e) => e);
    expect(calls[1]?.init.method).toBe("DELETE");
    expect(calls[1]?.init.headers).toEqual({ Authorization: AUTH });
    expect(error.message).toBe("deleting event failed: the CalDAV server responded 500 Boom");
  });

  test("getPicklists GETs the sidecar with credentials", async () => {
    const calls = recordFetch(() => new Response("", { status: 404 }));
    await getPicklists(CONFIG);
    expect(calls[0]?.init.method).toBe("GET");
    expect(calls[0]?.init.headers).toEqual({ Authorization: AUTH });
  });

  test("getPicklists ignores the body of a failing response", async () => {
    const ical = serializePicklistsToVJournal({ media: ["cinema"], venues: [] });
    recordFetch(() => new Response(ical, { status: 500 }));
    expect(await getPicklists(CONFIG)).toEqual({ media: [], venues: [] });
  });

  test("updatePicklists PUTs with credentials and a calendar body, and names its action in a failure", async () => {
    const calls = recordFetch(() => new Response("", { status: 204 }));
    await updatePicklists(CONFIG, { media: ["cinema"], venues: [] });
    expect(calls[0]?.init.headers).toEqual({
      Authorization: AUTH,
      "Content-Type": "text/calendar; charset=utf-8",
    });
    expect(String(calls[0]?.init.body)).toBe(
      serializePicklistsToVJournal({ media: ["cinema"], venues: [] }),
    );

    recordFetch(() => new Response("", { status: 500, statusText: "Boom" }));
    const error = await updatePicklists(CONFIG, { media: [], venues: [] }).catch((e) => e);
    expect(error.message).toBe(
      "saving the picklist sidecar failed: the CalDAV server responded 500 Boom",
    );
  });
});

describe("config validation", () => {
  test("every call rejects an insecure base URL before any request", async () => {
    const calls = recordFetch(() => new Response("", { status: 200 }));
    const attempts = [
      () => getViewing(INSECURE, "uid-1"),
      () => createViewing(INSECURE, VIEWING),
      () => updateViewing(INSECURE, "uid-1", VIEWING),
      () => deleteViewing(INSECURE, "uid-1"),
      () => getPicklists(INSECURE),
      () => updatePicklists(INSECURE, { media: [], venues: [] }),
    ];
    for (const attempt of attempts) {
      await expect(attempt()).rejects.toThrow(InvalidCaldavUrlError);
    }
    expect(calls).toHaveLength(0);
  });
});

describe("activity log", () => {
  let appended: Record<string, unknown>[];
  let removed: string[];
  let appendSpy: ReturnType<typeof spyOn>;
  let removeSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    appended = [];
    removed = [];
    appendSpy = spyOn(getActivityLogStore(), "append").mockImplementation((async (
      entry: Record<string, unknown>,
    ) => {
      appended.push(entry);
    }) as never);
    removeSpy = spyOn(getCaldavSnapshotStore(), "remove").mockImplementation((async (
      uid: string,
    ) => {
      removed.push(uid);
    }) as never);
  });

  afterEach(() => {
    appendSpy.mockRestore();
    removeSpy.mockRestore();
  });

  test("createViewing logs a web-made create", async () => {
    recordFetch(() => new Response("", { status: 201 }));
    const created = await createViewing(CONFIG, VIEWING);
    expect(appended).toHaveLength(1);
    expect(appended[0]).toMatchObject({
      action: "created",
      uid: created.uid,
      title: "Dune",
      actor: "web",
    });
  });

  test("updateViewing logs a web-made update with its changes", async () => {
    const existing = serializeViewingToVEvent("uid-1", VIEWING);
    recordFetch(({ init }) =>
      init.method === "GET"
        ? new Response(existing, { status: 200 })
        : new Response("", { status: 204 }),
    );
    await updateViewing(CONFIG, "uid-1", { ...VIEWING, title: "Dune: Part Two" });
    expect(appended).toHaveLength(1);
    expect(appended[0]).toMatchObject({
      action: "updated",
      uid: "uid-1",
      title: "Dune: Part Two",
      actor: "web",
    });
    expect(appended[0]?.changes).toEqual([expect.objectContaining({ field: "title" })]);
  });

  test("updateViewing logs nothing when nothing changed", async () => {
    const existing = serializeViewingToVEvent("uid-1", VIEWING);
    recordFetch(({ init }) =>
      init.method === "GET"
        ? new Response(existing, { status: 200 })
        : new Response("", { status: 204 }),
    );
    await updateViewing(CONFIG, "uid-1", VIEWING);
    expect(appended).toHaveLength(0);
  });

  test("deleteViewing logs the title it read, and forgets the snapshot entry", async () => {
    recordFetch(({ init }) =>
      init.method === "GET"
        ? new Response(serializeViewingToVEvent("uid-1", VIEWING), { status: 200 })
        : new Response("", { status: 204 }),
    );
    await deleteViewing(CONFIG, "uid-1");
    expect(appended).toHaveLength(1);
    expect(appended[0]).toMatchObject({
      action: "deleted",
      uid: "uid-1",
      title: "Dune",
      actor: "web",
    });
    expect(removed).toEqual(["uid-1"]);
  });
});
