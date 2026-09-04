import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { lookupByImdbId, lookupMovie, searchMovies } from "./client";

let originalFetch: typeof fetch;

beforeEach(() => {
  originalFetch = globalThis.fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("lookupMovie", () => {
  test("returns ratings, director, actors, genre, year, poster and imdbId on a match", async () => {
    globalThis.fetch = (async (url: URL) => {
      expect(url.toString()).toContain("t=Dune");
      expect(url.toString()).toContain("apikey=test-key");
      return new Response(
        JSON.stringify({
          Response: "True",
          Director: "Denis Villeneuve",
          Actors: "Timothée Chalamet, Rebecca Ferguson",
          Genre: "Action, Adventure, Drama",
          Year: "2021",
          Poster: "https://example.com/dune-poster.jpg",
          imdbID: "tt1160419",
          Ratings: [
            { Source: "Internet Movie Database", Value: "8.5/10" },
            { Source: "Rotten Tomatoes", Value: "92%" },
            { Source: "Metacritic", Value: "79/100" },
          ],
        }),
        { status: 200 },
      );
    }) as unknown as typeof fetch;

    const result = await lookupMovie("test-key", "Dune");

    expect(result).toEqual({
      ratingImdb: "8.5/10",
      ratingRottenTomatoes: "92%",
      ratingMetacritic: "79/100",
      director: "Denis Villeneuve",
      actors: "Timothée Chalamet, Rebecca Ferguson",
      genre: "Action, Adventure, Drama",
      year: "2021",
      posterUrl: "https://example.com/dune-poster.jpg",
      imdbId: "tt1160419",
    });
  });

  test("tries a year-scoped search first when a year is given", async () => {
    globalThis.fetch = (async (url: URL) => {
      expect(url.toString()).toContain("y=2021");
      return new Response(JSON.stringify({ Response: "True", imdbID: "tt1160419", Ratings: [] }), {
        status: 200,
      });
    }) as unknown as typeof fetch;

    const result = await lookupMovie("test-key", "Dune", "2021");
    expect(result?.imdbId).toBe("tt1160419");
  });

  test("falls back to a plain title search when the year-scoped search finds nothing", async () => {
    let call = 0;
    globalThis.fetch = (async (url: URL) => {
      call++;
      if (call === 1) {
        expect(url.toString()).toContain("y=1999");
        return new Response(JSON.stringify({ Response: "False" }), { status: 200 });
      }
      // Second call: plain title search, no year — a re-watch of an
      // older film logged in a different year than its release.
      expect(url.toString()).not.toContain("&y=");
      return new Response(JSON.stringify({ Response: "True", imdbID: "tt1160419", Ratings: [] }), {
        status: 200,
      });
    }) as unknown as typeof fetch;

    const result = await lookupMovie("test-key", "Dune", "1999");
    expect(call).toBe(2);
    expect(result?.imdbId).toBe("tt1160419");
  });

  test("returns null when both the year-scoped and plain searches find nothing", async () => {
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ Response: "False" }), {
        status: 200,
      })) as unknown as typeof fetch;

    expect(await lookupMovie("test-key", "Not A Real Movie", "2021")).toBeNull();
  });

  test("returns null when OMDb has no match", async () => {
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ Response: "False" }), {
        status: 200,
      })) as unknown as typeof fetch;

    expect(await lookupMovie("test-key", "Not A Real Movie")).toBeNull();
  });

  test("returns null on a non-ok response rather than throwing", async () => {
    globalThis.fetch = (async () => new Response("", { status: 401 })) as unknown as typeof fetch;

    expect(await lookupMovie("bad-key", "Dune")).toBeNull();
  });

  test("omits fields OMDb reports as N/A", async () => {
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          Response: "True",
          Director: "N/A",
          Actors: "N/A",
          Genre: "N/A",
          Year: "N/A",
          Poster: "N/A",
          Ratings: [],
        }),
        { status: 200 },
      )) as unknown as typeof fetch;

    const result = await lookupMovie("test-key", "Obscure Movie");

    expect(result?.director).toBeUndefined();
    expect(result?.actors).toBeUndefined();
    expect(result?.genre).toBeUndefined();
    expect(result?.year).toBeUndefined();
    expect(result?.posterUrl).toBeUndefined();
  });
});

describe("searchMovies", () => {
  test("returns candidates from OMDb's search endpoint", async () => {
    globalThis.fetch = (async (url: URL) => {
      expect(url.toString()).toContain("s=Dune");
      expect(url.toString()).not.toContain("t=Dune");
      return new Response(
        JSON.stringify({
          Response: "True",
          Search: [
            {
              Title: "Dune",
              Year: "2021",
              imdbID: "tt1160419",
              Poster: "https://example.com/dune-2021.jpg",
            },
            {
              Title: "Dune",
              Year: "1984",
              imdbID: "tt0087182",
              Poster: "https://example.com/dune-1984.jpg",
            },
          ],
        }),
        { status: 200 },
      );
    }) as unknown as typeof fetch;

    const result = await searchMovies("test-key", "Dune");

    expect(result).toEqual([
      {
        title: "Dune",
        year: "2021",
        imdbId: "tt1160419",
        posterUrl: "https://example.com/dune-2021.jpg",
      },
      {
        title: "Dune",
        year: "1984",
        imdbId: "tt0087182",
        posterUrl: "https://example.com/dune-1984.jpg",
      },
    ]);
  });

  test("returns an empty array when OMDb's search has no results", async () => {
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ Response: "False", Error: "Movie not found!" }), {
        status: 200,
      })) as unknown as typeof fetch;

    expect(await searchMovies("test-key", "Not A Real Movie")).toEqual([]);
  });

  test("returns an empty array on a non-ok response rather than throwing", async () => {
    globalThis.fetch = (async () => new Response("", { status: 401 })) as unknown as typeof fetch;

    expect(await searchMovies("bad-key", "Dune")).toEqual([]);
  });

  test("drops a candidate with no imdbID rather than an unselectable entry", async () => {
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          Response: "True",
          Search: [{ Title: "Dune", Year: "2021", Poster: "https://example.com/dune.jpg" }],
        }),
        { status: 200 },
      )) as unknown as typeof fetch;

    expect(await searchMovies("test-key", "Dune")).toEqual([]);
  });
});

describe("lookupByImdbId", () => {
  test("returns full metadata for a chosen imdbID", async () => {
    globalThis.fetch = (async (url: URL) => {
      expect(url.toString()).toContain("i=tt1160419");
      return new Response(
        JSON.stringify({
          Response: "True",
          Director: "Denis Villeneuve",
          Year: "2021",
          imdbID: "tt1160419",
          Ratings: [{ Source: "Internet Movie Database", Value: "8.5/10" }],
        }),
        { status: 200 },
      );
    }) as unknown as typeof fetch;

    const result = await lookupByImdbId("test-key", "tt1160419");

    expect(result?.director).toBe("Denis Villeneuve");
    expect(result?.year).toBe("2021");
    expect(result?.imdbId).toBe("tt1160419");
    expect(result?.ratingImdb).toBe("8.5/10");
  });

  test("returns null when OMDb has nothing for that imdbID", async () => {
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ Response: "False" }), {
        status: 200,
      })) as unknown as typeof fetch;

    expect(await lookupByImdbId("test-key", "tt0000000")).toBeNull();
  });
});
