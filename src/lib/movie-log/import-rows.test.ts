import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
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

    // toMatchObject, not toEqual — ImportRow always carries every
    // optional field's key now (undefined when a plain minimal-format
    // row doesn't set it), so an exact-equality check would have to
    // spell out every one of those absent OMDb-derived fields too.
    expect(rows[0]?.row).toMatchObject({
      title: "The Clockmaker's Daughter",
      date: "2024-03-15",
      medium: "cinema",
      startTime: "19:00",
      endTime: "21:15",
      venue: "Grand Vista Cinema",
      imdbUrl: "https://www.imdb.com/title/tt0000101/",
    });
    expect(rows[0]?.row?.imdbId).toBe("tt0000101");
    expect(rows[0]?.row?.director).toBeUndefined();
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

describe("parseJsonImport with the exported/round-trip format (the CLI's own snake_case field names)", () => {
  const EXPORTED = JSON.stringify([
    {
      uid: "dune-uid",
      title: "Dune",
      date: "2026-01-01",
      start_time: "19:00",
      end_time: "21:30",
      start: "2026-01-01T19:00:00.000Z",
      end: "2026-01-01T21:30:00.000Z",
      medium: "cinema",
      venue: "Grand Vista Cinema",
      director: "Denis Villeneuve",
      actors: "Timothée Chalamet, Zendaya",
      imdb_rating: "8.0",
      rotten_tomatoes_rating: "83%",
      metacritic_rating: "74",
      genre: "Action, Adventure, Drama",
      release_year: "2021",
      poster_url: "https://example.com/dune-poster.jpg",
      imdb_url: "https://www.imdb.com/title/tt1160419/",
      booking_ref: "ABC123",
      letterboxd_url: "https://letterboxd.com/film/dune-part-two/",
      letterboxd_rating: "4.2",
      notes: "Watched with Sam",
    },
  ]);

  test("carries every field, mapped from the CLI's own snake_case names", () => {
    const rows = parseJsonImport(EXPORTED);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.error).toBeUndefined();
    expect(rows[0]?.row).toEqual({
      title: "Dune",
      date: "2026-01-01",
      medium: "cinema",
      startTime: "19:00",
      endTime: "21:30",
      start: "2026-01-01T19:00:00.000Z",
      end: "2026-01-01T21:30:00.000Z",
      uid: "dune-uid",
      venue: "Grand Vista Cinema",
      director: "Denis Villeneuve",
      actors: "Timothée Chalamet, Zendaya",
      ratingImdb: "8.0",
      ratingRottenTomatoes: "83%",
      ratingMetacritic: "74",
      genre: "Action, Adventure, Drama",
      year: "2021",
      posterUrl: "https://example.com/dune-poster.jpg",
      imdbUrl: "https://www.imdb.com/title/tt1160419/",
      imdbId: "tt1160419",
      bookingRef: "ABC123",
      letterboxdUrl: "https://letterboxd.com/film/dune-part-two/",
      letterboxdRating: "4.2",
      notes: "Watched with Sam",
    });
  });

  test("a missing title still fails that row", () => {
    const rows = parseJsonImport(
      JSON.stringify([
        { start: "2026-01-01T19:00:00.000Z", end: "2026-01-01T21:30:00.000Z", medium: "cinema" },
      ]),
    );
    expect(rows[0]?.error).toContain("title");
  });

  test("an unparsable start fails that row", () => {
    const rows = parseJsonImport(
      JSON.stringify([
        { title: "Dune", start: "not-a-date", end: "2026-01-01T21:30:00.000Z", medium: "cinema" },
      ]),
    );
    expect(rows[0]?.error).toContain("start");
  });

  test("no uid at all (a hand-written exported-shape file) parses fine, just with no uid", () => {
    const rows = parseJsonImport(
      JSON.stringify([
        {
          title: "Dune",
          start: "2026-01-01T19:00:00.000Z",
          end: "2026-01-01T21:30:00.000Z",
          medium: "cinema",
        },
      ]),
    );
    expect(rows[0]?.error).toBeUndefined();
    expect(rows[0]?.row?.uid).toBeUndefined();
  });

  test("date is derived from `start` when the minimal format's own `date` field is absent", () => {
    const rows = parseJsonImport(
      JSON.stringify([
        {
          title: "Dune",
          start: "2026-01-01T19:00:00.000Z",
          end: "2026-01-01T21:30:00.000Z",
          medium: "cinema",
        },
      ]),
    );
    expect(rows[0]?.row?.date).toBe("2026-01-01");
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

// #753: what a row has to look like to import is one rule, kept in the
// movie-planner CLI (`importers.py`: date.fromisoformat, time.fromisoformat, an
// int release year) and in the published schema. This app's check had drifted:
// it refused 19:00:30, which the CLI and both schemas accept, and passed
// 2024-02-30 and "N/A", which the CLI refuses.
describe("row validation agrees with the CLI and the published schema", () => {
  const one = (fields: Record<string, unknown>) =>
    parseJsonImport(
      JSON.stringify([{ title: "Dune", medium: "cinema", date: "2024-03-15", ...fields }]),
    )[0];

  test("a time may carry seconds", () => {
    const parsed = one({ start_time: "19:00:30", end_time: "21:30:15" });
    expect(parsed?.error).toBeUndefined();
    expect(parsed?.row?.startTime).toBe("19:00:30");
    expect(parsed?.row?.endTime).toBe("21:30:15");
  });

  test("a time outside the clock is refused", () => {
    for (const value of ["25:00", "19:60", "19:00:61", "24:00"]) {
      expect(one({ start_time: value })?.error).toBe(`start_time is not a valid time: "${value}"`);
    }
    expect(one({ end_time: "99:99" })?.error).toBe('end_time is not a valid time: "99:99"');
  });

  test("a time with the wrong shape is refused", () => {
    for (const value of ["7:00", "19:0", "19:00:3", "1900", "19.00"]) {
      expect(one({ start_time: value })?.error).toBe(`start_time is not a valid time: "${value}"`);
    }
  });

  test("a date that isn't on the calendar is refused", () => {
    for (const date of ["2024-02-30", "2024-13-01", "2024-04-31", "2023-02-29", "2024-00-10"]) {
      expect(one({ date })?.error).toBe(`not a valid date: "${date}"`);
    }
  });

  test("a real date is accepted, including a leap day", () => {
    expect(one({ date: "2024-02-29" })?.error).toBeUndefined();
    expect(one({ date: "2024-12-31" })?.error).toBeUndefined();
  });

  test("a release year is digits, as the CLI's int() requires", () => {
    expect(one({ release_year: "N/A" })?.error).toBe('release_year is not a valid year: "N/A"');
    expect(one({ release_year: "20x1" })?.error).toBe('release_year is not a valid year: "20x1"');
    expect(one({ release_year: "2021" })?.row?.year).toBe("2021");
  });

  test("a release year may be a JSON number, as the CLI allows", () => {
    const parsed = one({ release_year: 2021 });
    expect(parsed?.error).toBeUndefined();
    expect(parsed?.row?.year).toBe("2021");
  });

  test("a blank release year means none", () => {
    expect(one({ release_year: "" })?.row?.year).toBeUndefined();
  });
});

describe("the published schema and the parser agree", () => {
  const schema = JSON.parse(
    readFileSync(
      join(import.meta.dir, "../../../public/schemas/movie-viewings.schema.json"),
      "utf8",
    ),
  ) as {
    $defs: {
      row: { properties: Record<string, { pattern?: string; oneOf?: { pattern?: string }[] }> };
    };
  };
  const properties = schema.$defs.row.properties;
  const one = (fields: Record<string, unknown>) =>
    parseJsonImport(
      JSON.stringify([{ title: "Dune", medium: "cinema", date: "2024-03-15", ...fields }]),
    )[0];

  test("start_time and end_time take the same shapes", () => {
    for (const field of ["start_time", "end_time"]) {
      const pattern = new RegExp(properties[field]?.pattern ?? "$^");
      for (const value of ["19:00", "19:00:30", "7:00", "19:00:3", "1900"]) {
        const parserShape = one({ [field]: value })?.error?.includes("not a valid time") !== true;
        // The parser also checks the clock, so only shape mismatches must agree.
        if (!pattern.test(value)) expect(parserShape).toBe(false);
        if (pattern.test(value) && !["25:00"].includes(value)) expect(parserShape).toBe(true);
      }
    }
  });

  test("date takes the same shape", () => {
    const pattern = new RegExp(properties.date?.pattern ?? "$^");
    expect(pattern.test("2024-03-15")).toBe(true);
    expect(pattern.test("2024-3-15")).toBe(false);
    expect(one({ date: "2024-3-15" })?.error).toContain("not a valid date");
  });

  test("release_year allows an integer or a string of digits, as the CLI's schema does", () => {
    const year = properties.release_year as { oneOf?: { type?: string; pattern?: string }[] };
    const types = (year.oneOf ?? []).map((alternative) => alternative.type).sort();
    expect(types).toEqual(["integer", "string"]);
    const digits = (year.oneOf ?? []).find((alternative) => alternative.type === "string");
    expect(digits?.pattern).toBe("^\\d+$");
  });
});

// A CSV cell often arrives with stray spaces around it, and the date is trimmed
// before it's checked (the mutation gate found no test saying so, #751).
describe("a row's date with surrounding spaces", () => {
  test("is trimmed, and still has to be a real date", () => {
    const [padded] = parseJsonImport(
      JSON.stringify([{ title: "Dune", medium: "cinema", date: "  2024-03-15 " }]),
    );
    expect(padded?.error).toBeUndefined();
    expect(padded?.row?.date).toBe("2024-03-15");
    const [bad] = parseJsonImport(
      JSON.stringify([{ title: "Dune", medium: "cinema", date: " 2024-02-30 " }]),
    );
    expect(bad?.error).toBe('not a valid date: " 2024-02-30 "');
  });
});

// #751: a row that carries only a `start` instant gets its date from it, and the
// date is the viewer's own calendar date. 00:30 on the 15th in Amsterdam is
// 23:30Z on the 14th, and the UTC date would put the viewing a day early.
describe("a row's date from its start instant", () => {
  test("is the viewer's local date, not the UTC date", () => {
    const before = process.env.TZ;
    process.env.TZ = "Europe/Amsterdam";
    try {
      const start = new Date(2024, 2, 15, 0, 30).toISOString();
      expect(start.slice(0, 10)).toBe("2024-03-14");
      const [parsed] = parseJsonImport(
        JSON.stringify([{ title: "Late Show", medium: "cinema", start }]),
      );
      expect(parsed?.error).toBeUndefined();
      expect(parsed?.row?.date).toBe("2024-03-15");
    } finally {
      if (before === undefined) delete process.env.TZ;
      else process.env.TZ = before;
    }
  });
});
