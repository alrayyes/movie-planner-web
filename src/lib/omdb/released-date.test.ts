import { describe, expect, test } from "bun:test";
import { parseReleasedDate } from "./released-date";

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

  test("returns null for an empty or malformed string", () => {
    expect(parseReleasedDate("")).toBeNull();
    expect(parseReleasedDate("not a date")).toBeNull();
    expect(parseReleasedDate("1994")).toBeNull();
  });
});
