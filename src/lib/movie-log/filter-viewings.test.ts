import { describe, expect, test } from "bun:test";
import type { LoggedViewing } from "../caldav/types";
import { filterViewings } from "./filter-viewings";

function viewing(overrides: Partial<LoggedViewing> = {}): LoggedViewing {
  return {
    uid: "1",
    title: "Dune: Part Two",
    start: "2025-01-15T18:00:00.000Z",
    end: "2025-01-15T20:00:00.000Z",
    medium: "cinema",
    ...overrides,
  };
}

describe("filterViewings", () => {
  test("returns everything when no filter is set", () => {
    const viewings = [viewing(), viewing({ uid: "2", title: "Paddington" })];
    expect(filterViewings(viewings, {})).toEqual(viewings);
  });

  test("filters title by case-insensitive substring", () => {
    const viewings = [viewing(), viewing({ uid: "2", title: "Paddington" })];
    expect(filterViewings(viewings, { title: "dune" })).toEqual([viewings[0]]);
  });

  test("filters medium by exact case-insensitive match", () => {
    const viewings = [viewing(), viewing({ uid: "2", medium: "streaming" })];
    expect(filterViewings(viewings, { medium: "Cinema" })).toEqual([viewings[0]]);
  });

  test("filters venue by exact match, treating a missing venue as unmatched", () => {
    const viewings = [viewing({ venue: "Pathé Tuschinski" }), viewing({ uid: "2" })];
    expect(filterViewings(viewings, { venue: "pathé tuschinski" })).toEqual([viewings[0]]);
  });

  test("filters director/actor/genre against each individually split value", () => {
    const viewings = [
      viewing({ director: "Denis Villeneuve", actors: "Timothée Chalamet, Zendaya" }),
      viewing({ uid: "2", director: "Paul King" }),
    ];
    expect(filterViewings(viewings, { director: "Denis Villeneuve" })).toEqual([viewings[0]]);
    expect(filterViewings(viewings, { actor: "Zendaya" })).toEqual([viewings[0]]);
  });

  test("filters city, movieCountry, movieLanguage, and rated", () => {
    const viewings = [
      viewing({ city: "Amsterdam", movieCountry: "USA", movieLanguage: "English", rated: "PG-13" }),
      viewing({ uid: "2" }),
    ];
    expect(filterViewings(viewings, { city: "amsterdam" })).toEqual([viewings[0]]);
    expect(filterViewings(viewings, { movieCountry: "usa" })).toEqual([viewings[0]]);
    expect(filterViewings(viewings, { movieLanguage: "english" })).toEqual([viewings[0]]);
    expect(filterViewings(viewings, { rated: "pg-13" })).toEqual([viewings[0]]);
  });

  test("filters by released year and month, excluding a viewing with no parseable Released", () => {
    const viewings = [
      viewing({ released: "01 Mar 2024" }),
      viewing({ uid: "2", released: "N/A" }),
      viewing({ uid: "3" }),
    ];
    expect(filterViewings(viewings, { releasedYear: "2024" })).toEqual([viewings[0]]);
    expect(filterViewings(viewings, { releasedMonth: "2024-03" })).toEqual([viewings[0]]);
  });

  test("combines multiple filters with AND semantics", () => {
    const viewings = [
      viewing({ medium: "cinema", venue: "Pathé Tuschinski" }),
      viewing({ uid: "2", medium: "cinema", venue: "Kriterion" }),
    ];
    expect(filterViewings(viewings, { medium: "cinema", venue: "kriterion" })).toEqual([
      viewings[1],
    ]);
  });
});
