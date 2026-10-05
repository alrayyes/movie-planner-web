import { describe, expect, test } from "bun:test";
import {
  normalizeVenueEntry,
  parsePicklistsFromVJournal,
  parseVEventToViewing,
  parseViewingsFromMultistatus,
  serializePicklistsToVJournal,
} from "./ical";

// #749: how the app reads what the movie-planner CLI writes (a DESCRIPTION of
// labelled lines), the REPORT response around it, and the picklist sidecar.
const event = (...extra: string[]) =>
  [
    "BEGIN:VCALENDAR",
    "BEGIN:VEVENT",
    "UID:u",
    "DTSTART:20260102T030405Z",
    "DTEND:20260102T060708Z",
    "SUMMARY:Dune",
    ...extra,
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");

// A DESCRIPTION whose lines are separated by the escaped newline the CLI writes.
const described = (...lines: string[]) =>
  parseVEventToViewing(event(`DESCRIPTION:${lines.join(String.raw`\n`)}`));

describe("required properties", () => {
  test("a missing UID, SUMMARY or DTSTART is refused, each on its own", () => {
    const without = (name: string) =>
      event()
        .split("\r\n")
        .filter((l) => !l.startsWith(`${name}:`))
        .join("\r\n");
    for (const name of ["UID", "SUMMARY", "DTSTART"]) {
      expect(() => parseVEventToViewing(without(name))).toThrow(
        "VEVENT is missing UID, SUMMARY or DTSTART",
      );
    }
  });

  test("a missing DTEND defaults to the start", () => {
    const raw = event().replace("DTEND:20260102T060708Z\r\n", "");
    const viewing = parseVEventToViewing(raw);
    expect(viewing.end).toBe(viewing.start);
  });

  test("a missing medium is an empty string", () => {
    expect(parseVEventToViewing(event()).medium).toBe("");
  });

  test("optional fields that aren't there are absent, not undefined", () => {
    const keys = Object.keys(parseVEventToViewing(event()));
    expect(keys.sort()).toEqual(["end", "medium", "start", "title", "uid"]);
  });

  test("an unreadable GEO leaves no geo key", () => {
    expect(Object.keys(parseVEventToViewing(event("GEO:nonsense")))).not.toContain("geo");
  });

  test("LOCATION becomes the venue", () => {
    expect(parseVEventToViewing(event("LOCATION:Odeon")).venue).toBe("Odeon");
  });
});

describe("DESCRIPTION lines", () => {
  test("IMDb with a rating and a link gives both", () => {
    const v = described("IMDb: 8.0 (https://www.imdb.com/title/tt1160419/)");
    expect(v.ratingImdb).toBe("8.0");
    expect(v.imdbId).toBe("tt1160419");
  });

  test("the link needs no trailing slash", () => {
    expect(described("IMDb: 8.0 (https://www.imdb.com/title/tt1160419)").imdbId).toBe("tt1160419");
  });

  test("a link alone gives the id and no rating", () => {
    const v = described("IMDb: https://www.imdb.com/title/tt1160419/");
    expect(v.imdbId).toBe("tt1160419");
    expect(Object.keys(v)).not.toContain("ratingImdb");
  });

  test("a rating alone gives the rating and no id", () => {
    const v = described("IMDb: 8.0");
    expect(v.ratingImdb).toBe("8.0");
    expect(Object.keys(v)).not.toContain("imdbId");
  });

  test("only the bracket just before the link is dropped from the rating", () => {
    const v = described("IMDb: 8.0 (est) (https://www.imdb.com/title/tt1/)");
    expect(v.ratingImdb).toBe("8.0 (est)");
  });

  test("spaces inside that bracket are dropped with it", () => {
    const v = described("IMDb: 8.0 (   https://www.imdb.com/title/tt1/)");
    expect(v.ratingImdb).toBe("8.0");
  });

  const labelled: [string, string, string][] = [
    ["Rotten Tomatoes", "ratingRottenTomatoes", "91%"],
    ["Metacritic", "ratingMetacritic", "74"],
    ["Released", "released", "22 Oct 2021"],
    ["Plot", "synopsis", "A noble family."],
    ["Awards", "awards", "Won 6 Oscars"],
    ["Notes", "notes", "Loved it"],
    ["IMDb", "ratingImdb", "8.0"],
  ];

  for (const [label, field, value] of labelled) {
    describe(label, () => {
      const read = (line: string) =>
        (described(line) as unknown as Record<string, string | undefined>)[field];

      test("is read into its field", () => {
        expect(read(`${label}: ${value}`)).toBe(value);
      });
      test("needs no space after the colon, and takes more than one", () => {
        expect(read(`${label}:${value}`)).toBe(value);
        expect(read(`${label}:    ${value}`)).toBe(value);
      });
      test("must start the line", () => {
        expect(read(`see ${label}: ${value}`)).toBeUndefined();
      });
      test("ignores the surrounding whitespace of the line", () => {
        expect(read(`   ${label}: ${value}   `)).toBe(value);
      });
      test("needs something after the label", () => {
        expect(read(`${label}:`)).toBeUndefined();
      });
    });
  }

  describe("Letterboxd", () => {
    const url = "https://letterboxd.com/film/dune-2021/";
    test("a link alone", () => {
      const v = described(`Letterboxd: ${url}`);
      expect(v.letterboxdUrl).toBe(url);
      expect(Object.keys(v)).not.toContain("letterboxdRating");
    });
    test("a link with a rating", () => {
      const v = described(`Letterboxd: ${url} (4.5)`);
      expect(v.letterboxdUrl).toBe(url);
      expect(v.letterboxdRating).toBe("4.5");
    });
    test("several spaces before the bracket, none after the colon", () => {
      const v = described(`Letterboxd:${url}   (4.5)`);
      expect(v.letterboxdUrl).toBe(url);
      expect(v.letterboxdRating).toBe("4.5");
    });
    test("anything else after the link means it isn't one", () => {
      expect(described(`Letterboxd: ${url} extra`).letterboxdUrl).toBeUndefined();
    });
    test("must start the line", () => {
      expect(described(`my Letterboxd: ${url}`).letterboxdUrl).toBeUndefined();
    });
  });

  test("each line is read on its own, in any order", () => {
    const v = described("Notes: n", "Plot: p", "Released: r", "Metacritic: 1", "junk line");
    expect([v.notes, v.synopsis, v.released, v.ratingMetacritic]).toEqual(["n", "p", "r", "1"]);
  });

  test("this app's own X- property wins over the same fact in DESCRIPTION", () => {
    const raw = event("X-NOTES:from x", String.raw`DESCRIPTION:Notes: from description\nPlot: p`);
    const v = parseVEventToViewing(raw);
    expect(v.notes).toBe("from x");
    expect(v.synopsis).toBe("p");
  });

  test("an empty DESCRIPTION adds nothing", () => {
    expect(Object.keys(parseVEventToViewing(event("DESCRIPTION:")))).toEqual(
      Object.keys(parseVEventToViewing(event())),
    );
  });
});

describe("parseViewingsFromMultistatus", () => {
  const wrap = (tag: string, body: string) =>
    `<D:multistatus xmlns:D="DAV:"><D:response><${tag}>${body}</${tag.split(" ")[0]}></D:response></D:multistatus>`;

  test("reads every calendar-data, whichever namespace prefix names it", () => {
    for (const tag of [
      "C:calendar-data",
      "cal:calendar-data",
      "calendar-data",
      "c:calendar-data",
    ]) {
      const xml = wrap(tag, event());
      expect(parseViewingsFromMultistatus(xml).map((v) => v.uid)).toEqual(["u"]);
    }
  });

  test("accepts attributes on the opening tag", () => {
    const xml = wrap('C:calendar-data content-type="text/calendar"', event());
    expect(parseViewingsFromMultistatus(xml)).toHaveLength(1);
  });

  test("a prefix with a different local name is not calendar-data", () => {
    expect(parseViewingsFromMultistatus(wrap("C:not-calendar-data", event()))).toEqual([]);
  });

  test("a closing tag must name calendar-data too", () => {
    const xml = `<C:calendar-data>${event()}</C:other>`;
    expect(parseViewingsFromMultistatus(xml)).toEqual([]);
  });

  test("decodes the entities XML escapes, ampersand last", () => {
    const body = event("X-NOTES:a &amp;lt; b &lt; &gt; &quot;q&quot; &apos;s&apos; &amp;");
    const [viewing] = parseViewingsFromMultistatus(wrap("C:calendar-data", body));
    expect(viewing?.notes).toBe("a &lt; b < > \"q\" 's' &");
  });

  test("decodes every occurrence of an entity", () => {
    const body = event("X-NOTES:&lt;&lt; &gt;&gt; &quot;&quot; &apos;&apos; &amp;&amp;");
    const [viewing] = parseViewingsFromMultistatus(wrap("C:calendar-data", body));
    expect(viewing?.notes).toBe("<< >> \"\" '' &&");
  });

  test("skips a resource that isn't a VEVENT and keeps the rest", () => {
    const xml = `<C:calendar-data>BEGIN:VJOURNAL\r\nEND:VJOURNAL</C:calendar-data><C:calendar-data>${event()}</C:calendar-data>`;
    expect(parseViewingsFromMultistatus(xml).map((v) => v.uid)).toEqual(["u"]);
  });

  test("an empty element is skipped", () => {
    expect(parseViewingsFromMultistatus("<C:calendar-data></C:calendar-data>")).toEqual([]);
  });

  test("reads several resources in order", () => {
    const one = event().replace("UID:u", "UID:one");
    const two = event().replace("UID:u", "UID:two");
    const xml = `<C:calendar-data>${one}</C:calendar-data>\n<C:calendar-data>${two}</C:calendar-data>`;
    expect(parseViewingsFromMultistatus(xml).map((v) => v.uid)).toEqual(["one", "two"]);
  });
});

describe("the picklist sidecar", () => {
  const journal = (description: string) =>
    [
      "BEGIN:VJOURNAL",
      "UID:x",
      `DESCRIPTION:${description.replace(/[\\,;]/g, (c) => `\\${c}`)}`,
      "END:VJOURNAL",
    ].join("\r\n");

  test("is a VJOURNAL carrying the picklists as JSON", () => {
    const raw = serializePicklistsToVJournal({ media: ["cinema"], venues: [{ name: "Home" }] });
    const lines = raw.split("\r\n");
    expect(lines.slice(0, 4)).toEqual([
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//movie-planner-web//EN",
      "BEGIN:VJOURNAL",
    ]);
    expect(lines).toContain("UID:movie-planner-web-config");
    expect(lines).toContain("SUMMARY:movie-planner-web configuration — do not edit directly");
    expect(lines.at(-2)).toBe("END:VJOURNAL");
    expect(lines.at(-1)).toBe("END:VCALENDAR");
    expect(lines.some((l) => l.startsWith("DTSTAMP:"))).toBe(true);
    expect(lines.some((l) => l.startsWith("DESCRIPTION:"))).toBe(true);
  });

  test("an empty string is an empty sidecar", () => {
    expect(parsePicklistsFromVJournal("")).toEqual({ media: [], venues: [] });
  });

  test("a sidecar with no DESCRIPTION is empty", () => {
    const raw = "BEGIN:VJOURNAL\r\nUID:x\r\nEND:VJOURNAL";
    expect(parsePicklistsFromVJournal(raw)).toEqual({ media: [], venues: [] });
  });

  test("text that isn't a VJOURNAL at all is empty", () => {
    expect(parsePicklistsFromVJournal("hello")).toEqual({ media: [], venues: [] });
  });

  test("JSON of the wrong shape is empty", () => {
    for (const json of [
      "null",
      "42",
      '"x"',
      "[]",
      '{"media":[]}',
      '{"venues":[]}',
      '{"media":1,"venues":[]}',
      '{"media":[],"venues":{}}',
    ]) {
      expect(parsePicklistsFromVJournal(journal(json))).toEqual({ media: [], venues: [] });
    }
  });

  test("an empty list for each is a valid sidecar", () => {
    expect(parsePicklistsFromVJournal(journal('{"media":[],"venues":[]}'))).toEqual({
      media: [],
      venues: [],
    });
  });

  test("keeps only string media, in order", () => {
    const raw = journal('{"media":["a",1,null,"b"],"venues":[]}');
    expect(parsePicklistsFromVJournal(raw).media).toEqual(["a", "b"]);
  });
});

describe("normalizeVenueEntry", () => {
  test("a non-empty string becomes a bare name", () => {
    expect(normalizeVenueEntry("Odeon")).toEqual({ name: "Odeon" });
  });
  test("an empty string is dropped", () => {
    expect(normalizeVenueEntry("")).toBeUndefined();
  });
  test("an object with a name is kept whole", () => {
    const entry = { name: "Odeon", city: "Utrecht" };
    expect(normalizeVenueEntry(entry)).toBe(entry);
  });
  test("an object with an empty or non-string name is dropped", () => {
    expect(normalizeVenueEntry({ name: "" })).toBeUndefined();
    expect(normalizeVenueEntry({ name: 5 })).toBeUndefined();
    expect(normalizeVenueEntry({})).toBeUndefined();
  });
  test("null and other types are dropped", () => {
    expect(normalizeVenueEntry(null)).toBeUndefined();
    expect(normalizeVenueEntry(7)).toBeUndefined();
    expect(normalizeVenueEntry(undefined)).toBeUndefined();
    expect(normalizeVenueEntry(["Odeon"])).toBeUndefined();
  });
});
