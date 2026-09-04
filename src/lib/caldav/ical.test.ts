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
