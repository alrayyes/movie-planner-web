import { describe, expect, test } from "bun:test";
import type { LoggedViewing } from "../caldav/types";
import { ATTRIBUTE_KINDS, ATTRIBUTES, attributeHref, attributeValues } from "./attributes";

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

describe("attributeValues", () => {
  test("splits a comma-separated field into individual values", () => {
    const v = viewing({ movieCountry: "United Kingdom, France" });
    expect(attributeValues(v, "movieCountry")).toEqual(["United Kingdom", "France"]);
  });

  test("a single value with no comma returns one value", () => {
    const v = viewing({ director: "Denis Villeneuve" });
    expect(attributeValues(v, "director")).toEqual(["Denis Villeneuve"]);
  });

  test("a missing field returns an empty list", () => {
    const v = viewing({});
    expect(attributeValues(v, "actor")).toEqual([]);
  });

  test("reads actors under the actor kind, and genre under the genre kind", () => {
    const v = viewing({ actors: "Timothée Chalamet, Zendaya", genre: "Action, Drama" });
    expect(attributeValues(v, "actor")).toEqual(["Timothée Chalamet", "Zendaya"]);
    expect(attributeValues(v, "genre")).toEqual(["Action", "Drama"]);
  });

  test("reads movieLanguage under the movieLanguage kind", () => {
    const v = viewing({ movieLanguage: "English, French" });
    expect(attributeValues(v, "movieLanguage")).toEqual(["English", "French"]);
  });

  // #535: rated is single-valued (never comma-separated), but
  // splitMultiValue already returns a comma-free string as a
  // single-element array, so this needed no new logic of its own.
  test("reads rated under the rated kind, as a single value", () => {
    const v = viewing({ rated: "PG-13" });
    expect(attributeValues(v, "rated")).toEqual(["PG-13"]);
  });

  test("reads keywords under the keyword kind, comma-split", () => {
    const v = viewing({ keywords: "desert, prophecy, revenge" });
    expect(attributeValues(v, "keyword")).toEqual(["desert", "prophecy", "revenge"]);
  });

  // #535: releasedYear/releasedMonth are computed from `released` via
  // parseReleasedDate, not read off a raw field.
  test("extracts the released year and month from the released field", () => {
    const v = viewing({ released: "22 Oct 2021" });
    expect(attributeValues(v, "releasedYear")).toEqual(["2021"]);
    expect(attributeValues(v, "releasedMonth")).toEqual(["2021-10"]);
  });

  test("a missing or unparsable released field returns an empty list for both", () => {
    expect(attributeValues(viewing({}), "releasedYear")).toEqual([]);
    expect(attributeValues(viewing({}), "releasedMonth")).toEqual([]);
    expect(attributeValues(viewing({ released: "Coming soon" }), "releasedYear")).toEqual([]);
    expect(attributeValues(viewing({ released: "Coming soon" }), "releasedMonth")).toEqual([]);
  });
});

describe("attributeHref", () => {
  test("links to the detail page with the value under the same param name the overview filter uses", () => {
    expect(attributeHref("director", "Denis Villeneuve")).toBe(
      "/director?director=Denis%20Villeneuve",
    );
    expect(attributeHref("actor", "Zendaya")).toBe("/actor?actor=Zendaya");
    expect(attributeHref("genre", "Action")).toBe("/genre?genre=Action");
    expect(attributeHref("movieCountry", "United Kingdom")).toBe(
      "/movie-country?movieCountry=United%20Kingdom",
    );
    expect(attributeHref("movieLanguage", "English")).toBe("/movie-language?movieLanguage=English");
  });

  test("encodes special characters in the value", () => {
    expect(attributeHref("genre", "Action & Adventure")).toBe(
      "/genre?genre=Action%20%26%20Adventure",
    );
  });

  // #535: rated's listing path ("/rated") and detail path ("/rating")
  // deliberately differ in word form, unlike the other eight kinds
  // (director/directors, keyword/keywords, …) — see attributes.ts's own
  // comment on the `rated` config entry.
  test("rated's detail path differs from its listing path", () => {
    expect(attributeHref("rated", "PG-13")).toBe("/rating?rated=PG-13");
  });

  test("links released year/month to their own dedicated pages", () => {
    expect(attributeHref("releasedYear", "2021")).toBe("/released-year?releasedYear=2021");
    expect(attributeHref("releasedMonth", "2021-10")).toBe("/released-month?releasedMonth=2021-10");
  });
});

describe("ATTRIBUTES", () => {
  test("every kind's own config key matches its own kind", () => {
    for (const kind of ATTRIBUTE_KINDS) {
      expect(ATTRIBUTES[kind].kind).toBe(kind);
    }
  });

  test("every listing and detail path is unique across all nine attributes", () => {
    const paths = ATTRIBUTE_KINDS.flatMap((kind) => [
      ATTRIBUTES[kind].listingPath,
      ATTRIBUTES[kind].detailPath,
    ]);
    expect(new Set(paths).size).toBe(paths.length);
  });

  // #535: every kind sets exactly one of field/extract — never both,
  // never neither — so attributeValues always has exactly one way to
  // find a kind's values.
  test("every kind sets exactly one of field or extract", () => {
    for (const kind of ATTRIBUTE_KINDS) {
      const config = ATTRIBUTES[kind];
      expect(Boolean(config.field) !== Boolean(config.extract)).toBe(true);
    }
  });
});
