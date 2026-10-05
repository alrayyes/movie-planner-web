import { describe, expect, test } from "bun:test";
import { CINEMA, mediumDisplay, mediumKey, sameMedium } from "./display";

// #600: the CLI never writes a medium property to CalDAV at all today, so
// every CLI-logged viewing reaches this app with medium genuinely blank —
// there's no such thing as a viewing with no medium in practice, and it
// should read as "Cinema" (the CLI's own default for physical-screening
// imports) wherever it's displayed. Presentation only, same as
// venueDisplay: a viewing's own stored `medium` value is never rewritten.
describe("mediumDisplay", () => {
  test("undefined medium reads as Cinema", () => {
    expect(mediumDisplay(undefined)).toBe("Cinema");
  });

  test("an empty-string medium reads as Cinema", () => {
    expect(mediumDisplay("")).toBe("Cinema");
  });

  test("a real medium is returned unchanged", () => {
    expect(mediumDisplay("Netflix")).toBe("Netflix");
  });

  test("a real medium's casing is never normalized", () => {
    expect(mediumDisplay("netflix")).toBe("netflix");
  });
});

// #755: the Pathé path stored "cinema" and the log form stored "Cinema", and the
// medium pages matched by exact string, so one cinema split into two rows. A
// medium is the same medium whatever its casing or stray spaces; what's stored
// stays exactly as written, so nobody's calendar is rewritten.
describe("sameMedium", () => {
  test("ignores case", () => {
    expect(sameMedium("cinema", "Cinema")).toBe(true);
    expect(sameMedium("NETFLIX", "netflix")).toBe(true);
  });

  test("ignores surrounding spaces", () => {
    expect(sameMedium(" Netflix ", "netflix")).toBe(true);
  });

  test("a blank medium is Cinema, as mediumDisplay reads it", () => {
    expect(sameMedium(undefined, "cinema")).toBe(true);
    expect(sameMedium("", CINEMA)).toBe(true);
  });

  test("different mediums stay different", () => {
    expect(sameMedium("Netflix", "Cinema")).toBe(false);
    expect(sameMedium("Netflix", "Netflix Kids")).toBe(false);
  });
});

describe("mediumKey", () => {
  test("is the lowercased, trimmed display value", () => {
    expect(mediumKey("  Cinema ")).toBe("cinema");
    expect(mediumKey(undefined)).toBe("cinema");
  });
});

describe("CINEMA", () => {
  test("is the capitalised spelling the log form's default has always used", () => {
    expect(CINEMA).toBe("Cinema");
  });
});
