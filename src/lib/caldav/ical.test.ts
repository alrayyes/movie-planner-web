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
  const picklists: Picklists = { media: ["cinema", "netflix"], venues: ["Grand Vista Cinema"] };

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
