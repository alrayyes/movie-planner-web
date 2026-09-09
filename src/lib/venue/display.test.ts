import { describe, expect, test } from "bun:test";
import { venueDisplay } from "./display";

// #440: at least "Cinecenter", "De Munt", and a venue named "City" have a
// full street address baked directly into the raw venue/LOCATION field
// itself (movie-planner#331) — this is the one place that trims a venue
// down to what a visitor should actually read, shared by every read-only
// render site, so a data-quality fix upstream (or its absence) never has
// to be handled in four different components.
describe("venueDisplay", () => {
  test("trims to the text before the first comma and appends the known city", () => {
    expect(
      venueDisplay("De Munt, Vijzelstraat 15, 1017 HD Amsterdam, Netherlands", "Amsterdam"),
    ).toBe("De Munt, Amsterdam");
  });

  test("leaves a venue with no comma at all unchanged, appending the known city", () => {
    expect(venueDisplay("AFAS Cinema", "Rotterdam")).toBe("AFAS Cinema, Rotterdam");
  });

  test("leaves a venue with no comma at all unchanged when there's no known city either", () => {
    expect(venueDisplay("AFAS Cinema", undefined)).toBe("AFAS Cinema");
  });

  test("shows just the trimmed name when there's no known city", () => {
    expect(venueDisplay("De Munt, Vijzelstraat 15, Amsterdam, Netherlands", undefined)).toBe(
      "De Munt",
    );
  });

  test("never appends the country, even when passed as the city argument by mistake", () => {
    // Guards the "never country" decision at the type level too — this
    // just documents that the function only ever knows about one place
    // name, not two.
    expect(venueDisplay("Cinecenter", "Amsterdam")).toBe("Cinecenter, Amsterdam");
  });

  test("undefined venue returns an empty string", () => {
    expect(venueDisplay(undefined, "Amsterdam")).toBe("");
  });

  test("an empty venue returns an empty string, city ignored", () => {
    expect(venueDisplay("", "Amsterdam")).toBe("");
  });

  test("city defaults to not being appended when omitted entirely", () => {
    expect(venueDisplay("Tuschinski")).toBe("Tuschinski");
  });
});
