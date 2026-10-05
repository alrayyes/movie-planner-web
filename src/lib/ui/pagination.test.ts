import { describe, expect, test } from "bun:test";
import { computePageNumbers, PAGE_SIZE_OPTIONS } from "./pagination";

// #749: the page-size select and the windowed page numbers every results table shares.
describe("PAGE_SIZE_OPTIONS", () => {
  test("offers four fixed sizes, smallest first", () => {
    expect(PAGE_SIZE_OPTIONS).toEqual([10, 25, 50, 100]);
  });
});

describe("computePageNumbers", () => {
  test("one page is just page 1", () => {
    expect(computePageNumbers(0, 1)).toEqual([1]);
  });

  test("few pages are all listed when the window reaches both ends", () => {
    expect(computePageNumbers(2, 5)).toEqual([1, 2, 3, 4, 5]);
  });

  test("on the first of many pages the run stops two past it, then a gap, then the last", () => {
    expect(computePageNumbers(0, 20)).toEqual([1, 2, 3, "…", 20]);
  });

  test("in the middle there is a gap on both sides of the window", () => {
    expect(computePageNumbers(9, 20)).toEqual([1, "…", 8, 9, 10, 11, 12, "…", 20]);
  });

  test("on the last page the run reaches back two, with a gap after the first", () => {
    expect(computePageNumbers(19, 20)).toEqual([1, "…", 18, 19, 20]);
  });

  test("a window that touches the first page leaves no gap before it", () => {
    // current page 4 (index 3): window 2..6 starts right after page 1.
    expect(computePageNumbers(3, 20)).toEqual([1, 2, 3, 4, 5, 6, "…", 20]);
  });

  test("a window one page short of the first leaves a gap of exactly one hidden page", () => {
    // current page 5 (index 4): window 3..7, page 2 is the only one hidden.
    expect(computePageNumbers(4, 20)).toEqual([1, "…", 3, 4, 5, 6, 7, "…", 20]);
  });

  test("a window that touches the last page leaves no gap after it", () => {
    // current page 17 of 20: window 15..19 ends right before page 20.
    expect(computePageNumbers(16, 20)).toEqual([1, "…", 15, 16, 17, 18, 19, 20]);
  });

  test("a window one page short of the last leaves a gap before it", () => {
    // current page 16 of 20: window 14..18, page 19 is the only one hidden.
    expect(computePageNumbers(15, 20)).toEqual([1, "…", 14, 15, 16, 17, 18, "…", 20]);
  });

  test("no pages at all still starts with page 1", () => {
    expect(computePageNumbers(0, 0)).toEqual([1]);
  });
});
