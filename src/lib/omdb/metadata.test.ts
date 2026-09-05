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

  test.each(["director", "actors", "genre", "year", "posterUrl"] as const)(
    "imdbId plus %s counts as matched",
    (field) => {
      expect(hasOmdbMetadata({ imdbId: "tt1160419", [field]: "some value" })).toBe(true);
    },
  );

  test("a full OMDb match counts as matched", () => {
    expect(
      hasOmdbMetadata({
        imdbId: "tt1160419",
        director: "Denis Villeneuve",
        posterUrl: "https://example.com/dune.jpg",
      }),
    ).toBe(true);
  });
});
