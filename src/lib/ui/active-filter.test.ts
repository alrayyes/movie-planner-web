import { describe, expect, test } from "bun:test";
import { activeFilterLabel } from "./active-filter";

describe("activeFilterLabel", () => {
  test("labels a director filter, since a bare name reads ambiguously on its own", () => {
    expect(activeFilterLabel({ director: "Christopher Nolan" })).toBe(
      "Christopher Nolan (director)",
    );
  });

  test("labels a venue filter the same way", () => {
    expect(activeFilterLabel({ venue: "Grand Vista Cinema" })).toBe("Grand Vista Cinema (venue)");
  });

  // #437: the venue's own Country filter (the previous qualifier-less
  // case) was removed outright — every remaining recognized filter now
  // gets its own qualifier.
  test("labels every other recognized single filter with its own qualifier", () => {
    expect(activeFilterLabel({ medium: "cinema" })).toBe("cinema (medium)");
    expect(activeFilterLabel({ actor: "Zendaya" })).toBe("Zendaya (actor)");
    expect(activeFilterLabel({ genre: "Action" })).toBe("Action (genre)");
    expect(activeFilterLabel({ city: "Amsterdam" })).toBe("Amsterdam (city)");
    expect(activeFilterLabel({ movieCountry: "France" })).toBe("France (movie country)");
    expect(activeFilterLabel({ movieLanguage: "French" })).toBe("French (movie language)");
    expect(activeFilterLabel({ rated: "PG-13" })).toBe("PG-13 (rated)");
    expect(activeFilterLabel({ releasedYear: "2021" })).toBe("2021 (release year)");
    expect(activeFilterLabel({ releasedMonth: "2021-10" })).toBe("2021-10 (release month)");
  });

  test("returns null when nothing is active", () => {
    expect(activeFilterLabel({})).toBeNull();
  });

  test("returns null when more than one filter is active, rather than guessing which to show", () => {
    expect(
      activeFilterLabel({ director: "Christopher Nolan", venue: "Grand Vista Cinema" }),
    ).toBeNull();
  });

  test("ignores empty-string values, same as an unset filter", () => {
    expect(activeFilterLabel({ director: "Christopher Nolan", venue: "" })).toBe(
      "Christopher Nolan (director)",
    );
  });
});
