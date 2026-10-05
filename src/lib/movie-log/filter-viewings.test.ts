import { describe, expect, test } from "bun:test";
import type { LoggedViewing } from "../caldav/types";
import { filterViewings, type ViewingFilters } from "./filter-viewings";

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

// #749: every filter on its own, against a viewing it should keep and one it
// should drop. The filter value is written in the wrong case and with spaces
// round it, because each is normalised here and not by the caller, and a blank
// value means "not set".
describe("filterViewings, one filter at a time", () => {
  interface Case {
    filter: keyof ViewingFilters;
    value: string;
    keeps: Partial<LoggedViewing>;
    drops: Partial<LoggedViewing>;
    // Text that is part of a kept value but isn't the whole of it.
    notEnough?: string;
  }
  const cases: Case[] = [
    {
      filter: "title",
      value: "  DUNE ",
      keeps: { title: "Dune: Part Two" },
      drops: { title: "Paddington" },
    },
    {
      filter: "medium",
      value: " CINEMA ",
      keeps: { medium: "cinema" },
      drops: { medium: "streaming" },
      notEnough: "cine",
    },
    {
      filter: "venue",
      value: " PATHÉ TUSCHINSKI ",
      keeps: { venue: "Pathé Tuschinski" },
      drops: { venue: "Kriterion" },
      notEnough: "pathé",
    },
    {
      filter: "director",
      value: " DENIS VILLENEUVE ",
      keeps: { director: "Jon Spaihts, Denis Villeneuve" },
      drops: { director: "Paul King" },
      notEnough: "denis",
    },
    {
      filter: "actor",
      value: " ZENDAYA ",
      keeps: { actors: "Timothée Chalamet, Zendaya" },
      drops: { actors: "Hugh Grant" },
      notEnough: "zen",
    },
    {
      filter: "genre",
      value: " DRAMA ",
      keeps: { genre: "Action, Drama" },
      drops: { genre: "Comedy" },
      notEnough: "dram",
    },
    {
      filter: "city",
      value: " AMSTERDAM ",
      keeps: { city: "Amsterdam" },
      drops: { city: "Utrecht" },
      notEnough: "amster",
    },
    {
      filter: "movieCountry",
      value: " USA ",
      keeps: { movieCountry: "UK, USA" },
      drops: { movieCountry: "France" },
      notEnough: "us",
    },
    {
      filter: "movieLanguage",
      value: " ENGLISH ",
      keeps: { movieLanguage: "French, English" },
      drops: { movieLanguage: "Dutch" },
      notEnough: "eng",
    },
    {
      filter: "rated",
      value: " PG-13 ",
      keeps: { rated: "PG-13" },
      drops: { rated: "R" },
      notEnough: "pg",
    },
    {
      filter: "releasedYear",
      value: " 2024 ",
      keeps: { released: "01 Mar 2024" },
      drops: { released: "01 Mar 2023" },
    },
    {
      filter: "releasedMonth",
      value: " 2024-03 ",
      keeps: { released: "15 Mar 2024" },
      drops: { released: "15 Apr 2024" },
    },
  ];

  for (const { filter, value, keeps, drops, notEnough } of cases) {
    describe(filter, () => {
      const kept = viewing({ uid: "kept", ...keeps });
      const dropped = viewing({ uid: "dropped", ...drops });

      test("keeps what matches and drops what doesn't, whatever the case and spacing", () => {
        expect(filterViewings([kept, dropped], { [filter]: value })).toEqual([kept]);
      });

      test("a blank value is not a filter", () => {
        expect(filterViewings([kept, dropped], { [filter]: "   " })).toEqual([kept, dropped]);
      });

      if (filter !== "title" && filter !== "releasedYear" && filter !== "releasedMonth") {
        test("a viewing without the field is dropped, not an error", () => {
          const bare = viewing({
            uid: "bare",
            medium: filter === "medium" ? "other" : "cinema",
          });
          expect(filterViewings([bare], { [filter]: value })).toEqual([]);
        });
      }

      if (filter === "releasedYear" || filter === "releasedMonth") {
        test("a viewing with no usable release date is dropped", () => {
          const unreleased = [viewing({ uid: "a" }), viewing({ uid: "b", released: "N/A" })];
          expect(filterViewings(unreleased, { [filter]: value })).toEqual([]);
        });
      }

      if (notEnough) {
        test("part of a value isn't a match", () => {
          expect(filterViewings([kept], { [filter]: notEnough })).toEqual([]);
        });
      }
    });
  }

  test("year and month are checked separately when both are given", () => {
    const march = viewing({ uid: "march", released: "01 Mar 2024" });
    const april = viewing({ uid: "april", released: "01 Apr 2024" });
    expect(
      filterViewings([march, april], { releasedYear: "2024", releasedMonth: "2024-03" }),
    ).toEqual([march]);
    // The right month in the wrong year, and the right year in the wrong month.
    expect(filterViewings([march], { releasedYear: "2023", releasedMonth: "2024-03" })).toEqual([]);
    expect(filterViewings([march], { releasedYear: "2024", releasedMonth: "2024-04" })).toEqual([]);
  });
});
