import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
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
    expect(updated).toEqual({ uid: "existing-uid", ...VIEWING, title: "Dune: Part Two" });
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
  });
});

describe("deleteViewing", () => {
  test("DELETEs the resource", async () => {
    const fetchMock = mock(async (_url: string, init: RequestInit) => {
      expect(init.method).toBe("DELETE");
      return new Response("", { status: 204 });
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await deleteViewing(CONFIG, "uid-1");
    expect(fetchMock).toHaveBeenCalledTimes(1);
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
      venues: ["Grand Vista Cinema"],
    });
    globalThis.fetch = mock(
      async () => new Response(ical, { status: 200 }),
    ) as unknown as typeof fetch;

    expect(await getPicklists(CONFIG)).toEqual({
      media: ["cinema"],
      venues: ["Grand Vista Cinema"],
    });
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
