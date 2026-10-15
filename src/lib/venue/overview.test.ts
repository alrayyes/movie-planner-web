import { describe, expect, test } from "bun:test";
import type { LoggedViewing, VenueEntry } from "../caldav/types";
import { buildVenueInfos, groupByLocation, pinsFor } from "./overview";

function viewing(overrides: Partial<LoggedViewing>): LoggedViewing {
  return {
    uid: "uid",
    title: "Title",
    start: "2024-01-01T00:00:00.000Z",
    end: "2024-01-01T01:00:00.000Z",
    medium: "cinema",
    ...overrides,
  };
}

describe("buildVenueInfos", () => {
  test("a venue only known from a calendar entry is listed with its count", () => {
    const infos = buildVenueInfos([], [viewing({ venue: "A CLI-Logged Cinema" })]);

    expect(infos).toEqual([{ venue: "A CLI-Logged Cinema", count: 1 }]);
  });

  test("a venue on both the picklist and an entry appears once, with the real count", () => {
    const venues: VenueEntry[] = [{ name: "Grand Vista Cinema" }];
    const infos = buildVenueInfos(venues, [viewing({ venue: "Grand Vista Cinema" })]);

    expect(infos).toHaveLength(1);
    expect(infos[0]).toMatchObject({ venue: "Grand Vista Cinema", count: 1 });
  });

  test("a picklist venue nobody has used yet is listed with a count of zero", () => {
    expect(buildVenueInfos([{ name: "Kriterion" }], [])).toMatchObject([
      { venue: "Kriterion", count: 0 },
    ]);
  });

  test("a viewing with no venue adds nothing", () => {
    expect(buildVenueInfos([], [viewing({})])).toEqual([]);
  });

  test("takes city, country and coordinates from the picklist entry", () => {
    const venues: VenueEntry[] = [
      { name: "Odeon", city: "London", country: "UK", geo: { lat: 51.5, lon: -0.1 } },
    ];

    expect(buildVenueInfos(venues, [])[0]).toEqual({
      venue: "Odeon",
      count: 0,
      city: "London",
      country: "UK",
      lat: 51.5,
      lon: -0.1,
    });
  });

  test("fills what the entry lacks from the first viewing that has it, never overwriting", () => {
    const venues: VenueEntry[] = [{ name: "Odeon", city: "London" }];
    const infos = buildVenueInfos(venues, [
      viewing({ uid: "a", venue: "Odeon", city: "Leeds", country: "UK" }),
      viewing({ uid: "b", venue: "Odeon", country: "France", geo: { lat: 1, lon: 2 } }),
      viewing({ uid: "c", venue: "Odeon", geo: { lat: 9, lon: 9 } }),
    ]);

    expect(infos[0]).toEqual({
      venue: "Odeon",
      count: 3,
      city: "London",
      country: "UK",
      lat: 1,
      lon: 2,
    });
  });

  test("orders by count, most first, then by name", () => {
    const infos = buildVenueInfos(
      [{ name: "Zeta" }, { name: "Alpha" }],
      [viewing({ venue: "Mid" }), viewing({ venue: "Mid" }), viewing({ venue: "Zeta" })],
    );

    expect(infos.map((i) => i.venue)).toEqual(["Mid", "Zeta", "Alpha"]);
  });
});

describe("groupByLocation", () => {
  const info = (venue: string, city?: string, country?: string) => ({
    venue,
    count: 1,
    city,
    country,
  });

  test("groups by country, then city, each sorted by name", () => {
    const { countries } = groupByLocation([
      info("a", "Paris", "France"),
      info("b", "Amsterdam", "Netherlands"),
      info("c", "Lyon", "France"),
      info("d", "Amsterdam", "Netherlands"),
    ]);

    expect(countries.map((c) => c.country)).toEqual(["France", "Netherlands"]);
    expect(countries[0]?.cities.map((c) => c.city)).toEqual(["Lyon", "Paris"]);
    expect(countries[1]?.cities[0]?.venues.map((v) => v.venue)).toEqual(["b", "d"]);
  });

  test("a venue with only a city or only a country is ungrouped, not guessed at", () => {
    const { countries, ungrouped } = groupByLocation([
      info("a", "Paris", undefined),
      info("b", undefined, "France"),
      info("c"),
      info("d", "Paris", "France"),
    ]);

    expect(ungrouped.map((v) => v.venue)).toEqual(["a", "b", "c"]);
    expect(countries).toHaveLength(1);
  });

  test("each city carries pins for its own venues that have coordinates", () => {
    const { countries } = groupByLocation([
      { ...info("Odeon", "London", "UK"), lat: 51, lon: 0 },
      info("Curzon", "London", "UK"),
    ]);

    expect(countries[0]?.cities[0]?.pins).toEqual([
      { lat: 51, lon: 0, label: "Odeon", href: "/venue?venue=Odeon" },
    ]);
  });
});

describe("pinsFor", () => {
  test("pins only the venues with both coordinates, linking each to its page", () => {
    const pins = pinsFor([
      { venue: "A B", count: 1, lat: 1, lon: 2 },
      { venue: "No coords", count: 1 },
      { venue: "Half", count: 1, lat: 1 },
    ]);

    expect(pins).toEqual([{ lat: 1, lon: 2, label: "A B", href: "/venue?venue=A%20B" }]);
  });

  test("keeps a venue at 0,0 rather than treating zero as missing", () => {
    expect(pinsFor([{ venue: "Null Island", count: 1, lat: 0, lon: 0 }])).toHaveLength(1);
  });
});
