import { describe, expect, test } from "bun:test";
import type { OmdbCandidate } from "./client";
import { sortCandidates } from "./picker";

function candidate(title: string, year: string | undefined, imdbId: string): OmdbCandidate {
  return { title, year, imdbId, posterUrl: undefined };
}

// #628: default sort is newest-first; Title (A–Z) is the only other mode.
describe("sortCandidates", () => {
  test("sorts by year descending", () => {
    const candidates = [
      candidate("Resident Evil", "2002", "tt1"),
      candidate("Resident Evil", "2026", "tt2"),
      candidate("Resident Evil", "2012", "tt3"),
    ];

    const result = sortCandidates(candidates, "year");

    expect(result.map((c) => c.imdbId)).toEqual(["tt2", "tt3", "tt1"]);
  });

  test("sorts by title alphabetically", () => {
    const candidates = [
      candidate("Resident Evil: Retribution", undefined, "tt1"),
      candidate("Resident Evil", undefined, "tt2"),
      candidate("Resident Evil: Apocalypse", undefined, "tt3"),
    ];

    const result = sortCandidates(candidates, "title");

    expect(result.map((c) => c.imdbId)).toEqual(["tt2", "tt3", "tt1"]);
  });

  test("sorts a candidate with no year last, rather than throwing", () => {
    const candidates = [
      candidate("Resident Evil: Unknown Year", undefined, "tt1"),
      candidate("Resident Evil", "2026", "tt2"),
    ];

    const result = sortCandidates(candidates, "year");

    expect(result.map((c) => c.imdbId)).toEqual(["tt2", "tt1"]);
  });

  test("sorts a TV series' year range by its first year, not last", () => {
    const candidates = [
      candidate("Resident Evil (TV Series)", "2016–2019", "tt1"),
      candidate("Resident Evil", "2026", "tt2"),
      candidate("Resident Evil (Older Series)", "2010–", "tt3"),
    ];

    const result = sortCandidates(candidates, "year");

    expect(result.map((c) => c.imdbId)).toEqual(["tt2", "tt1", "tt3"]);
  });

  test("does not mutate the input array", () => {
    const candidates = [candidate("B", "2020", "tt1"), candidate("A", "2021", "tt2")];
    const original = [...candidates];

    sortCandidates(candidates, "title");

    expect(candidates).toEqual(original);
  });
});
