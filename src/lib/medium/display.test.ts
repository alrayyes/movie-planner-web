import { describe, expect, test } from "bun:test";
import { mediumDisplay } from "./display";

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
