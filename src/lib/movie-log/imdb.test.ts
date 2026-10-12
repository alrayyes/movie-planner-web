import { describe, expect, test } from "bun:test";
import { detectCsvFormat, parseCsvImport } from "./import-rows";

// #844: IMDb's ratings.csv ("Your Ratings" export). It has no medium and no
// watched date, only the day each title was rated, so that day is used.
const RATINGS = `Const,Your Rating,Date Rated,Title,Original Title,URL,Title Type,IMDb Rating,Runtime (mins),Year,Genres,Num Votes,Release Date,Directors
tt15239678,9,2026-03-01,Dune: Part Two,Dune: Part Two,https://www.imdb.com/title/tt15239678/,movie,8.5,166,2024,"Action, Adventure, Drama",600000,2024-02-27,Denis Villeneuve
tt28607951,7,2026-03-04,Anora,Anora,https://www.imdb.com/title/tt28607951/,movie,7.6,139,2024,"Comedy, Drama",150000,2024-05-21,Sean Baker
`;

describe("detectCsvFormat on an IMDb ratings export", () => {
  test("recognises it by its headers", () => {
    expect(detectCsvFormat(RATINGS)).toBe("imdb-ratings");
  });
  test("needs the rating date, so a list export without it stays native", () => {
    expect(detectCsvFormat("Const,Title,URL,Year\n")).toBe("native");
  });
  test("a Letterboxd diary is still a diary", () => {
    expect(detectCsvFormat("Name,Letterboxd URI,Watched Date\n")).toBe("letterboxd-diary");
  });
});

describe("parseCsvImport on an IMDb ratings export", () => {
  test("maps each rating to a viewing on the day it was rated", () => {
    const [first, second] = parseCsvImport(RATINGS, { medium: "cinema" });
    expect(first?.row).toMatchObject({
      title: "Dune: Part Two",
      date: "2026-03-01",
      medium: "cinema",
      year: "2024",
      genre: "Action, Adventure, Drama",
      director: "Denis Villeneuve",
      imdbUrl: "https://www.imdb.com/title/tt15239678/",
      imdbId: "tt15239678",
      ratingImdb: "8.5",
      notes: "Your IMDb rating: 9/10",
    });
    expect(second?.row).toMatchObject({ title: "Anora", date: "2026-03-04" });
  });

  test("leaves out the rating note when the rating is blank", () => {
    for (const blank of ["", " "]) {
      const text = `Const,Your Rating,Date Rated,Title,URL\ntt1,${blank},2026-03-01,Heat,\n`;
      expect(parseCsvImport(text, { medium: "tv" })[0]?.row?.notes).toBeUndefined();
    }
  });

  test("reports a missing medium per row", () => {
    expect(parseCsvImport(RATINGS)[0]?.error).toBe("medium is required");
  });
});
