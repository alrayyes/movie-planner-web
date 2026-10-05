import { describe, expect, test } from "bun:test";
import { token_sort_ratio } from "fuzzball";
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

// #749: what normalising a title does, one step at a time, and where the
// threshold sits exactly.
describe("normalizeTitle, each step", () => {
  test("lowercases and trims", () => {
    expect(normalizeTitle("  DUNE  ")).toBe("dune");
  });

  test("trims before it looks for the ' - Movies' suffix", () => {
    expect(normalizeTitle("Dune Part Two - Movies   ")).toBe("dune part two");
  });

  test("collapses a run of whitespace to a single space", () => {
    expect(normalizeTitle("Dune   Part \t Two")).toBe("dune part two");
  });

  test("trims the spaces that stripping punctuation leaves at the ends", () => {
    expect(normalizeTitle(", Dune ,")).toBe("dune");
  });
});

describe("isLikelyDuplicateTitle, at the threshold", () => {
  const a = "Dune Part Two";
  const b = "Dune Part Tw";
  const score = token_sort_ratio(normalizeTitle(a), normalizeTitle(b));

  test("a score exactly at the threshold counts as a duplicate", () => {
    expect(score).toBeGreaterThan(0);
    expect(isLikelyDuplicateTitle(a, b, score)).toBe(true);
  });

  test("a score just under the threshold does not", () => {
    expect(isLikelyDuplicateTitle(a, b, score + 1)).toBe(false);
  });
});
