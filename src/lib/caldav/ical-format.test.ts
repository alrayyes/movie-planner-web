import { afterEach, describe, expect, setSystemTime, test } from "bun:test";
import { extractUnknownProperties, parseVEventToViewing, serializeViewingToVEvent } from "./ical";
import type { NewViewing } from "./types";

// #749: the wire format itself, one rule per test, so a mutated literal in
// ical.ts changes a line a test reads. The other file round-trips whole viewings.
const BASE: NewViewing = {
  title: "Dune",
  start: new Date(2026, 0, 2, 3, 4, 5).toISOString(),
  end: new Date(2026, 0, 2, 6, 7, 8).toISOString(),
  medium: "cinema",
};

const lines = (ics: string) => ics.split("\r\n");
const vevent = (viewing: Partial<NewViewing> = {}, extra?: string[]) =>
  serializeViewingToVEvent("uid-1", { ...BASE, ...viewing }, extra);

afterEach(() => setSystemTime());

describe("the VEVENT envelope", () => {
  test("has the fixed header, the identifying properties and the footer in order", () => {
    setSystemTime(new Date("2026-03-04T05:06:07.890Z"));
    expect(lines(vevent())).toEqual([
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//movie-planner-web//EN",
      "BEGIN:VEVENT",
      "UID:uid-1",
      "DTSTAMP:20260304T050607Z",
      "DTSTART:20260102T030405",
      "DTEND:20260102T060708",
      "SUMMARY:Dune",
      "X-MEDIUM:cinema",
      "END:VEVENT",
      "END:VCALENDAR",
    ]);
  });

  test("a single-digit month, day, hour, minute and second are zero padded", () => {
    const body = vevent({ start: new Date(2027, 8, 9, 1, 2, 3).toISOString() });
    expect(body).toContain("DTSTART:20270909T010203");
  });

  test("a double-digit date and time are written as they are", () => {
    const body = vevent({ start: new Date(2027, 10, 12, 13, 14, 15).toISOString() });
    expect(body).toContain("DTSTART:20271112T131415");
  });

  test("LOCATION appears only for a venue", () => {
    expect(vevent()).not.toContain("LOCATION");
    expect(lines(vevent({ venue: "Odeon" }))).toContain("LOCATION:Odeon");
  });

  test("an empty field is left out, not written blank", () => {
    expect(vevent({ director: "", venue: "" })).not.toMatch(/X-DIRECTOR|LOCATION/);
  });

  test("extra lines come last, folded, in the order given", () => {
    const long = `X-FUTURE:${"y".repeat(100)}`;
    const body = lines(vevent({}, ["X-A:1", long]));
    expect(body.slice(-5)).toEqual([
      "X-A:1",
      long.slice(0, 75),
      ` ${long.slice(75)}`,
      "END:VEVENT",
      "END:VCALENDAR",
    ]);
  });
});

describe("every property name maps to its field", () => {
  const fields: [string, keyof NewViewing][] = [
    ["X-MEDIUM", "medium"],
    ["X-DIRECTOR", "director"],
    ["X-ACTORS", "actors"],
    ["X-RATING-IMDB", "ratingImdb"],
    ["X-RATING-ROTTEN-TOMATOES", "ratingRottenTomatoes"],
    ["X-RATING-METACRITIC", "ratingMetacritic"],
    ["X-GENRE", "genre"],
    ["X-YEAR", "year"],
    ["X-POSTER-URL", "posterUrl"],
    ["X-IMDB-ID", "imdbId"],
    ["X-SYNOPSIS", "synopsis"],
    ["X-BOOKING-REF", "bookingRef"],
    ["X-ROW", "row"],
    ["X-SEAT", "seat"],
    ["X-LETTERBOXD-URL", "letterboxdUrl"],
    ["X-LETTERBOXD-RATING", "letterboxdRating"],
    ["X-NOTES", "notes"],
    ["X-CITY", "city"],
    ["X-COUNTRY", "country"],
    ["X-STREET-ADDRESS", "streetAddress"],
    ["X-POSTAL-CODE", "postalCode"],
    ["X-RATED", "rated"],
    ["X-RUNTIME", "runtime"],
    ["X-MOVIE-LANGUAGE", "movieLanguage"],
    ["X-MOVIE-COUNTRY", "movieCountry"],
    ["X-METASCORE", "metascore"],
    ["X-IMDB-VOTES", "imdbVotes"],
    ["X-DVD", "dvd"],
    ["X-BOX-OFFICE", "boxOffice"],
    ["X-PRODUCTION", "production"],
    ["X-WEBSITE", "website"],
    ["X-RELEASED", "released"],
    ["X-AWARDS", "awards"],
    ["X-TRAILER-URL", "trailerUrl"],
    ["X-LAST-MODIFIED-BY", "lastModifiedBy"],
    ["X-COLLECTION", "collection"],
    ["X-CERTIFICATION", "certification"],
    ["X-KEYWORDS", "keywords"],
    ["X-BUDGET", "budget"],
    ["X-POPULARITY", "popularity"],
  ];

  for (const [property, field] of fields) {
    test(`${property} carries ${field}, both ways`, () => {
      const body = vevent({ [field]: `value-of-${field}` });
      expect(lines(body)).toContain(`${property}:value-of-${field}`);
      expect(parseVEventToViewing(body)[field as keyof NewViewing]).toBe(`value-of-${field}`);
    });
  }

  test("a property this app doesn't know is not one of its own", () => {
    const body = vevent({}, ["X-FUTURE:1"]);
    expect(extractUnknownProperties(body)).toEqual(["X-FUTURE:1"]);
  });
});

describe("TEXT escaping", () => {
  const title = String.raw`a\b;c,d` + "\ne";
  test("escapes backslash, semicolon, comma and newline", () => {
    expect(lines(vevent({ title }))).toContain(String.raw`SUMMARY:a\\b\;c\,d\ne`);
  });

  test("reads them back as the original", () => {
    expect(parseVEventToViewing(vevent({ title })).title).toBe(title);
  });

  test("every occurrence is escaped, not just the first", () => {
    const many = String.raw`a;b;c,d,e\f\g` + "\nh\ni";
    expect(lines(vevent({ title: many }))).toContain(String.raw`SUMMARY:a\;b\;c\,d\,e\\f\\g\nh\ni`);
    expect(parseVEventToViewing(vevent({ title: many })).title).toBe(many);
  });
});

describe("line folding", () => {
  const fold = (length: number) => {
    const title = "t".repeat(length - "SUMMARY:".length);
    const out = lines(vevent({ title }));
    const at = out.indexOf(out.find((l) => l.startsWith("SUMMARY:")) as string);
    return { title, out, at };
  };

  test("a line of exactly 75 characters stays whole", () => {
    const { out, at } = fold(75);
    expect(out[at]).toHaveLength(75);
    expect(out[at + 1]).toStartWith("X-MEDIUM");
  });

  test("a line of 76 characters folds after the 75th", () => {
    const { out, at } = fold(76);
    expect(out[at]).toHaveLength(75);
    expect(out[at + 1]).toBe(" t");
  });

  test("a long line folds into as many continuation lines as it needs", () => {
    const { out, at, title } = fold(75 + 75 + 10);
    expect(out[at]).toHaveLength(75);
    expect(out[at + 1]).toHaveLength(76);
    expect(out[at + 2]).toBe(` ${"t".repeat(10)}`);
    expect(parseVEventToViewing(out.join("\r\n")).title).toBe(title);
  });

  test("a line of exactly twice 75 ends on a full continuation, with no empty one", () => {
    const { out, at } = fold(150);
    expect(out[at + 1]).toHaveLength(76);
    expect(out[at + 2]).toStartWith("X-MEDIUM");
  });

  test("a folded line is joined back with the single leading space dropped", () => {
    const title = "x".repeat(200);
    expect(parseVEventToViewing(vevent({ title })).title).toBe(title);
  });
});

describe("unfolding and line endings", () => {
  const unknown = (raw: string) => extractUnknownProperties(raw);
  const wrap = (...body: string[]) => ["BEGIN:VEVENT", ...body, "END:VEVENT"];

  test("a tab continues the previous line like a space", () => {
    expect(unknown(wrap("X-A:one", "\ttwo").join("\r\n"))).toEqual(["X-A:onetwo"]);
  });

  test("a space continues the previous line", () => {
    expect(unknown(wrap("X-A:one", " two").join("\r\n"))).toEqual(["X-A:onetwo"]);
  });

  test("bare newlines separate lines as well as CRLF", () => {
    expect(unknown(wrap("X-A:1", "X-B:2").join("\n"))).toEqual(["X-A:1", "X-B:2"]);
  });

  test("blank lines are dropped", () => {
    expect(unknown(wrap("X-A:1", "", "X-B:2").join("\r\n"))).toEqual(["X-A:1", "X-B:2"]);
  });

  test("a blank line doesn't stop the line before it being continued", () => {
    expect(unknown(wrap("X-A:one", "", " two").join("\r\n"))).toEqual(["X-A:onetwo"]);
  });

  test("an indented line with nothing before it stands as a line of its own", () => {
    const raw = [" X-A:1", "BEGIN:VEVENT", "X-B:2", "END:VEVENT"].join("\r\n");
    expect(unknown(raw)).toEqual(["X-B:2"]);
  });
});

describe("extractUnknownProperties", () => {
  const wrap = (...body: string[]) => ["BEGIN:VEVENT", ...body, "END:VEVENT"].join("\r\n");

  test("keeps unknown lines verbatim, parameters and all", () => {
    expect(extractUnknownProperties(wrap("X-FUTURE;VALUE=TEXT:abc", "X-OTHER:d\\,e"))).toEqual([
      "X-FUTURE;VALUE=TEXT:abc",
      "X-OTHER:d\\,e",
    ]);
  });

  test("drops every property this app reads or writes, whatever its case", () => {
    const known = ["UID:1", "DTSTAMP:x", "DTSTART:x", "DTEND:x", "SUMMARY:x", "LOCATION:x"];
    const more = ["GEO:1;2", "DESCRIPTION:x", "X-MEDIUM:cinema", "summary:lower", "x-year:2020"];
    expect(extractUnknownProperties(wrap(...known, ...more, "X-KEEP:1"))).toEqual(["X-KEEP:1"]);
  });

  test("a parameterised known property is still known", () => {
    expect(extractUnknownProperties(wrap("DTSTART;TZID=Europe/Amsterdam:2026"))).toEqual([]);
  });

  test("skips a line with no colon", () => {
    expect(extractUnknownProperties(wrap("garbage", "X-A:1"))).toEqual(["X-A:1"]);
  });

  test("skips a line with no name before its colon", () => {
    expect(extractUnknownProperties(wrap(":value", "X-A:1"))).toEqual(["X-A:1"]);
  });

  test("returns nothing without both markers, or with them the wrong way round", () => {
    expect(extractUnknownProperties("X-A:1")).toEqual([]);
    expect(extractUnknownProperties("BEGIN:VEVENT\r\nX-A:1\r\nX-B:2")).toEqual([]);
    expect(extractUnknownProperties("X-A:1\r\nEND:VEVENT")).toEqual([]);
    expect(extractUnknownProperties("END:VEVENT\r\nX-A:1\r\nBEGIN:VEVENT")).toEqual([]);
  });

  test("ignores lines outside the VEVENT", () => {
    const raw = ["X-OUT:1", "BEGIN:VEVENT", "X-IN:2", "END:VEVENT", "X-AFTER:3"].join("\r\n");
    expect(extractUnknownProperties(raw)).toEqual(["X-IN:2"]);
  });
});

describe("GEO", () => {
  const geoOf = (value: string) => {
    const raw = [...lines(vevent()).slice(0, -2), `GEO:${value}`, "END:VEVENT", "END:VCALENDAR"];
    return parseVEventToViewing(raw.join("\r\n")).geo;
  };

  test("is written as a float pair, not escaped TEXT", () => {
    expect(lines(vevent({ geo: { lat: 52.3665062, lon: 4.8947073 } }))).toContain(
      "GEO:52.3665062;4.8947073",
    );
  });

  test("a viewing with no geo has no GEO line", () => {
    expect(vevent()).not.toContain("GEO:");
  });

  test("reads a pair back, negatives and whole numbers included", () => {
    expect(geoOf("52.5;4.25")).toEqual({ lat: 52.5, lon: 4.25 });
    expect(geoOf("-33.86;-151.2")).toEqual({ lat: -33.86, lon: -151.2 });
    expect(geoOf("52;4")).toEqual({ lat: 52, lon: 4 });
  });

  test("rejects anything that isn't exactly two numbers", () => {
    for (const bad of ["", "52.5", "a;b", "x52;4", "52;4x", "52.;4", "52;.4", "52;4;1", "--5;4"]) {
      expect(geoOf(bad)).toBeUndefined();
    }
  });
});

describe("date-time values", () => {
  const startOf = (dtstart: string) => {
    const raw = [
      "BEGIN:VEVENT",
      "UID:u",
      `DTSTART${dtstart}`,
      "DTEND:20260102T060708",
      "SUMMARY:x",
      "END:VEVENT",
    ].join("\r\n");
    return parseVEventToViewing(raw).start;
  };

  test("a trailing Z is the instant it names", () => {
    expect(startOf(":20260102T030405Z")).toBe("2026-01-02T03:04:05.000Z");
  });

  test("no Z is the viewer's own wall-clock time", () => {
    expect(startOf(":20260102T030405")).toBe(new Date(2026, 0, 2, 3, 4, 5).toISOString());
  });

  test("a TZID parameter is dropped and the time read as floating", () => {
    expect(startOf(";TZID=Europe/Amsterdam:20260102T030405")).toBe(
      new Date(2026, 0, 2, 3, 4, 5).toISOString(),
    );
  });

  test("an all-day date is midnight UTC", () => {
    expect(startOf(";VALUE=DATE:20260102")).toBe("2026-01-02T00:00:00.000Z");
  });

  test("anything else is refused", () => {
    for (const bad of [
      ":x20260102T030405Z",
      ":20260102T030405Zx",
      ":x20260102T030405",
      ":20260102T030405x",
      ":x20260102",
      ":20260102x",
      ":2026-01-02",
      ":20260102T0304",
    ]) {
      expect(() => startOf(bad)).toThrow(/not a recognised iCalendar date-time/);
    }
  });
});

describe("reading a VEVENT block", () => {
  const body = (...rest: string[]) =>
    [
      "BEGIN:VEVENT",
      "UID:u",
      "DTSTART:20260102T030405Z",
      "DTEND:20260102T060708Z",
      "SUMMARY:Dune",
      ...rest,
      "END:VEVENT",
    ].join("\r\n");

  test("a value keeps any colon after the first", () => {
    expect(parseVEventToViewing(body("X-NOTES:a:b:c")).notes).toBe("a:b:c");
  });

  test("a property name is matched in any case, parameters ignored", () => {
    expect(parseVEventToViewing(body("x-notes;LANGUAGE=en:hello")).notes).toBe("hello");
  });

  test("a line without a colon, or without a name, is skipped", () => {
    expect(parseVEventToViewing(body("garbage", ":orphan", "X-NOTES:ok")).notes).toBe("ok");
  });

  test("a line with no colon never stands in for a property", () => {
    // Without the colon check its last character would be cut and the rest read as UID's value.
    expect(parseVEventToViewing(body("UIDX")).uid).toBe("u");
  });

  test("properties outside the block are not read", () => {
    const raw = ["X-NOTES:before", body(), "X-NOTES:after"].join("\r\n");
    expect(parseVEventToViewing(raw).notes).toBeUndefined();
  });

  test("with no markers it names what was missing", () => {
    expect(() => parseVEventToViewing("SUMMARY:x")).toThrow(
      "no BEGIN:VEVENT/END:VEVENT block found",
    );
  });

  test("with the markers reversed it is refused too", () => {
    expect(() => parseVEventToViewing("END:VEVENT\r\nSUMMARY:x\r\nBEGIN:VEVENT")).toThrow(
      "no BEGIN:VEVENT/END:VEVENT block found",
    );
  });

  test("with only one marker it is refused", () => {
    expect(() => parseVEventToViewing("BEGIN:VEVENT\r\nSUMMARY:x\r\nUID:u")).toThrow(/block found/);
    expect(() => parseVEventToViewing("SUMMARY:x\r\nEND:VEVENT")).toThrow(/block found/);
  });
});
