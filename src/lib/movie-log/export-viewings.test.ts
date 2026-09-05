import { describe, expect, test } from "bun:test";
import { exportFilename, exportViewingsToJson } from "./export-viewings";
import { parseJsonImport } from "./import-rows";

const VIEWING = {
  uid: "dune-uid",
  title: "Dune",
  start: "2026-01-01T19:00:00.000Z",
  end: "2026-01-01T21:30:00.000Z",
  medium: "cinema",
  venue: "Grand Vista Cinema",
  director: "Denis Villeneuve",
  actors: "Timothée Chalamet, Zendaya",
  ratingImdb: "8.0",
  ratingRottenTomatoes: "83%",
  ratingMetacritic: "74",
  genre: "Action, Adventure, Drama",
  year: "2021",
  posterUrl: "https://example.com/dune-poster.jpg",
  imdbId: "tt1160419",
  letterboxdUrl: "https://letterboxd.com/film/dune-part-two/",
  letterboxdRating: "4.2",
  notes: "Watched with Sam",
};

describe("exportViewingsToJson", () => {
  test("uses the CLI's own canonical snake_case field names for OMDb-derived fields", () => {
    const [row] = JSON.parse(exportViewingsToJson([VIEWING]));
    expect(row.director).toBe("Denis Villeneuve");
    expect(row.actors).toBe("Timothée Chalamet, Zendaya");
    expect(row.genre).toBe("Action, Adventure, Drama");
    expect(row.release_year).toBe("2021");
    expect(row.poster_url).toBe("https://example.com/dune-poster.jpg");
    expect(row.imdb_rating).toBe("8.0");
    expect(row.rotten_tomatoes_rating).toBe("83%");
    expect(row.metacritic_rating).toBe("74");
    expect(row.booking_ref).toBeUndefined();
    expect(row.letterboxd_url).toBe("https://letterboxd.com/film/dune-part-two/");
    expect(row.letterboxd_rating).toBe("4.2");
    expect(row.notes).toBe("Watched with Sam");
  });

  test("derives imdb_url from the bare imdbId — the CLI has no separate ID field", () => {
    const [row] = JSON.parse(exportViewingsToJson([VIEWING]));
    expect(row.imdb_url).toBe("https://www.imdb.com/title/tt1160419/");
  });

  test("carries uid, title, medium, venue, and both a date/time split and the full ISO instants", () => {
    const [row] = JSON.parse(exportViewingsToJson([VIEWING]));
    expect(row.uid).toBe("dune-uid");
    expect(row.title).toBe("Dune");
    expect(row.medium).toBe("cinema");
    expect(row.venue).toBe("Grand Vista Cinema");
    expect(row.start).toBe(VIEWING.start);
    expect(row.end).toBe(VIEWING.end);
    expect(row.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(row.start_time).toMatch(/^\d{2}:\d{2}$/);
    expect(row.end_time).toMatch(/^\d{2}:\d{2}$/);
  });

  test("round-trips through this app's own JSON importer with every OMDb field intact", () => {
    const json = exportViewingsToJson([VIEWING]);
    const rows = parseJsonImport(json);

    expect(rows).toHaveLength(1);
    expect(rows[0]?.error).toBeUndefined();
    expect(rows[0]?.row?.uid).toBe("dune-uid");
    expect(rows[0]?.row?.director).toBe("Denis Villeneuve");
    expect(rows[0]?.row?.posterUrl).toBe("https://example.com/dune-poster.jpg");
    expect(rows[0]?.row?.imdbId).toBe("tt1160419");
    expect(rows[0]?.row?.notes).toBe("Watched with Sam");
    expect(rows[0]?.row?.start).toBe(VIEWING.start);
    expect(rows[0]?.row?.end).toBe(VIEWING.end);
  });

  test("an empty list serializes to an empty array, still valid to re-import", () => {
    expect(exportViewingsToJson([])).toBe("[]");
    expect(parseJsonImport(exportViewingsToJson([]))).toEqual([]);
  });
});

describe("exportFilename", () => {
  test("uses the given date's own local year-month-day, zero-padded", () => {
    expect(exportFilename(new Date(2026, 0, 5))).toBe("movie-planner-export-2026-01-05.json");
  });

  test("double-digit month and day pass through unpadded-looking but correct", () => {
    expect(exportFilename(new Date(2026, 10, 23))).toBe("movie-planner-export-2026-11-23.json");
  });
});
