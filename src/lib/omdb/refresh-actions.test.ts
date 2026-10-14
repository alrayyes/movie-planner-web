import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { serializeViewingToVEvent } from "../caldav/ical";
import type { CaldavConfig, NewViewing } from "../caldav/types";
import {
  applyOmdbCandidate,
  noMatchMessage,
  refreshAllMetadata,
  refreshMetadata,
} from "./refresh-actions";

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
  test("skips the OMDb call when the freshly-fetched entry already has everything OMDb would fill in", async () => {
    const matched: NewViewing = {
      ...VIEWING,
      imdbId: "tt1160419",
      posterUrl: "https://example.com/dune.jpg",
      director: "Denis Villeneuve",
      actors: "Timothée Chalamet",
      genre: "Drama",
      synopsis: "A desert planet.",
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

  // #877: a poster and an IMDb ID used to be enough to say "already up to date",
  // which left a director, actors, genre or synopsis that were never filled in
  // out of reach of the refresh button.
  test("still calls OMDb when the entry has a poster and an imdbId but no synopsis", async () => {
    const partial: NewViewing = {
      ...VIEWING,
      imdbId: "tt1160419",
      posterUrl: "https://example.com/dune.jpg",
    };
    const fetchMock = routeFetch({
      caldavGet: () => new Response(serializeViewingToVEvent("uid-1", partial), { status: 200 }),
      caldavPut: () => new Response("", { status: 201 }),
      omdbById: () =>
        new Response(
          JSON.stringify({
            Response: "True",
            Director: "Denis Villeneuve",
            Plot: "A desert planet.",
            Poster: "https://example.com/dune.jpg",
            imdbID: "tt1160419",
          }),
          { status: 200 },
        ),
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const result = await refreshMetadata({
      config: CONFIG,
      omdbApiKey: "test-key",
      viewing: { ...partial, uid: "uid-1" },
    });

    expect(result.kind).toBe("refreshed");
    const put = fetchMock.mock.calls.find(([, init]) => init?.method === "PUT");
    expect(String(put?.[1]?.body)).toContain("A desert planet.");
  });

  // #881: OMDb answers N/A for what it doesn't have, which parses to undefined,
  // and spreading that over the entry used to blank a value already there.
  test("keeps a value OMDb has no answer for instead of blanking it", async () => {
    const partial: NewViewing = {
      ...VIEWING,
      imdbId: "tt1160419",
      posterUrl: "https://example.com/dune.jpg",
      director: "Denis Villeneuve",
    };
    const fetchMock = routeFetch({
      caldavGet: () => new Response(serializeViewingToVEvent("uid-1", partial), { status: 200 }),
      caldavPut: () => new Response("", { status: 201 }),
      omdbById: () =>
        new Response(
          JSON.stringify({
            Response: "True",
            Director: "N/A",
            Plot: "A desert planet.",
            Poster: "https://example.com/dune.jpg",
            imdbID: "tt1160419",
          }),
          { status: 200 },
        ),
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await refreshMetadata({
      config: CONFIG,
      omdbApiKey: "test-key",
      viewing: { ...partial, uid: "uid-1" },
    });

    const body = String(fetchMock.mock.calls.find(([, init]) => init?.method === "PUT")?.[1]?.body);
    expect(body).toContain("Denis Villeneuve");
    expect(body).toContain("A desert planet.");
  });

  // #881: a match the visitor chose, or corrected by hand, is what a refresh asks
  // OMDb about. Looking the title up again could swap it for another film.
  test("looks the entry up by its own IMDb ID, not by title, and keeps that ID", async () => {
    const chosen: NewViewing = { ...VIEWING, imdbId: "tt0087182", year: "1984" };
    const asked: string[] = [];
    const fetchMock = routeFetch({
      caldavGet: () => new Response(serializeViewingToVEvent("uid-1", chosen), { status: 200 }),
      caldavPut: () => new Response("", { status: 201 }),
      omdbById: (id) => {
        asked.push(id);
        return new Response(
          JSON.stringify({
            Response: "True",
            Director: "David Lynch",
            Poster: "https://example.com/dune-1984.jpg",
            imdbID: "tt0087182",
          }),
          { status: 200 },
        );
      },
      omdbSearchByTitle: () => {
        throw new Error("must not look the title up");
      },
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const result = await refreshMetadata({
      config: CONFIG,
      omdbApiKey: "test-key",
      viewing: { ...chosen, uid: "uid-1" },
    });

    expect(result.kind).toBe("refreshed");
    expect(asked).toEqual(["tt0087182"]);
    const put = fetchMock.mock.calls.find(([, init]) => init?.method === "PUT");
    expect(String(put?.[1]?.body)).toContain("tt0087182");
    expect(String(put?.[1]?.body)).toContain("David Lynch");
  });

  test("reports no match, without trying the title, when OMDb has nothing for the entry's own ID", async () => {
    const chosen: NewViewing = { ...VIEWING, imdbId: "tt0087182" };
    const fetchMock = routeFetch({
      caldavGet: () => new Response(serializeViewingToVEvent("uid-1", chosen), { status: 200 }),
      omdbById: () => new Response(NO_MATCH, { status: 200 }),
      omdbSearchByTitle: () => {
        throw new Error("must not look the title up");
      },
      omdbSearchList: () => {
        throw new Error("must not search");
      },
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const result = await refreshMetadata({
      config: CONFIG,
      omdbApiKey: "test-key",
      viewing: { ...chosen, uid: "uid-1" },
    });

    expect(result).toEqual({ kind: "no-match", imdbId: "tt0087182" });
  });

  // #113: a CLI-logged entry has an IMDb ID from its description and nothing else.
  test("a bare IMDb ID from the CLI gets its poster through the by-ID lookup", async () => {
    const bare: NewViewing = { ...VIEWING, imdbId: "tt1160419" };
    const fetchMock = routeFetch({
      caldavGet: () => new Response(serializeViewingToVEvent("uid-1", bare), { status: 200 }),
      caldavPut: () => new Response("", { status: 201 }),
      omdbById: () =>
        new Response(
          JSON.stringify({
            Response: "True",
            Poster: "https://example.com/dune.jpg",
            imdbID: "tt1160419",
          }),
          { status: 200 },
        ),
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const result = await refreshMetadata({
      config: CONFIG,
      omdbApiKey: "test-key",
      viewing: { ...bare, uid: "uid-1" },
    });

    expect(result.kind).toBe("refreshed");
    const put = fetchMock.mock.calls.find(([, init]) => init?.method === "PUT");
    expect(String(put?.[1]?.body)).toContain("https://example.com/dune.jpg");
  });

  test("says the ID is the problem when an entry with an ID has no match, and the title when it has none", () => {
    expect(noMatchMessage({ imdbId: "tt0087182" })).toBe(
      "OMDb has nothing for IMDb ID tt0087182. Use Search OMDb to pick another match.",
    );
    expect(noMatchMessage({})).toBe("OMDb had no match for this title.");
  });

  test("refresh all also goes by the entry's own IMDb ID", async () => {
    const chosen: NewViewing = { ...VIEWING, imdbId: "tt0087182" };
    const asked: string[] = [];
    const fetchMock = routeFetch({
      caldavPut: () => new Response("", { status: 201 }),
      omdbById: (id) => {
        asked.push(id);
        return new Response(
          JSON.stringify({ Response: "True", Director: "David Lynch", imdbID: "tt0087182" }),
          { status: 200 },
        );
      },
      omdbSearchByTitle: () => {
        throw new Error("must not look the title up");
      },
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const result = await refreshAllMetadata({
      config: CONFIG,
      omdbApiKey: "test-key",
      targets: [{ ...chosen, uid: "uid-1" }],
      onProgress: () => {},
    });

    expect(result).toEqual({ refreshed: 1, misses: 0 });
    expect(asked).toEqual(["tt0087182"]);
  });

  test("the picker's choice and the bulk refresh keep what OMDb has no answer for too", async () => {
    const partial: NewViewing = { ...VIEWING, director: "Denis Villeneuve" };
    const omdb = () =>
      new Response(
        JSON.stringify({
          Response: "True",
          Director: "N/A",
          Plot: "A desert planet.",
          imdbID: "tt1160419",
        }),
        { status: 200 },
      );
    const fetchMock = routeFetch({
      caldavPut: () => new Response("", { status: 201 }),
      omdbById: omdb,
      omdbSearchByTitle: omdb,
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await applyOmdbCandidate({
      config: CONFIG,
      omdbApiKey: "test-key",
      current: { ...partial, uid: "uid-1" },
      candidate: { imdbId: "tt1160419", title: "Dune", year: "2021" },
    });
    await refreshAllMetadata({
      config: CONFIG,
      omdbApiKey: "test-key",
      targets: [{ ...partial, uid: "uid-1" }],
      onProgress: () => {},
    });

    const puts = fetchMock.mock.calls.filter(([, init]) => init?.method === "PUT");
    expect(puts).toHaveLength(2);
    for (const [, init] of puts) {
      expect(String(init?.body)).toContain("Denis Villeneuve");
      expect(String(init?.body)).toContain("A desert planet.");
    }
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
