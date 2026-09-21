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

  test("returns a synopsis from OMDb's own full plot, requested via plot=full", async () => {
    globalThis.fetch = (async (url: URL) => {
      expect(url.toString()).toContain("plot=full");
      return new Response(
        JSON.stringify({
          Response: "True",
          imdbID: "tt1160419",
          Plot: "A noble family becomes embroiled in a war for control over the galaxy's most valuable asset.",
          Ratings: [],
        }),
        { status: 200 },
      );
    }) as unknown as typeof fetch;

    const result = await lookupMovie("test-key", "Dune");

    expect(result?.synopsis).toBe(
      "A noble family becomes embroiled in a war for control over the galaxy's most valuable asset.",
    );
  });

  test('omits synopsis when OMDb has none ("N/A")', async () => {
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({ Response: "True", imdbID: "tt1160419", Plot: "N/A", Ratings: [] }),
        { status: 200 },
      )) as unknown as typeof fetch;

    const result = await lookupMovie("test-key", "Dune");

    expect(result?.synopsis).toBeUndefined();
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

  // #336: these fields already round-trip through this app's own
  // X-* properties (ical.ts) and already show on the details page
  // (MovieDetails.svelte) for a CLI-refreshed entry — this app's own
  // refresh just never fetched them from OMDb in the first place.
  test("returns the rest of OMDb's own response fields movie-planner tracks", async () => {
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          Response: "True",
          imdbID: "tt1160419",
          Ratings: [],
          Rated: "PG-13",
          Released: "22 Oct 2021",
          Runtime: "155 min",
          Language: "English",
          Country: "United States, Canada",
          Awards: "Won 6 Oscars",
          Metascore: "74",
          imdbVotes: "757,432",
          DVD: "N/A",
          BoxOffice: "$108,327,830",
          Production: "N/A",
          Website: "N/A",
        }),
        { status: 200 },
      )) as unknown as typeof fetch;

    const result = await lookupMovie("test-key", "Dune");

    expect(result).toMatchObject({
      rated: "PG-13",
      released: "22 Oct 2021",
      runtime: "155 min",
      movieLanguage: "English",
      movieCountry: "United States, Canada",
      awards: "Won 6 Oscars",
      metascore: "74",
      imdbVotes: "757,432",
      boxOffice: "$108,327,830",
    });
    // OMDb's literal "N/A" for a field it has nothing for — left unset,
    // not written through as the string "N/A" or an empty string.
    expect(result?.dvd).toBeUndefined();
    expect(result?.production).toBeUndefined();
    expect(result?.website).toBeUndefined();
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

  // #622: OMDb's s= endpoint paginates at 10 results per page. A query
  // for a title outside the first page (a large franchise crowding out a
  // new/obscure entry) used to never reach the disambiguation picker.
  function candidate(imdbID: string) {
    return { Title: "Resident Evil", Year: "2026", imdbID, Poster: "N/A" };
  }

  test("makes exactly one request when totalResults fits on a single page", async () => {
    let calls = 0;
    globalThis.fetch = (async () => {
      calls++;
      return new Response(
        JSON.stringify({
          Response: "True",
          Search: [candidate("tt0000001")],
          totalResults: "1",
        }),
        { status: 200 },
      );
    }) as unknown as typeof fetch;

    const result = await searchMovies("test-key", "Resident Evil");

    expect(calls).toBe(1);
    expect(result).toHaveLength(1);
  });

  test("follows totalResults to fetch additional pages beyond the first", async () => {
    const pages: string[] = [];
    globalThis.fetch = (async (url: URL) => {
      pages.push(url.searchParams.get("page") ?? "1");
      const page = Number(url.searchParams.get("page") ?? "1");
      const id = `tt${String(page).padStart(7, "0")}`;
      return new Response(
        JSON.stringify({
          Response: "True",
          Search: [candidate(id)],
          totalResults: "12",
        }),
        { status: 200 },
      );
    }) as unknown as typeof fetch;

    const result = await searchMovies("test-key", "Resident Evil");

    expect(pages).toEqual(["1", "2"]);
    expect(result.map((c) => c.imdbId)).toEqual(["tt0000001", "tt0000002"]);
  });

  test("caps additional fetching at 5 pages (50 results) even when totalResults is larger", async () => {
    const pages: string[] = [];
    globalThis.fetch = (async (url: URL) => {
      const page = Number(url.searchParams.get("page") ?? "1");
      pages.push(String(page));
      return new Response(
        JSON.stringify({
          Response: "True",
          Search: [candidate(`tt${String(page).padStart(7, "0")}`)],
          totalResults: "500",
        }),
        { status: 200 },
      );
    }) as unknown as typeof fetch;

    const result = await searchMovies("test-key", "Resident Evil");

    expect(pages).toEqual(["1", "2", "3", "4", "5"]);
    expect(result).toHaveLength(5);
  });

  test("stops paginating and keeps candidates gathered so far when a later page comes back Response: False", async () => {
    let calls = 0;
    globalThis.fetch = (async (url: URL) => {
      calls++;
      const page = Number(url.searchParams.get("page") ?? "1");
      if (page === 1) {
        return new Response(
          JSON.stringify({
            Response: "True",
            Search: [candidate("tt0000001")],
            totalResults: "20",
          }),
          { status: 200 },
        );
      }
      return new Response(JSON.stringify({ Response: "False", Error: "Too many results." }), {
        status: 200,
      });
    }) as unknown as typeof fetch;

    const result = await searchMovies("test-key", "Resident Evil");

    expect(calls).toBe(2);
    expect(result.map((c) => c.imdbId)).toEqual(["tt0000001"]);
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
