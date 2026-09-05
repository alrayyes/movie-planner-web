import { describe, expect, test } from "bun:test";
import { hasOmdbMetadata } from "./metadata";

describe("hasOmdbMetadata", () => {
  // #113: a CLI-logged entry gets imdbId for free by parsing its own
  // DESCRIPTION text (caldav-client capability) — no OMDb call
  // involved, so it alone can't mean "already matched" any more.
  test("a bare imdbId, with nothing else OMDb-only set, doesn't count as matched", () => {
    expect(hasOmdbMetadata({ imdbId: "tt1160419" })).toBe(false);
  });

  // The movie-editing spec's own "Stale metadata refreshed" scenario:
  // a viewing with a stale director but no imdbId yet must still be
  // treated as unmatched, so a refresh corrects it.
  test.each(["director", "actors", "genre", "year", "posterUrl"] as const)(
    "%s alone, with no imdbId, doesn't count as matched",
    (field) => {
      expect(hasOmdbMetadata({ [field]: "some value" })).toBe(false);
    },
  );

  test("no fields at all doesn't count as matched", () => {
    expect(hasOmdbMetadata({})).toBe(false);
  });

  // #149: imdbId plus director/actors/genre/year alone used to count as
  // matched — but a title OMDb has no poster for (or one whose poster
  // was never fetched) could then never be refreshed to pick one up,
  // even though nothing had actually filled it in yet.
  test.each(["director", "actors", "genre", "year"] as const)(
    "imdbId plus %s, without a poster, doesn't count as matched",
    (field) => {
      expect(hasOmdbMetadata({ imdbId: "tt1160419", [field]: "some value" })).toBe(false);
    },
  );

  test("imdbId plus a poster counts as matched, even with nothing else set", () => {
    expect(
      hasOmdbMetadata({ imdbId: "tt1160419", posterUrl: "https://example.com/dune.jpg" }),
    ).toBe(true);
  });

  test("a full OMDb match counts as matched", () => {
    expect(
      hasOmdbMetadata({
        imdbId: "tt1160419",
        posterUrl: "https://example.com/dune.jpg",
      }),
    ).toBe(true);
  });
});
