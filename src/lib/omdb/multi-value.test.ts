import { describe, expect, test } from "bun:test";
import { splitMultiValue } from "./multi-value";

// #163: actors and genre are stored as one OMDb-sourced comma-separated
// string ("Timothée Chalamet, Zendaya", "Action, Adventure, Drama") —
// this is the one place that gets split into individual values, shared
// by the details page's clickable chips and the overview's filter, so
// both agree on exactly the same values for exactly the same input.
describe("splitMultiValue", () => {
  test("splits on a comma and trims each value", () => {
    expect(splitMultiValue("Action, Adventure, Drama")).toEqual(["Action", "Adventure", "Drama"]);
  });

  test("handles a comma with no following space", () => {
    expect(splitMultiValue("Action,Adventure")).toEqual(["Action", "Adventure"]);
  });

  test("a single value with no comma returns one value", () => {
    expect(splitMultiValue("Drama")).toEqual(["Drama"]);
  });

  test("undefined returns an empty list", () => {
    expect(splitMultiValue(undefined)).toEqual([]);
  });

  test("an empty string returns an empty list", () => {
    expect(splitMultiValue("")).toEqual([]);
  });

  test("drops empty values from stray double commas", () => {
    expect(splitMultiValue("Action,, Drama")).toEqual(["Action", "Drama"]);
  });
});
