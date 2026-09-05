import { describe, expect, test } from "bun:test";
import {
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
  director: "Denis Villeneuve",
  actors: "Timothée Chalamet, Zendaya",
  ratingImdb: "8.0",
  genre: "Action, Adventure, Drama",
  year: "2021",
  posterUrl: "https://example.com/dune-poster.jpg",
  imdbId: "tt1160419",
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
