import { describe, expect, test } from "bun:test";
import { venueLabel } from "./venue";

describe("venueLabel", () => {
  test("joins venue, city and country when all three are known", () => {
    expect(venueLabel("De Munt", "Amsterdam", "Netherlands")).toBe(
      "De Munt, Amsterdam, Netherlands",
    );
  });

  test("omits city/country parts that aren't known, without a dangling separator", () => {
    expect(venueLabel("De Munt", undefined, undefined)).toBe("De Munt");
    expect(venueLabel("De Munt", "Amsterdam", undefined)).toBe("De Munt, Amsterdam");
    expect(venueLabel("De Munt", undefined, "Netherlands")).toBe("De Munt, Netherlands");
  });

  test("returns an empty string when there's no venue at all", () => {
    expect(venueLabel(undefined, "Amsterdam", "Netherlands")).toBe("");
    expect(venueLabel(undefined, undefined, undefined)).toBe("");
  });
});
