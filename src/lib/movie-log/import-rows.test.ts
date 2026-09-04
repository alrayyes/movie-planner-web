import { describe, expect, test } from "bun:test";
import { parseCsvImport, parseJsonImport } from "./import-rows";

// Mirrors movie-planner's own examples/movies.csv and movies.json — the
// three time-completeness cases: full range, start with no end, and no
// time at all.
const CSV = `title,date,start_time,end_time,medium,venue,imdb_url
The Clockmaker's Daughter,2024-03-15,19:00,21:15,cinema,Grand Vista Cinema,https://www.imdb.com/title/tt0000101/
Solstice Run,2024-06-02,20:30,,cinema,Riverside Multiplex,https://www.imdb.com/title/tt0000102/
Paper Constellations,2024-01-20,,,netflix,,https://www.imdb.com/title/tt0000103/
`;

const JSON_TEXT = JSON.stringify([
  {
    title: "The Clockmaker's Daughter",
    date: "2024-03-15",
    start_time: "19:00",
    end_time: "21:15",
    medium: "cinema",
    venue: "Grand Vista Cinema",
    imdb_url: "https://www.imdb.com/title/tt0000101/",
  },
  {
    title: "Solstice Run",
    date: "2024-06-02",
    start_time: "20:30",
    medium: "cinema",
    venue: "Riverside Multiplex",
    imdb_url: "https://www.imdb.com/title/tt0000102/",
  },
  {
    title: "Paper Constellations",
    date: "2024-01-20",
    medium: "netflix",
    imdb_url: "https://www.imdb.com/title/tt0000103/",
  },
]);

describe("parseCsvImport", () => {
  test("parses all three time-completeness cases", () => {
    const rows = parseCsvImport(CSV);

    expect(rows).toHaveLength(3);
    expect(rows.every((r) => !r.error)).toBe(true);

    expect(rows[0]?.row).toEqual({
      title: "The Clockmaker's Daughter",
      date: "2024-03-15",
      medium: "cinema",
      startTime: "19:00",
      endTime: "21:15",
      venue: "Grand Vista Cinema",
      imdbUrl: "https://www.imdb.com/title/tt0000101/",
    });
    expect(rows[1]?.row?.startTime).toBe("20:30");
    expect(rows[1]?.row?.endTime).toBeUndefined();
    expect(rows[2]?.row?.startTime).toBeUndefined();
    expect(rows[2]?.row?.endTime).toBeUndefined();
  });

  test("handles a quoted field containing a comma", () => {
    const csv = 'title,date,medium\n"Comedy, Actually",2024-01-01,cinema\n';
    const rows = parseCsvImport(csv);
    expect(rows[0]?.row?.title).toBe("Comedy, Actually");
  });

  test("row numbers account for the header row", () => {
    const csv = "title,date,medium\n,2024-01-01,cinema\n";
    const rows = parseCsvImport(csv);
    expect(rows[0]?.rowNumber).toBe(2);
    expect(rows[0]?.error).toContain("title");
  });
});

describe("parseJsonImport", () => {
  test("parses all three time-completeness cases", () => {
    const rows = parseJsonImport(JSON_TEXT);

    expect(rows).toHaveLength(3);
    expect(rows.every((r) => !r.error)).toBe(true);
    expect(rows[0]?.row?.startTime).toBe("19:00");
    expect(rows[2]?.row?.startTime).toBeUndefined();
  });

  test("reports invalid JSON as a row-1 error rather than throwing", () => {
    const rows = parseJsonImport("not json");
    expect(rows[0]?.error).toBeTruthy();
  });
});

describe("required field validation", () => {
  test("missing title fails that row without failing the whole import", () => {
    const rows = parseJsonImport(JSON.stringify([{ date: "2024-01-01", medium: "cinema" }]));
    expect(rows[0]?.error).toContain("title");
  });

  test("missing medium fails that row", () => {
    const rows = parseJsonImport(JSON.stringify([{ title: "X", date: "2024-01-01" }]));
    expect(rows[0]?.error).toContain("medium");
  });

  test("an invalid date fails that row", () => {
    const rows = parseJsonImport(
      JSON.stringify([{ title: "X", date: "not-a-date", medium: "cinema" }]),
    );
    expect(rows[0]?.error).toContain("date");
  });
});
