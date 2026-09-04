import { describe, expect, test } from "bun:test";
import { isLikelyDuplicateTitle, normalizeTitle } from "./duplicates";

describe("normalizeTitle", () => {
  test("lowercases, strips punctuation and collapses whitespace", () => {
    expect(normalizeTitle("Dune: Part Two!")).toBe("dune part two");
  });

  test("strips a trailing ' - Movies' noise suffix", () => {
    expect(normalizeTitle("Dune Part Two - Movies")).toBe("dune part two");
  });
});

describe("isLikelyDuplicateTitle", () => {
  test("matches titles differing only in punctuation", () => {
    expect(isLikelyDuplicateTitle("Dune: Part Two", "Dune Part Two")).toBe(true);
  });

  test("matches titles with reordered words", () => {
    expect(isLikelyDuplicateTitle("Part Two: Dune", "Dune: Part Two")).toBe(true);
  });

  test("doesn't match clearly different titles", () => {
    expect(isLikelyDuplicateTitle("Dune", "Paddington")).toBe(false);
  });
});
