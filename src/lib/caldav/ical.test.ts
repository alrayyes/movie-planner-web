import { describe, expect, test } from "bun:test";
import {
  extractUnknownProperties,
  parsePicklistsFromVJournal,
  parseVEventToViewing,
  parseViewingsFromMultistatus,
  serializePicklistsToVJournal,
  serializeViewingToVEvent,
} from "./ical";
import type { NewViewing, Picklists } from "./types";

const VIEWING: NewViewing = {
  title: "Dune",
  start: "2026-01-01T19:00:00.000Z",
  end: "2026-01-01T21:30:00.000Z",
  medium: "cinema",
  venue: "Grand Vista Cinema",
  city: "Amsterdam",
  country: "Netherlands",
  streetAddress: "Vijzelstraat 15",
  postalCode: "1017 HD",
  director: "Denis Villeneuve",
  actors: "Timothée Chalamet, Zendaya",
  ratingImdb: "8.0",
  genre: "Action, Adventure, Drama",
  year: "2021",
  posterUrl: "https://example.com/dune-poster.jpg",
  imdbId: "tt1160419",
  synopsis:
    "A noble family becomes embroiled in a war for control over the galaxy's most valuable asset.",
  geo: { lat: 52.3665062, lon: 4.8947073 },
  row: "5",
  seat: "17",
  rated: "PG-13",
  runtime: "155 min",
  movieLanguage: "English",
  movieCountry: "USA, Canada",
  metascore: "74",
  imdbVotes: "789,012",
  dvd: "N/A",
  boxOffice: "$108,326,148",
  production: "Legendary Pictures",
  website: "https://www.dunemovie.com",
  released: "22 Oct 2021",
  awards: "Won 6 Oscars",
  trailerUrl: "https://www.youtube.com/watch?v=8g18jFHCLXk",
  collection: "Dune Collection",
  certification: "PG-13",
  keywords: "epic, desert, prophecy",
  budget: "165000000",
  popularity: "123.456",
};

describe("VEVENT round trip", () => {
  test("serializes and parses a viewing with full metadata", () => {
    const ical = serializeViewingToVEvent("abc-123", VIEWING);
    const parsed = parseVEventToViewing(ical);

    expect(parsed).toEqual({ uid: "abc-123", ...VIEWING });
  });

  test("round-trips a title with commas, semicolons and newlines", () => {
    const tricky: NewViewing = { ...VIEWING, title: "A, Movie; With\nStrange Punctuation" };
    const ical = serializeViewingToVEvent("uid-1", tricky);
    const parsed = parseVEventToViewing(ical);

    expect(parsed.title).toBe(tricky.title);
  });

  test("omits optional fields that weren't set", () => {
    const minimal: NewViewing = {
      title: "Paddington",
      start: "2026-02-01T18:00:00.000Z",
      end: "2026-02-01T19:40:00.000Z",
      medium: "netflix",
    };
    const parsed = parseVEventToViewing(serializeViewingToVEvent("uid-2", minimal));

    expect(parsed.venue).toBeUndefined();
    expect(parsed.director).toBeUndefined();
    expect(parsed.streetAddress).toBeUndefined();
    expect(parsed.postalCode).toBeUndefined();
    expect(parsed.collection).toBeUndefined();
    expect(parsed.certification).toBeUndefined();
    expect(parsed.keywords).toBeUndefined();
    expect(parsed.budget).toBeUndefined();
    expect(parsed.popularity).toBeUndefined();
  });

  // tasks.md 1.2: a dedicated round-trip test for the five new TMDb
  // X-properties, on top of the full-metadata fixture above already
  // covering them.
  test("round-trips the new TMDb X-properties (X-COLLECTION, X-CERTIFICATION, X-KEYWORDS, X-BUDGET, X-POPULARITY)", () => {
    const withTmdbFields: NewViewing = {
      title: "Dune",
      start: "2026-01-01T19:00:00.000Z",
      end: "2026-01-01T21:30:00.000Z",
      medium: "cinema",
      collection: "Dune Collection",
      certification: "PG-13",
      keywords: "epic, desert, prophecy",
      budget: "165000000",
      popularity: "123.456",
    };
    const ical = serializeViewingToVEvent("uid-tmdb", withTmdbFields);
    expect(ical).toContain("X-COLLECTION:Dune Collection");
    expect(ical).toContain("X-CERTIFICATION:PG-13");
    expect(ical).toContain("X-KEYWORDS:epic\\, desert\\, prophecy");
    expect(ical).toContain("X-BUDGET:165000000");
    expect(ical).toContain("X-POPULARITY:123.456");

    const parsed = parseVEventToViewing(ical);
    expect(parsed.collection).toBe("Dune Collection");
    expect(parsed.certification).toBe("PG-13");
    expect(parsed.keywords).toBe("epic, desert, prophecy");
    expect(parsed.budget).toBe("165000000");
    expect(parsed.popularity).toBe("123.456");
  });

  // #432: X-LAST-MODIFIED-BY attributes cross-app writes for the
  // diff-on-sync activity log — read back exactly like any other X-*
  // property.
  test("round-trips the X-LAST-MODIFIED-BY attribution property", () => {
    const attributed: NewViewing = { ...VIEWING, lastModifiedBy: "cli" };
    const ical = serializeViewingToVEvent("uid-attributed", attributed);
    const parsed = parseVEventToViewing(ical);

    expect(parsed.lastModifiedBy).toBe("cli");
  });

  test("throws on a VEVENT missing required fields", () => {
    const brokenIcal = [
      "BEGIN:VCALENDAR",
      "BEGIN:VEVENT",
      "UID:only-a-uid",
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n");
    expect(() => parseVEventToViewing(brokenIcal)).toThrow();
  });

  // #233: an all-day event (RFC 5545's DATE value, no time component)
  // is a real shape a visitor's own calendar app might write — many
  // default to it unless a time is set explicitly. This used to throw
  // during parsing and get silently dropped by
  // parseViewingsFromMultistatus, vanishing with no indication.
  test("parses an all-day (DATE-only) VEVENT instead of dropping it", () => {
    const allDayIcal = [
      "BEGIN:VCALENDAR",
      "BEGIN:VEVENT",
      "UID:all-day-uid",
      "SUMMARY:Dune",
      "DTSTART;VALUE=DATE:20260906",
      "DTEND;VALUE=DATE:20260907",
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n");
    const parsed = parseVEventToViewing(allDayIcal);
    expect(parsed.start).toBe("2026-09-06T00:00:00.000Z");
    expect(parsed.end).toBe("2026-09-07T00:00:00.000Z");
  });

  // #278: movie-planner's own calendar-schema.md documents a real
  // shape this app's parser never handled — "date + start time, no end
  // time": a DATE-TIME DTSTART with no DTEND at all (distinct from the
  // all-day, DATE-only case above, which also has no DTEND but a plain
  // DATE DTSTART). This used to throw and get silently dropped by
  // parseViewingsFromMultistatus, undercounting a visitor's real
  // calendar with no indication anything was wrong.
  test("parses a DATE-TIME VEVENT with no DTEND, defaulting end to start", () => {
    const noEndIcal = [
      "BEGIN:VCALENDAR",
      "BEGIN:VEVENT",
      "UID:no-end-uid",
      "SUMMARY:Dune",
      "DTSTART:20260906T190000Z",
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n");
    const parsed = parseVEventToViewing(noEndIcal);
    expect(parsed.start).toBe("2026-09-06T19:00:00.000Z");
    expect(parsed.end).toBe("2026-09-06T19:00:00.000Z");
  });

  // #8/#203: movie-planner#183 writes GEO as icalendar's vGeo.to_ical()
  // produces it — verified live against the pinned icalendar==7.3.0,
  // `52.3665062;4.8947073` (semicolon-separated per RFC 5545 §3.8.1.6).
  // A minimal VEVENT built by hand, matching the CLI's own shape
  // (LOCATION + GEO, no X-* properties), not serializeViewingToVEvent.
  test("parses a CLI-written GEO property alongside LOCATION", () => {
    const ical = [
      "BEGIN:VCALENDAR",
      "BEGIN:VEVENT",
      "UID:tuschinski-uid",
      "SUMMARY:Dune",
      "DTSTART:20260101T190000Z",
      "DTEND:20260101T213000Z",
      "LOCATION:Tuschinski, Amsterdam, Netherlands",
      "GEO:52.3665062;4.8947073",
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n");
    const parsed = parseVEventToViewing(ical);
    expect(parsed.geo).toEqual({ lat: 52.3665062, lon: 4.8947073 });
  });

  test("leaves geo undefined when GEO is absent, not a sentinel value", () => {
    const minimal: NewViewing = {
      title: "Paddington",
      start: "2026-02-01T18:00:00.000Z",
      end: "2026-02-01T19:40:00.000Z",
      medium: "netflix",
    };
    const parsed = parseVEventToViewing(serializeViewingToVEvent("uid-3", minimal));

    expect(parsed.geo).toBeUndefined();
  });

  test("leaves geo undefined for a malformed GEO value, without throwing", () => {
    const cases = [
      "52.3665062,4.8947073", // comma, not semicolon
      "not-a-number;4.8947073",
      "52.3665062",
    ];
    for (const geoValue of cases) {
      const ical = [
        "BEGIN:VCALENDAR",
        "BEGIN:VEVENT",
        "UID:bad-geo-uid",
        "SUMMARY:Dune",
        "DTSTART:20260101T190000Z",
        "DTEND:20260101T213000Z",
        `GEO:${geoValue}`,
        "END:VEVENT",
        "END:VCALENDAR",
      ].join("\r\n");
      expect(parseVEventToViewing(ical).geo).toBeUndefined();
    }
  });
});

// #79: the movie-planner CLI writes only SUMMARY/LOCATION/DTSTART/DTEND/
// DESCRIPTION — never this app's own X-* properties — with ratings and
// links embedded as plain-text DESCRIPTION lines instead. A minimal
// VEVENT built by hand here, not serializeViewingToVEvent (which never
// writes a DESCRIPTION), since the point is exercising a CLI-shaped
// event this app didn't write itself.
function cliVEvent(uid: string, description: string): string {
  const escaped = description.replace(/\n/g, "\\n");
  return [
    "BEGIN:VCALENDAR",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    "SUMMARY:Dune: Part Two",
    "DTSTART:20260101T190000Z",
    "DTEND:20260101T213000Z",
    `DESCRIPTION:${escaped}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
}

describe("DESCRIPTION fallback for CLI-native events", () => {
  test("rating-only IMDb line (the CLI's format before PR #93)", () => {
    const parsed = parseVEventToViewing(cliVEvent("u1", "IMDb: 8.5/10"));
    expect(parsed.ratingImdb).toBe("8.5/10");
    expect(parsed.imdbId).toBeUndefined();
  });

  test("rating+link IMDb line (the CLI's format after PR #93)", () => {
    const parsed = parseVEventToViewing(
      cliVEvent("u2", "IMDb: 8.5/10 (https://www.imdb.com/title/tt1160419/)"),
    );
    expect(parsed.ratingImdb).toBe("8.5/10");
    expect(parsed.imdbId).toBe("tt1160419");
  });

  test("link-only IMDb line", () => {
    const parsed = parseVEventToViewing(
      cliVEvent("u3", "IMDb: https://www.imdb.com/title/tt1160419/"),
    );
    expect(parsed.imdbId).toBe("tt1160419");
    expect(parsed.ratingImdb).toBeUndefined();
  });

  test("Rotten Tomatoes and Metacritic lines", () => {
    const parsed = parseVEventToViewing(
      cliVEvent("u4", "Rotten Tomatoes: 91%\nMetacritic: 74/100"),
    );
    expect(parsed.ratingRottenTomatoes).toBe("91%");
    expect(parsed.ratingMetacritic).toBe("74/100");
  });

  // #310
  test("Released, Plot, and Awards lines", () => {
    const parsed = parseVEventToViewing(
      cliVEvent(
        "u15",
        "Released: 22 Oct 2021\nPlot: A noble family becomes embroiled in a war.\nAwards: Won 6 Oscars",
      ),
    );
    expect(parsed.released).toBe("22 Oct 2021");
    expect(parsed.synopsis).toBe("A noble family becomes embroiled in a war.");
    expect(parsed.awards).toBe("Won 6 Oscars");
  });

  test("this app's own X-RELEASED/X-AWARDS win over DESCRIPTION when both are present", () => {
    const ical = [
      "BEGIN:VCALENDAR",
      "BEGIN:VEVENT",
      "UID:u16",
      "SUMMARY:Dune: Part Two",
      "DTSTART:20260101T190000Z",
      "DTEND:20260101T213000Z",
      "DESCRIPTION:Released: 1 Jan 1990\\nAwards: stale",
      "X-RELEASED:22 Oct 2021",
      "X-AWARDS:Won 6 Oscars",
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n");
    const parsed = parseVEventToViewing(ical);
    expect(parsed.released).toBe("22 Oct 2021");
    expect(parsed.awards).toBe("Won 6 Oscars");
  });

  test("a parsed Released/Awards field survives a subsequent write, same as any other OMDb-sourced field", () => {
    const parsed = parseVEventToViewing(
      cliVEvent("u17", "Released: 22 Oct 2021\nAwards: Won 6 Oscars"),
    );
    const rewritten = parseVEventToViewing(serializeViewingToVEvent("u17", parsed));
    expect(rewritten.released).toBe("22 Oct 2021");
    expect(rewritten.awards).toBe("Won 6 Oscars");
  });

  test("Letterboxd line without a rating", () => {
    const parsed = parseVEventToViewing(
      cliVEvent("u5", "Letterboxd: https://letterboxd.com/film/dune-part-two/"),
    );
    expect(parsed.letterboxdUrl).toBe("https://letterboxd.com/film/dune-part-two/");
    expect(parsed.letterboxdRating).toBeUndefined();
  });

  test("Letterboxd line with a rating", () => {
    const parsed = parseVEventToViewing(
      cliVEvent("u6", "Letterboxd: https://letterboxd.com/film/dune-part-two/ (4.2)"),
    );
    expect(parsed.letterboxdUrl).toBe("https://letterboxd.com/film/dune-part-two/");
    expect(parsed.letterboxdRating).toBe("4.2");
  });

  test("every line together, plus an unlabeled screening-details line that's ignored", () => {
    const description = [
      "IMDb: 8.5/10 (https://www.imdb.com/title/tt1160419/)",
      "Rotten Tomatoes: 91%",
      "Metacritic: 74/100",
      "Letterboxd: https://letterboxd.com/film/dune-part-two/ (4.2)",
      "Auditorium 3, Seat A12",
    ].join("\n");
    const parsed = parseVEventToViewing(cliVEvent("u7", description));
    expect(parsed.ratingImdb).toBe("8.5/10");
    expect(parsed.imdbId).toBe("tt1160419");
    expect(parsed.ratingRottenTomatoes).toBe("91%");
    expect(parsed.ratingMetacritic).toBe("74/100");
    expect(parsed.letterboxdUrl).toBe("https://letterboxd.com/film/dune-part-two/");
    expect(parsed.letterboxdRating).toBe("4.2");
  });

  test("a DESCRIPTION with none of these lines parses to no metadata, not a throw", () => {
    const parsed = parseVEventToViewing(cliVEvent("u8", "Auditorium 3, Seat A12"));
    expect(parsed.ratingImdb).toBeUndefined();
    expect(parsed.imdbId).toBeUndefined();
    expect(parsed.letterboxdUrl).toBeUndefined();
  });

  // #105
  test("a labelled Notes line", () => {
    const parsed = parseVEventToViewing(
      cliVEvent("u11", "Notes: Watched with Sam, a rewatch after the extended cut"),
    );
    expect(parsed.notes).toBe("Watched with Sam, a rewatch after the extended cut");
  });

  test("Notes and an unlabelled screening-details line stay distinct, in the CLI's own order", () => {
    const description = [
      "Letterboxd: https://letterboxd.com/film/dune-part-two/ (4.2)",
      "Notes: Watched with Sam",
      "Auditorium 3, Seat A12",
    ].join("\n");
    const parsed = parseVEventToViewing(cliVEvent("u12", description));
    expect(parsed.notes).toBe("Watched with Sam");
    // The unlabelled screening-details line has no field to land on — it
    // stays unparsed, same as when Notes is absent.
    expect(Object.keys(parsed)).not.toContain("bookingRef");
  });

  test("this app's own X-* properties win over DESCRIPTION when both are present", () => {
    const ical = [
      "BEGIN:VCALENDAR",
      "BEGIN:VEVENT",
      "UID:u9",
      "SUMMARY:Dune: Part Two",
      "DTSTART:20260101T190000Z",
      "DTEND:20260101T213000Z",
      "DESCRIPTION:IMDb: 1.0/10",
      "X-RATING-IMDB:8.5/10",
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n");
    expect(parseVEventToViewing(ical).ratingImdb).toBe("8.5/10");
  });

  test("a parsed Letterboxd field survives a subsequent write, same as any other OMDb-sourced field", () => {
    const parsed = parseVEventToViewing(
      cliVEvent("u10", "Letterboxd: https://letterboxd.com/film/dune-part-two/ (4.2)"),
    );
    const rewritten = parseVEventToViewing(serializeViewingToVEvent("u10", parsed));
    expect(rewritten.letterboxdUrl).toBe("https://letterboxd.com/film/dune-part-two/");
    expect(rewritten.letterboxdRating).toBe("4.2");
  });

  // #105
  test("this app's own X-NOTES wins over a DESCRIPTION Notes line when both are present", () => {
    const ical = [
      "BEGIN:VCALENDAR",
      "BEGIN:VEVENT",
      "UID:u13",
      "SUMMARY:Dune: Part Two",
      "DTSTART:20260101T190000Z",
      "DTEND:20260101T213000Z",
      "DESCRIPTION:Notes: stale note from the CLI",
      "X-NOTES:edited here since",
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n");
    expect(parseVEventToViewing(ical).notes).toBe("edited here since");
  });

  test("a parsed notes field survives a subsequent write, same as any other OMDb-sourced field", () => {
    const parsed = parseVEventToViewing(cliVEvent("u14", "Notes: Watched with Sam"));
    const rewritten = parseVEventToViewing(serializeViewingToVEvent("u14", parsed));
    expect(rewritten.notes).toBe("Watched with Sam");
  });
});

describe("parseViewingsFromMultistatus", () => {
  test("extracts every calendar-data block from a REPORT response", () => {
    const eventIcal = serializeViewingToVEvent("uid-1", VIEWING)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;");
    const xml = `<?xml version="1.0"?>
<D:multistatus xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav">
  <D:response>
    <D:propstat>
      <D:prop>
        <C:calendar-data>${eventIcal}</C:calendar-data>
      </D:prop>
    </D:propstat>
  </D:response>
</D:multistatus>`;

    const viewings = parseViewingsFromMultistatus(xml);

    expect(viewings).toHaveLength(1);
    expect(viewings[0]?.title).toBe("Dune");
  });

  test("skips a resource that isn't a well-formed VEVENT (the sidecar) without failing", () => {
    const xml = `<D:multistatus xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav">
  <D:response><D:propstat><D:prop>
    <C:calendar-data>BEGIN:VCALENDAR
BEGIN:VJOURNAL
UID:movie-planner-web-config
END:VJOURNAL
END:VCALENDAR</C:calendar-data>
  </D:prop></D:propstat></D:response>
</D:multistatus>`;

    expect(parseViewingsFromMultistatus(xml)).toEqual([]);
  });
});

describe("VJOURNAL sidecar round trip", () => {
  const picklists: Picklists = {
    media: ["cinema", "netflix"],
    venues: [
      {
        name: "Grand Vista Cinema",
        streetAddress: "123 Main St",
        postalCode: "12345",
        city: "Anytown",
        country: "USA",
        geo: { lat: 52.3665062, lon: 4.8947073 },
      },
      { name: "Home" },
    ],
  };

  test("serializes and parses picklists", () => {
    const ical = serializePicklistsToVJournal(picklists);
    expect(parsePicklistsFromVJournal(ical)).toEqual(picklists);
  });

  test("returns empty picklists for a missing sidecar", () => {
    expect(parsePicklistsFromVJournal(null)).toEqual({ media: [], venues: [] });
  });

  test("returns empty picklists for an unparsable DESCRIPTION rather than throwing", () => {
    const corrupted = [
      "BEGIN:VCALENDAR",
      "BEGIN:VJOURNAL",
      "UID:x",
      "DESCRIPTION:not json",
      "END:VJOURNAL",
      "END:VCALENDAR",
    ].join("\r\n");
    expect(parsePicklistsFromVJournal(corrupted)).toEqual({ media: [], venues: [] });
  });

  // #452: a sidecar written before Picklists.venues grew structured
  // fields held plain strings — parsing has to keep accepting those
  // rather than breaking or silently dropping every venue a visitor
  // already had. Built by actually serializing the old `string[]`
  // shape (not hand-written iCal text) so this exercises the real
  // escaping/folding a genuine legacy sidecar went through.
  test("treats an old plain-string venue entry as a bare name, for backward compatibility", () => {
    const legacyPicklists = {
      media: ["cinema"],
      venues: ["Grand Vista Cinema", "De Munt, Vijzelstraat 15, 1017 HD Amsterdam, Netherlands"],
    } as unknown as Picklists;
    const raw = serializePicklistsToVJournal(legacyPicklists);
    expect(parsePicklistsFromVJournal(raw)).toEqual({
      media: ["cinema"],
      venues: [
        { name: "Grand Vista Cinema" },
        { name: "De Munt, Vijzelstraat 15, 1017 HD Amsterdam, Netherlands" },
      ],
    });
  });

  test("drops a corrupt venue entry (neither a string nor a named object) rather than throwing", () => {
    const raw = serializePicklistsToVJournal({
      media: [],
      // biome-ignore lint/suspicious/noExplicitAny: deliberately malformed input for this test
      venues: [42, { noNameField: true }, { name: "Real Venue" }] as any,
    });
    expect(parsePicklistsFromVJournal(raw)).toEqual({
      media: [],
      venues: [{ name: "Real Venue" }],
    });
  });
});

// #294: an unrecognized movie-planner extension (X-CITY/X-COUNTRY, at
// the time this app didn't yet read them — since folded into
// X_PROPERTIES by #267) used to vanish the moment this app
// regenerated a VEVENT it didn't originally write.
describe("extractUnknownProperties", () => {
  test("returns raw lines for properties outside this app's own known set", () => {
    const raw = [
      "BEGIN:VCALENDAR",
      "BEGIN:VEVENT",
      "UID:u1",
      "DTSTAMP:20260101T000000Z",
      "DTSTART:20260101T190000Z",
      "DTEND:20260101T213000Z",
      "SUMMARY:Dune",
      "X-FUTURE-FIELD:some value",
      "X-ANOTHER-FIELD:another value",
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n");

    expect(extractUnknownProperties(raw)).toEqual([
      "X-FUTURE-FIELD:some value",
      "X-ANOTHER-FIELD:another value",
    ]);
  });

  test("excludes every property this app already reads or writes itself", () => {
    const ical = serializeViewingToVEvent("u2", VIEWING);
    expect(extractUnknownProperties(ical)).toEqual([]);
  });

  test("returns nothing for a VEVENT it can't find the boundaries of", () => {
    expect(extractUnknownProperties("not an ics file at all")).toEqual([]);
  });
});

describe("serializeViewingToVEvent with extraLines", () => {
  test("carries preserved properties through into the serialized VEVENT", () => {
    const ical = serializeViewingToVEvent("u3", VIEWING, ["X-CITY:Amsterdam", "X-ROW:5"]);
    expect(ical).toContain("X-CITY:Amsterdam");
    expect(ical).toContain("X-ROW:5");
    // Still a well-formed VEVENT — the extra lines land inside it, not
    // appended after END:VEVENT.
    expect(ical.indexOf("X-CITY:Amsterdam")).toBeLessThan(ical.indexOf("END:VEVENT"));
  });
});

// #752: a viewing is a wall-clock time at the cinema. The movie-planner CLI
// writes floating times (DTSTART:20260101T190000, no Z and no TZID), which
// iCalendar defines as "the same wall-clock time wherever you are". This app
// used to read them as UTC, so a CLI-logged 19:00 showed at 20:00 in
// Amsterdam, and wrote UTC, so the CLI read a web-logged 00:30 as the previous
// day at 23:30. Each test sets its own zone: a runner in UTC can't tell the
// two readings apart.
describe("wall-clock times", () => {
  const inZone = (zone: string, run: () => void) => {
    const before = process.env.TZ;
    process.env.TZ = zone;
    try {
      run();
    } finally {
      if (before === undefined) delete process.env.TZ;
      else process.env.TZ = before;
    }
  };
  const vevent = (...lines: string[]) =>
    [
      "BEGIN:VCALENDAR",
      "BEGIN:VEVENT",
      "UID:u",
      "SUMMARY:Dune",
      ...lines,
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n");
  const dtstart = (ics: string) => /^DTSTART:(.*)$/m.exec(ics)?.[1];
  const dtend = (ics: string) => /^DTEND:(.*)$/m.exec(ics)?.[1];

  test("a floating DTSTART is read as that wall-clock time in the viewer's zone", () => {
    inZone("Europe/Amsterdam", () => {
      const parsed = parseVEventToViewing(
        vevent("DTSTART:20260101T190000", "DTEND:20260101T213000"),
      );
      expect(new Date(parsed.start).getHours()).toBe(19);
      expect(new Date(parsed.start).getDate()).toBe(1);
      expect(new Date(parsed.end).getHours()).toBe(21);
      expect(new Date(parsed.end).getMinutes()).toBe(30);
    });
  });

  test("a floating time reads the same wall-clock time west of UTC too", () => {
    inZone("America/New_York", () => {
      const parsed = parseVEventToViewing(
        vevent("DTSTART:20260101T190000", "DTEND:20260101T213000"),
      );
      expect(new Date(parsed.start).getHours()).toBe(19);
      expect(new Date(parsed.start).getDate()).toBe(1);
    });
  });

  test("a DTSTART with a Z is still the instant it names", () => {
    inZone("Europe/Amsterdam", () => {
      const parsed = parseVEventToViewing(
        vevent("DTSTART:20260101T190000Z", "DTEND:20260101T213000Z"),
      );
      expect(parsed.start).toBe("2026-01-01T19:00:00.000Z");
      expect(parsed.end).toBe("2026-01-01T21:30:00.000Z");
    });
  });

  test("DTSTART and DTEND are written floating, and DTSTAMP stays UTC", () => {
    inZone("Europe/Amsterdam", () => {
      const viewing: NewViewing = {
        title: "Dune",
        start: new Date(2026, 0, 1, 19, 0).toISOString(),
        end: new Date(2026, 0, 1, 21, 30).toISOString(),
        medium: "cinema",
      };
      const ics = serializeViewingToVEvent("u", viewing);
      expect(dtstart(ics)).toBe("20260101T190000");
      expect(dtend(ics)).toBe("20260101T213000");
      expect(/^DTSTAMP:\d{8}T\d{6}Z$/m.test(ics)).toBe(true);
    });
  });

  test("a viewing at 00:30 local keeps its local date when written", () => {
    inZone("Europe/Amsterdam", () => {
      const viewing: NewViewing = {
        title: "Late show",
        start: new Date(2026, 2, 15, 0, 30).toISOString(),
        end: new Date(2026, 2, 15, 2, 15).toISOString(),
        medium: "cinema",
      };
      // The instant is 23:30Z on the 14th; the CLI must still see the 15th.
      expect(viewing.start.slice(0, 10)).toBe("2026-03-14");
      expect(dtstart(serializeViewingToVEvent("u", viewing))).toBe("20260315T003000");
    });
  });

  test("a viewing survives a write and a read in zones either side of UTC", () => {
    for (const zone of ["Europe/Amsterdam", "America/New_York", "Asia/Tokyo"]) {
      inZone(zone, () => {
        const viewing: NewViewing = {
          title: "Dune",
          start: new Date(2026, 5, 20, 19, 0).toISOString(),
          end: new Date(2026, 5, 20, 21, 30).toISOString(),
          medium: "cinema",
        };
        const parsed = parseVEventToViewing(serializeViewingToVEvent("u", viewing));
        expect(parsed.start).toBe(viewing.start);
        expect(parsed.end).toBe(viewing.end);
      });
    }
  });
});

// #779: TEXT escapes are read one at a time, left to right (RFC 5545 §3.3.11),
// so an escaped backslash followed by a letter n is not a newline.
describe("TEXT values with backslashes", () => {
  const roundTrip = (notes: string) =>
    parseVEventToViewing(serializeViewingToVEvent("u", { ...VIEWING, notes })).notes;

  test("a backslash before n comes back as typed", () => {
    expect(roundTrip(String.raw`C:\new`)).toBe(String.raw`C:\new`);
    expect(roundTrip(String.raw`a\nb`)).toBe(String.raw`a\nb`);
  });

  test("a real newline, comma, semicolon and backslash all survive together", () => {
    const text = String.raw`a\b;c,d` + "\ne" + String.raw`\n`;
    expect(roundTrip(text)).toBe(text);
  });

  test("escapes another client wrote are each read as the RFC says", () => {
    const raw = [
      "BEGIN:VEVENT",
      "UID:u",
      "DTSTART:20260102T030405Z",
      "DTEND:20260102T060708Z",
      "SUMMARY:x",
      String.raw`X-NOTES:one\ntwo\Nthree\,four\;five\\six`,
      "END:VEVENT",
    ].join("\r\n");
    expect(parseVEventToViewing(raw).notes).toBe("one\ntwo\nthree,four;five\\six");
  });

  test("a backslash before any other character is kept as it is", () => {
    const raw = [
      "BEGIN:VEVENT",
      "UID:u",
      "DTSTART:20260102T030405Z",
      "DTEND:20260102T060708Z",
      "SUMMARY:x",
      String.raw`X-NOTES:a\xb`,
      "END:VEVENT",
    ].join("\r\n");
    expect(parseVEventToViewing(raw).notes).toBe(String.raw`a\xb`);
  });
});
