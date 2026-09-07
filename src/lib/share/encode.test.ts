import { describe, expect, test } from "bun:test";
import type { LoggedViewing } from "../caldav/types";
import { decodeSharedState, encodeSharedState, type SharedState, toSharedViewing } from "./encode";

const VIEWING: LoggedViewing = {
  uid: "dune-uid",
  title: "Dune",
  start: "2026-01-01T19:00:00.000Z",
  end: "2026-01-01T21:30:00.000Z",
  medium: "cinema",
  venue: "Grand Vista Cinema",
  geo: { lat: 52.3665062, lon: 4.8947073 },
  posterUrl: "https://example.com/dune-poster.jpg",
  imdbId: "tt1160419",
  year: "2021",
  // Fields toSharedViewing must never carry over — nothing OMDb/CalDAV-
  // private about the shared link, but these aren't display fields the
  // overview row itself renders either, so they're excluded on principle.
  director: "Denis Villeneuve",
  ratingImdb: "8.0",
};

describe("toSharedViewing", () => {
  test("keeps only the overview row's own display fields", () => {
    const shared = toSharedViewing(VIEWING);
    expect(shared).toEqual({
      uid: "dune-uid",
      title: "Dune",
      start: "2026-01-01T19:00:00.000Z",
      end: "2026-01-01T21:30:00.000Z",
      medium: "cinema",
      venue: "Grand Vista Cinema",
      geo: { lat: 52.3665062, lon: 4.8947073 },
      posterUrl: "https://example.com/dune-poster.jpg",
      imdbId: "tt1160419",
      year: "2021",
    });
  });

  test("omits an optional field entirely rather than writing it empty", () => {
    const shared = toSharedViewing({
      uid: "u",
      title: "T",
      start: "2026-01-01T19:00:00.000Z",
      end: "2026-01-01T19:00:00.000Z",
      medium: "cinema",
    });
    expect("venue" in shared).toBe(false);
    expect("geo" in shared).toBe(false);
  });
});

describe("encodeSharedState / decodeSharedState", () => {
  test("round-trips a shared state through gzip + base64url", async () => {
    const state: SharedState = {
      sharedAt: "2026-01-02T00:00:00.000Z",
      viewings: [toSharedViewing(VIEWING)],
    };
    const encoded = await encodeSharedState(state);
    // Base64url only — no characters a URL query parameter would need to
    // percent-encode.
    expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/);
    const decoded = await decodeSharedState(encoded);
    expect(decoded).toEqual(state);
  });

  test("rejects a corrupted link rather than throwing something unexpected", async () => {
    const encoded = await encodeSharedState({ sharedAt: "2026-01-02T00:00:00.000Z", viewings: [] });
    // Drops trailing chars so it still base64url-decodes but the bytes
    // inside are no longer a valid gzip stream — decode has to fail
    // closed, not surface a raw DecompressionStream error a caller
    // doesn't expect the shape of.
    await expect(decodeSharedState(encoded.slice(0, -4))).rejects.toThrow();
  });
});
