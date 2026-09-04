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
  test("returns ratings, director and actors on a match", async () => {
    globalThis.fetch = (async (url: URL) => {
      expect(url.toString()).toContain("t=Dune");
      expect(url.toString()).toContain("apikey=test-key");
      return new Response(
        JSON.stringify({
          Response: "True",
          Director: "Denis Villeneuve",
          Actors: "Timothée Chalamet, Rebecca Ferguson",
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
        JSON.stringify({ Response: "True", Director: "N/A", Actors: "N/A", Ratings: [] }),
        { status: 200 },
      )) as unknown as typeof fetch;

    const result = await lookupMovie("test-key", "Obscure Movie");

    expect(result?.director).toBeUndefined();
    expect(result?.actors).toBeUndefined();
  });
});
