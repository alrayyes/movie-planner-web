import { afterEach, describe, expect, setSystemTime, test } from "bun:test";
import { importCheckRange } from "./range";

afterEach(() => setSystemTime());

describe("importCheckRange", () => {
  test("runs from 15 years back to one year ahead, keeping the month and day", () => {
    setSystemTime(new Date("2026-06-15T12:00:00.000Z"));

    expect(importCheckRange()).toEqual({
      from: "2011-06-15T12:00:00.000Z",
      to: "2027-06-15T12:00:00.000Z",
    });
  });
});
