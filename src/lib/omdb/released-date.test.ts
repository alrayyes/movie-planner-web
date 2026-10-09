import { describe, expect, test } from "bun:test";
import { parseReleasedDate, releasedDayOfWeek } from "./released-date";

describe("parseReleasedDate", () => {
  test("parses OMDb's own 'DD MMM YYYY' shape into year/month/date filter values", () => {
    expect(parseReleasedDate("08 Jul 1994")).toEqual({
      year: "1994",
      month: "1994-07",
      date: "1994-07-08",
    });
  });

  test("zero-pads a single-digit day", () => {
    expect(parseReleasedDate("01 Jan 2000")).toEqual({
      year: "2000",
      month: "2000-01",
      date: "2000-01-01",
    });
  });

  // #373: OMDb's own "not available" sentinel — never guessed, matching
  // this app's existing rule for every other optional OMDb field.
  test("returns null for OMDb's own N/A sentinel", () => {
    expect(parseReleasedDate("N/A")).toBeNull();
  });

  test.each([
    ["Jan", "01"],
    ["Feb", "02"],
    ["Mar", "03"],
    ["Apr", "04"],
    ["May", "05"],
    ["Jun", "06"],
    ["Jul", "07"],
    ["Aug", "08"],
    ["Sep", "09"],
    ["Oct", "10"],
    ["Nov", "11"],
    ["Dec", "12"],
  ])("maps %s to month %s", (name, number) => {
    expect(parseReleasedDate(`15 ${name} 2001`)).toEqual({
      year: "2001",
      month: `2001-${number}`,
      date: `2001-${number}-15`,
    });
  });

  test("returns null for a three-letter word that isn't a month", () => {
    expect(parseReleasedDate("15 Foo 2001")).toBeNull();
  });

  test("accepts a one-digit day and pads it", () => {
    expect(parseReleasedDate("8 Jul 1994")?.date).toBe("1994-07-08");
  });

  test("returns null when text surrounds an otherwise valid date", () => {
    expect(parseReleasedDate("x 08 Jul 1994")).toBeNull();
    expect(parseReleasedDate("08 Jul 1994 x")).toBeNull();
  });

  test("returns null for an empty or malformed string", () => {
    expect(parseReleasedDate("")).toBeNull();
    expect(parseReleasedDate("not a date")).toBeNull();
    expect(parseReleasedDate("1994")).toBeNull();
  });
});

// #545: the movie details page shows the day of week alongside the raw
// Released date — this is the one place that computes it, from the
// same parsed date the year/month filter values already come from,
// via local (not UTC) date components so it can't land on the wrong
// day the way naive `new Date("22 Oct 2021")` string parsing can.
describe("releasedDayOfWeek", () => {
  test("returns the short weekday name for a parseable released date", () => {
    // 8 July 1994 was a Friday.
    expect(releasedDayOfWeek("08 Jul 1994")).toBe("Fri");
  });

  test("returns null for OMDb's own N/A sentinel", () => {
    expect(releasedDayOfWeek("N/A")).toBeNull();
  });

  test("returns null for an unparseable value", () => {
    expect(releasedDayOfWeek("not a date")).toBeNull();
  });
});
