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
  test("needs the visitor's own rating, so other IMDb lists aren't read as ratings", () => {
    expect(detectCsvFormat("Const,Title,Date Rated,URL\n")).toBe("native");
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

describe("a CSV that starts with a byte-order mark", () => {
  // Excel and some exporters prefix one; it would otherwise ride on the first
  // column's name and hide the format.
  const BOM = String.fromCharCode(0xfeff);

  test("an IMDb export is still recognised and read", () => {
    expect(detectCsvFormat(BOM + RATINGS)).toBe("imdb-ratings");
    expect(parseCsvImport(BOM + RATINGS, { medium: "tv" })[0]?.row?.title).toBe("Dune: Part Two");
  });

  test("a Letterboxd diary is still recognised", () => {
    const diary = `${BOM}Date,Name,Year,Letterboxd URI,Rating,Rewatch,Tags,Watched Date\n`;
    expect(detectCsvFormat(diary)).toBe("letterboxd-diary");
  });

  test("a native file keeps its title column", () => {
    const text = `${BOM}title,date,medium\nHeat,2026-03-01,tv\n`;
    expect(parseCsvImport(text)[0]?.row?.title).toBe("Heat");
  });

  test("a quoted first header is still read", () => {
    const text = `${BOM}"title",date,medium\nHeat,2026-03-01,tv\n`;
    expect(parseCsvImport(text)[0]?.row?.title).toBe("Heat");
  });
});

describe("parseCsvImport on IMDb rows that aren't movies", () => {
  const HEADER = "Const,Your Rating,Date Rated,Title,URL,Title Type\n";
  const parse = (type: string, title = "Severance") =>
    parseCsvImport(`${HEADER}tt1,8,2026-03-01,${title},,${type}\n`, { medium: "tv" })[0];

  test("refuses a series, miniseries, episode, game or podcast and says what it is", () => {
    expect(parse("tvSeries")?.error).toBe('"Severance" is a TV series on IMDb, not a movie');
    expect(parse("tvMiniSeries")?.error).toBe(
      '"Severance" is a TV miniseries on IMDb, not a movie',
    );
    expect(parse("tvEpisode")?.error).toBe('"Severance" is a TV episode on IMDb, not a movie');
    expect(parse("videoGame")?.error).toBe('"Severance" is a video game on IMDb, not a movie');
    expect(parse("podcastSeries")?.error).toBe('"Severance" is a podcast on IMDb, not a movie');
    expect(parse("podcastEpisode")?.error).toBe(
      '"Severance" is a podcast episode on IMDb, not a movie',
    );
    expect(parse("musicVideo")?.error).toBe('"Severance" is a music video on IMDb, not a movie');
  });

  test("reads the display names IMDb's own site uses just the same", () => {
    expect(parse("TV Series")?.error).toBe('"Severance" is a TV series on IMDb, not a movie');
    expect(parse("TV Mini Series")?.error).toBe(
      '"Severance" is a TV miniseries on IMDb, not a movie',
    );
    expect(parse("Video Game")?.error).toBe('"Severance" is a video game on IMDb, not a movie');
    expect(parse("tv-series")?.error).toBe('"Severance" is a TV series on IMDb, not a movie');
    expect(parse("TV_Episode")?.error).toBe('"Severance" is a TV episode on IMDb, not a movie');
  });

  test("keeps every film, whichever way the type is spelled", () => {
    for (const type of [
      "movie",
      "Movie",
      "tvMovie",
      "TV Movie",
      "short",
      "tvShort",
      "video",
      "tvSpecial",
    ]) {
      expect(parse(type)?.error).toBeUndefined();
      expect(parse(type)?.row?.title).toBe("Severance");
    }
  });

  test("imports a type it doesn't know rather than blocking the file", () => {
    expect(parse("somethingNew")?.row?.title).toBe("Severance");
    expect(parse("constructor")?.row?.title).toBe("Severance");
    expect(parse("toString")?.row?.title).toBe("Severance");
  });

  test("ignores stray spaces round the type and the title", () => {
    expect(parse(" tvSeries ", "  Severance ")?.error).toBe(
      '"Severance" is a TV series on IMDb, not a movie',
    );
    expect(parse("movie ")?.row?.title).toBe("Severance");
  });

  test("reads a row whose Title Type is blank, or whose column is missing", () => {
    expect(parse("")?.row?.title).toBe("Severance");
    const text = "Const,Your Rating,Date Rated,Title,URL\ntt1,8,2026-03-01,Heat,\n";
    expect(parseCsvImport(text, { medium: "tv" })[0]?.row?.title).toBe("Heat");
  });

  test("only an IMDb ratings export is filtered by it", () => {
    const text = "title,date,medium,Title Type\nSeverance,2026-03-01,tv,tvSeries\n";
    expect(parseCsvImport(text)[0]?.row?.title).toBe("Severance");
  });

  test("names the title as empty when a short row never reaches it", () => {
    const text = "Const,Your Rating,Date Rated,Title Type,Title\ntt1,8,2026-03-01,tvSeries\n";
    expect(parseCsvImport(text, { medium: "tv" })[0]?.error).toBe(
      '"" is a TV series on IMDb, not a movie',
    );
  });

  test("a bad row doesn't stop the good ones after it", () => {
    const text = `${HEADER}tt1,8,2026-03-01,Severance,,tvSeries\ntt2,7,2026-03-02,Heat,,movie\n`;
    const [bad, good] = parseCsvImport(text, { medium: "tv" });
    expect(bad?.rowNumber).toBe(2);
    expect(good?.row?.title).toBe("Heat");
  });
});
