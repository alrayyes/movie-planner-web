import { describe, expect, test } from "bun:test";
import { imdbUrl, letterboxdHref, letterboxdSearchUrl, rottenTomatoesSearchUrl } from "./links";

describe("links", () => {
  test("imdbUrl points at the title page", () => {
    expect(imdbUrl("tt0133093")).toBe("https://www.imdb.com/title/tt0133093/");
  });

  test("rottenTomatoesSearchUrl encodes the title", () => {
    expect(rottenTomatoesSearchUrl("Se7en & Co")).toBe(
      "https://www.rottentomatoes.com/search?search=Se7en%20%26%20Co",
    );
  });

  test("letterboxdSearchUrl encodes the title", () => {
    expect(letterboxdSearchUrl("Se7en & Co")).toBe(
      "https://letterboxd.com/search/Se7en%20%26%20Co/",
    );
  });

  test("letterboxdHref prefers a real URL, else falls back to the search", () => {
    expect(
      letterboxdHref({ title: "Heat", letterboxdUrl: "https://letterboxd.com/film/heat/" }),
    ).toBe("https://letterboxd.com/film/heat/");
    expect(letterboxdHref({ title: "Heat" })).toBe("https://letterboxd.com/search/Heat/");
  });
});
