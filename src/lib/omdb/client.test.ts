import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { lookupMovie } from "./client";

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
