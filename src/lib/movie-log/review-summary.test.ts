import { describe, expect, test } from "bun:test";
import { reviewSummary } from "./review-summary";

const counts = (overrides: Partial<Parameters<typeof reviewSummary>[0]> = {}) => ({
  newRows: 0,
  updates: 0,
  skipped: 0,
  failed: 0,
  ...overrides,
});

describe("reviewSummary", () => {
  test("counts the new rows and says they're ready to review", () => {
    expect(reviewSummary(counts({ newRows: 2 }))).toBe("2 new row(s) ready to review.");
  });

  test("adds updates to existing entries only when there are some", () => {
    expect(reviewSummary(counts({ newRows: 1, updates: 3 }))).toBe(
      "1 new row(s), 3 existing entry update(s) ready to review.",
    );
  });

  test("adds skipped rows, which aren't films, and failed rows, in that order", () => {
    expect(reviewSummary(counts({ newRows: 1, skipped: 2, failed: 1 }))).toBe(
      "1 new row(s), 2 skipped (not films), 1 failed to parse ready to review.",
    );
  });

  test("says there's nothing to import when only skipped rows are left", () => {
    expect(reviewSummary(counts({ skipped: 2 }))).toBe(
      "0 new row(s), 2 skipped (not films); nothing to import.",
    );
  });

  test("skipped rows alongside real rows are not 'nothing to import'", () => {
    expect(reviewSummary(counts({ newRows: 1, skipped: 2 }))).toBe(
      "1 new row(s), 2 skipped (not films) ready to review.",
    );
  });

  test("skipped rows alongside only updates are not 'nothing to import'", () => {
    expect(reviewSummary(counts({ updates: 1, skipped: 2 }))).toBe(
      "0 new row(s), 1 existing entry update(s), 2 skipped (not films) ready to review.",
    );
  });

  test("an empty file with nothing skipped just reads as zero rows ready", () => {
    expect(reviewSummary(counts())).toBe("0 new row(s) ready to review.");
  });

  test("failed rows alone don't count as skipped", () => {
    expect(reviewSummary(counts({ failed: 2 }))).toBe(
      "0 new row(s), 2 failed to parse ready to review.",
    );
  });
});
