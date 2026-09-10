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
});

describe("ATTRIBUTES", () => {
  test("every kind's own config key matches its own kind", () => {
    for (const kind of ATTRIBUTE_KINDS) {
      expect(ATTRIBUTES[kind].kind).toBe(kind);
    }
  });

  test("every listing and detail path is unique across all five attributes", () => {
    const paths = ATTRIBUTE_KINDS.flatMap((kind) => [
      ATTRIBUTES[kind].listingPath,
      ATTRIBUTES[kind].detailPath,
    ]);
    expect(new Set(paths).size).toBe(paths.length);
  });
});
