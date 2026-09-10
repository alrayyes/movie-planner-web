import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { serializeViewingToVEvent } from "../caldav/ical";
import type { CaldavConfig, NewViewing } from "../caldav/types";
import { refreshAllMetadata, refreshMetadata } from "./refresh-actions";

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

// A single fetch router covering both this app's own CalDAV server and
// OMDb — the same two hosts a real refresh actually talks to, so these
// tests exercise the whole "re-fetch, then look up, then save" flow
// rather than each leg in isolation.
function routeFetch(handlers: {
  caldavGet?: () => Response;
  caldavPut?: (body: string) => Response;
  omdbSearchByTitle?: (title: string, year: string | null) => Response;
  omdbSearchList?: (title: string) => Response;
  omdbById?: (imdbId: string) => Response;
}) {
  return mock(async (url: string | URL, init?: RequestInit) => {
    const u = new URL(url.toString());
    if (u.hostname === "caldav.example.com") {
      if ((init?.method ?? "GET") === "PUT") {
        return handlers.caldavPut?.(String(init?.body)) ?? new Response("", { status: 201 });
      }
      return handlers.caldavGet?.() ?? new Response("", { status: 404 });
    }
    // OMDb
    if (u.searchParams.get("i")) {
      return (
        handlers.omdbById?.(u.searchParams.get("i") as string) ?? new Response("", { status: 404 })
      );
    }
    if (u.searchParams.get("s")) {
      return (
        handlers.omdbSearchList?.(u.searchParams.get("s") as string) ??
        new Response("", { status: 404 })
      );
    }
    return (
      handlers.omdbSearchByTitle?.(u.searchParams.get("t") as string, u.searchParams.get("y")) ??
      new Response("", { status: 404 })
    );
  });
}

const NO_MATCH = JSON.stringify({ Response: "False" });

describe("refreshMetadata", () => {
  // movie-editing spec: "Already matched elsewhere since the list loaded"
  test("skips the OMDb call when the freshly-fetched entry already has an imdbId and poster", async () => {
    const matched: NewViewing = {
      ...VIEWING,
      imdbId: "tt1160419",
      posterUrl: "https://example.com/dune.jpg",
    };
    const fetchMock = routeFetch({
      caldavGet: () => new Response(serializeViewingToVEvent("uid-1", matched), { status: 200 }),
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const result = await refreshMetadata({
      config: CONFIG,
      omdbApiKey: "test-key",
      viewing: { ...matched, uid: "uid-1" },
    });

    expect(result.kind).toBe("already-up-to-date");
    // Only the CalDAV GET, never an OMDb call.
    expect(
      fetchMock.mock.calls.every(([u]) => new URL(u.toString()).hostname === "caldav.example.com"),
    ).toBe(true);
  });

  // movie-editing spec: "Calendar entry re-checked before calling OMDb" +
  // "Stale metadata refreshed"
  test("re-fetches the CalDAV entry, then overwrites its OMDb-sourced fields on a confident match", async () => {
    const fetchMock = routeFetch({
      caldavGet: () => new Response(serializeViewingToVEvent("uid-1", VIEWING), { status: 200 }),
      caldavPut: () => new Response("", { status: 201 }),
      omdbSearchByTitle: (title) => {
        expect(title).toBe("Dune");
        return new Response(
          JSON.stringify({
            Response: "True",
            Director: "Denis Villeneuve",
            Genre: "Sci-Fi",
            Year: "2021",
            Poster: "https://example.com/dune.jpg",
            imdbID: "tt1160419",
          }),
          { status: 200 },
        );
      },
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const result = await refreshMetadata({
      config: CONFIG,
      omdbApiKey: "test-key",
      viewing: { ...VIEWING, uid: "uid-1" },
    });

    expect(result.kind).toBe("refreshed");
    const put = fetchMock.mock.calls.find(([, init]) => init?.method === "PUT");
    expect(put).toBeTruthy();
    expect(String(put?.[1]?.body)).toContain("tt1160419");
  });

  test("reports no-match when OMDb has neither a confident match nor any search candidates", async () => {
    const fetchMock = routeFetch({
      caldavGet: () => new Response(serializeViewingToVEvent("uid-1", VIEWING), { status: 200 }),
      omdbSearchByTitle: () => new Response(NO_MATCH, { status: 200 }),
      omdbSearchList: () => new Response(NO_MATCH, { status: 200 }),
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const result = await refreshMetadata({
      config: CONFIG,
      omdbApiKey: "test-key",
      viewing: { ...VIEWING, uid: "uid-1" },
    });

    expect(result.kind).toBe("no-match");
  });

  // movie-editing spec: "No confident match on refresh"
  test("offers disambiguation candidates when OMDb's search has some but no single confident match", async () => {
    const fetchMock = routeFetch({
      caldavGet: () => new Response(serializeViewingToVEvent("uid-1", VIEWING), { status: 200 }),
      omdbSearchByTitle: () => new Response(NO_MATCH, { status: 200 }),
      omdbSearchList: () =>
        new Response(
          JSON.stringify({
            Response: "True",
            Search: [{ Title: "Dune", Year: "2021", imdbID: "tt1160419", Poster: "N/A" }],
          }),
          { status: 200 },
        ),
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const result = await refreshMetadata({
      config: CONFIG,
      omdbApiKey: "test-key",
      viewing: { ...VIEWING, uid: "uid-1" },
    });

    expect(result.kind).toBe("needs-picker");
    if (result.kind === "needs-picker") {
      expect(result.candidates).toEqual([
        { title: "Dune", year: "2021", imdbId: "tt1160419", posterUrl: undefined },
      ]);
    }
  });
});

describe("refreshAllMetadata", () => {
  test("refreshes every target sequentially and reports refreshed/miss counts", async () => {
    const fetchMock = routeFetch({
      caldavPut: () => new Response("", { status: 201 }),
      omdbSearchByTitle: (title) =>
        title === "Dune"
          ? new Response(
              JSON.stringify({
                Response: "True",
                imdbID: "tt1160419",
                Poster: "https://example.com/dune.jpg",
              }),
              { status: 200 },
            )
          : new Response(NO_MATCH, { status: 200 }),
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const progress: [number, number, number][] = [];
    const result = await refreshAllMetadata({
      config: CONFIG,
      omdbApiKey: "test-key",
      targets: [
        { ...VIEWING, uid: "uid-1" },
        { ...VIEWING, uid: "uid-2", title: "Some Unmatched Title" },
      ],
      onProgress: (refreshed, misses, total) => progress.push([refreshed, misses, total]),
    });

    expect(result).toEqual({ refreshed: 1, misses: 1 });
    expect(progress.at(-1)).toEqual([1, 1, 2]);
  });

  // movie-editing spec: "Some titles have no match" — one failure doesn't
  // abort the rest of the batch.
  test("a lookup failure for one target doesn't stop the rest of the batch", async () => {
    let calls = 0;
    globalThis.fetch = mock(async (url: string | URL) => {
      const u = new URL(url.toString());
      if (u.hostname === "caldav.example.com") return new Response("", { status: 201 });
      calls++;
      if (calls === 1) throw new Error("network blip");
      return new Response(
        JSON.stringify({
          Response: "True",
          imdbID: "tt1160419",
          Poster: "https://example.com/x.jpg",
        }),
        { status: 200 },
      );
    }) as unknown as typeof fetch;

    const result = await refreshAllMetadata({
      config: CONFIG,
      omdbApiKey: "test-key",
      targets: [
        { ...VIEWING, uid: "uid-1" },
        { ...VIEWING, uid: "uid-2" },
      ],
      onProgress: () => {},
    });

    expect(result).toEqual({ refreshed: 1, misses: 1 });
  });
});
