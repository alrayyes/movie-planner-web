import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { enrichWithTmdb, lookupTmdbByImdbId } from "./client";

let originalFetch: typeof fetch;

beforeEach(() => {
  originalFetch = globalThis.fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

// A minimal movie/{id} response with every optional bit absent — the
// baseline every "field X is present" test below starts from and
// overrides just the bit it's checking.
const MINIMAL_MOVIE_RESPONSE = {
  budget: 0,
  popularity: 0,
  credits: { cast: [] },
  videos: { results: [] },
  release_dates: { results: [] },
  keywords: { keywords: [] },
};

function mockFindThenMovie(
  movieResponse: unknown,
  findResult: unknown = { movie_results: [{ id: 438631 }] },
) {
  globalThis.fetch = (async (url: URL) => {
    const target = url.toString();
    if (target.includes("/find/")) {
      return new Response(JSON.stringify(findResult), { status: 200 });
    }
    return new Response(JSON.stringify(movieResponse), { status: 200 });
  }) as unknown as typeof fetch;
}

describe("lookupTmdbByImdbId", () => {
  test("resolves TMDb's numeric id via find/{imdb_id}, never a title/year search", async () => {
    let findUrl = "";
    let movieUrl = "";
    globalThis.fetch = (async (url: URL) => {
      const target = url.toString();
      if (target.includes("/find/")) {
        findUrl = target;
        return new Response(JSON.stringify({ movie_results: [{ id: 438631 }] }), { status: 200 });
      }
      movieUrl = target;
      return new Response(JSON.stringify(MINIMAL_MOVIE_RESPONSE), { status: 200 });
    }) as unknown as typeof fetch;

    await lookupTmdbByImdbId("test-tmdb-key", "tt1160419");

    expect(findUrl).toContain("/find/tt1160419");
    expect(findUrl).toContain("external_source=imdb_id");
    expect(findUrl).toContain("api_key=test-tmdb-key");
    expect(movieUrl).toContain("/movie/438631");
    expect(movieUrl).toContain("append_to_response=credits%2Cvideos%2Crelease_dates%2Ckeywords");
  });

  test("returns null when find/{imdb_id} has no match (empty movie_results)", async () => {
    globalThis.fetch = (async (url: URL) => {
      if (url.toString().includes("/find/")) {
        return new Response(JSON.stringify({ movie_results: [] }), { status: 200 });
      }
      throw new Error("movie/{id} should never be called with no resolved TMDb id");
    }) as unknown as typeof fetch;

    expect(await lookupTmdbByImdbId("test-tmdb-key", "tt0000000")).toBeNull();
  });

  test("returns null when the find request itself fails", async () => {
    globalThis.fetch = (async () => new Response("", { status: 401 })) as unknown as typeof fetch;

    expect(await lookupTmdbByImdbId("bad-key", "tt1160419")).toBeNull();
  });

  test("returns null when the movie request fails after a successful find", async () => {
    globalThis.fetch = (async (url: URL) => {
      if (url.toString().includes("/find/")) {
        return new Response(JSON.stringify({ movie_results: [{ id: 438631 }] }), { status: 200 });
      }
      return new Response("", { status: 500 });
    }) as unknown as typeof fetch;

    expect(await lookupTmdbByImdbId("test-tmdb-key", "tt1160419")).toBeNull();
  });

  test("extracts an official YouTube trailer from videos", async () => {
    mockFindThenMovie({
      ...MINIMAL_MOVIE_RESPONSE,
      videos: {
        results: [
          { key: "unofficial", site: "YouTube", type: "Trailer", official: false },
          { key: "vimeo-one", site: "Vimeo", type: "Trailer", official: true },
          { key: "abc123", site: "YouTube", type: "Trailer", official: true },
        ],
      },
    });

    const result = await lookupTmdbByImdbId("test-tmdb-key", "tt1160419");
    expect(result?.trailerUrl).toBe("https://www.youtube.com/watch?v=abc123");
  });

  test("omits trailerUrl when there's no official YouTube trailer", async () => {
    mockFindThenMovie({
      ...MINIMAL_MOVIE_RESPONSE,
      videos: { results: [{ key: "abc123", site: "YouTube", type: "Trailer", official: false }] },
    });

    const result = await lookupTmdbByImdbId("test-tmdb-key", "tt1160419");
    expect(result?.trailerUrl).toBeUndefined();
  });

  test("extracts a collection name when the movie belongs to one", async () => {
    mockFindThenMovie({
      ...MINIMAL_MOVIE_RESPONSE,
      belongs_to_collection: { id: 1, name: "Dune Collection" },
    });

    const result = await lookupTmdbByImdbId("test-tmdb-key", "tt1160419");
    expect(result?.collection).toBe("Dune Collection");
  });

  test("omits collection when the movie belongs to none", async () => {
    mockFindThenMovie({ ...MINIMAL_MOVIE_RESPONSE, belongs_to_collection: null });

    const result = await lookupTmdbByImdbId("test-tmdb-key", "tt1160419");
    expect(result?.collection).toBeUndefined();
  });

  test("extracts a US certification from release_dates, ignoring other countries", async () => {
    mockFindThenMovie({
      ...MINIMAL_MOVIE_RESPONSE,
      release_dates: {
        results: [
          { iso_3166_1: "GB", release_dates: [{ certification: "12A" }] },
          { iso_3166_1: "US", release_dates: [{ certification: "" }, { certification: "PG-13" }] },
        ],
      },
    });

    const result = await lookupTmdbByImdbId("test-tmdb-key", "tt1160419");
    expect(result?.certification).toBe("PG-13");
  });

  test("omits certification when there's no US release entry", async () => {
    mockFindThenMovie({
      ...MINIMAL_MOVIE_RESPONSE,
      release_dates: { results: [{ iso_3166_1: "GB", release_dates: [{ certification: "12A" }] }] },
    });

    const result = await lookupTmdbByImdbId("test-tmdb-key", "tt1160419");
    expect(result?.certification).toBeUndefined();
  });

  test("joins keywords into a comma-separated list", async () => {
    mockFindThenMovie({
      ...MINIMAL_MOVIE_RESPONSE,
      keywords: {
        keywords: [
          { id: 1, name: "epic" },
          { id: 2, name: "desert" },
        ],
      },
    });

    const result = await lookupTmdbByImdbId("test-tmdb-key", "tt1160419");
    expect(result?.keywords).toBe("epic, desert");
  });

  test("omits keywords when TMDb has none", async () => {
    mockFindThenMovie(MINIMAL_MOVIE_RESPONSE);

    const result = await lookupTmdbByImdbId("test-tmdb-key", "tt1160419");
    expect(result?.keywords).toBeUndefined();
  });

  test("returns budget as a string when TMDb has a real, nonzero value", async () => {
    mockFindThenMovie({ ...MINIMAL_MOVIE_RESPONSE, budget: 165_000_000 });

    const result = await lookupTmdbByImdbId("test-tmdb-key", "tt1160419");
    expect(result?.budget).toBe("165000000");
  });

  // #tasks.md 2.2: TMDb reports a budget it genuinely has nothing for as
  // 0, not by omitting the field — same "not entered" treatment OMDb's
  // own "N/A" gets.
  test('treats a budget of 0 as "not entered"', async () => {
    mockFindThenMovie({ ...MINIMAL_MOVIE_RESPONSE, budget: 0 });

    const result = await lookupTmdbByImdbId("test-tmdb-key", "tt1160419");
    expect(result?.budget).toBeUndefined();
  });

  test("returns popularity as a string when TMDb has a real, nonzero value", async () => {
    mockFindThenMovie({ ...MINIMAL_MOVIE_RESPONSE, popularity: 123.456 });

    const result = await lookupTmdbByImdbId("test-tmdb-key", "tt1160419");
    expect(result?.popularity).toBe("123.456");
  });

  test("treats a popularity of 0 as not entered, same as budget", async () => {
    mockFindThenMovie({ ...MINIMAL_MOVIE_RESPONSE, popularity: 0 });

    const result = await lookupTmdbByImdbId("test-tmdb-key", "tt1160419");
    expect(result?.popularity).toBeUndefined();
  });

  test("returns the top-billed cast, ordered, as a comma-separated list", async () => {
    mockFindThenMovie({
      ...MINIMAL_MOVIE_RESPONSE,
      credits: {
        cast: [
          { name: "Third Billed", order: 2 },
          { name: "Top Billed", order: 0 },
          { name: "Second Billed", order: 1 },
        ],
      },
    });

    const result = await lookupTmdbByImdbId("test-tmdb-key", "tt1160419");
    expect(result?.actors).toBe("Top Billed, Second Billed, Third Billed");
  });

  test("omits actors when TMDb's credits have no cast", async () => {
    mockFindThenMovie(MINIMAL_MOVIE_RESPONSE);

    const result = await lookupTmdbByImdbId("test-tmdb-key", "tt1160419");
    expect(result?.actors).toBeUndefined();
  });

  test("returns the homepage as website", async () => {
    mockFindThenMovie({ ...MINIMAL_MOVIE_RESPONSE, homepage: "https://dunemovie.com" });

    const result = await lookupTmdbByImdbId("test-tmdb-key", "tt1160419");
    expect(result?.website).toBe("https://dunemovie.com");
  });

  test("omits website when TMDb has no homepage", async () => {
    mockFindThenMovie({ ...MINIMAL_MOVIE_RESPONSE, homepage: "" });

    const result = await lookupTmdbByImdbId("test-tmdb-key", "tt1160419");
    expect(result?.website).toBeUndefined();
  });
});

// #tasks.md 2.3: the shared enrichment helper every call site uses —
// covers all three skip conditions (no key, no imdb_id, no match) plus
// the "never blank an existing value" merge rule for actors/website.
describe("enrichWithTmdb", () => {
  test("returns undefined when no TMDb key is configured", async () => {
    globalThis.fetch = (async () => {
      throw new Error("must not call TMDb with no key");
    }) as unknown as typeof fetch;

    expect(await enrichWithTmdb(undefined, "tt1160419")).toBeUndefined();
  });

  test("returns undefined when no IMDb id has been resolved", async () => {
    globalThis.fetch = (async () => {
      throw new Error("must not call TMDb with no imdb_id — never a title search");
    }) as unknown as typeof fetch;

    expect(await enrichWithTmdb("test-tmdb-key", undefined)).toBeUndefined();
  });

  test("returns undefined when TMDb has no match for the resolved IMDb id", async () => {
    globalThis.fetch = (async (url: URL) => {
      expect(url.toString()).toContain("/find/");
      return new Response(JSON.stringify({ movie_results: [] }), { status: 200 });
    }) as unknown as typeof fetch;

    expect(await enrichWithTmdb("test-tmdb-key", "tt0000000")).toBeUndefined();
  });

  test("returns only the fields TMDb actually has, omitting the rest entirely", async () => {
    mockFindThenMovie({
      ...MINIMAL_MOVIE_RESPONSE,
      videos: {
        results: [{ key: "abc123", site: "YouTube", type: "Trailer", official: true }],
      },
    });

    const result = await enrichWithTmdb("test-tmdb-key", "tt1160419");
    expect(result).toEqual({ trailerUrl: "https://www.youtube.com/watch?v=abc123" });
    expect(result && "collection" in result).toBe(false);
    expect(result && "actors" in result).toBe(false);
    expect(result && "website" in result).toBe(false);
  });

  test("includes actors/website only when TMDb has richer data — never an explicit blank", async () => {
    mockFindThenMovie(MINIMAL_MOVIE_RESPONSE);

    const result = await enrichWithTmdb("test-tmdb-key", "tt1160419");
    // TMDb had nothing at all beyond a bare match — every field omitted,
    // so merging this into an existing viewing can't blank anything.
    expect(result).toEqual({});
  });

  // A network-level failure (as opposed to a plain non-ok response,
  // already handled inside lookupTmdbByImdbId) must degrade the same
  // graceful way — every caller runs this after an already-successful
  // OMDb match, which a thrown TMDb error must never take down with it.
  test("returns undefined, rather than throwing, when the underlying fetch itself rejects", async () => {
    globalThis.fetch = (async () => {
      throw new Error("network down");
    }) as unknown as typeof fetch;

    expect(await enrichWithTmdb("test-tmdb-key", "tt1160419")).toBeUndefined();
  });
});
