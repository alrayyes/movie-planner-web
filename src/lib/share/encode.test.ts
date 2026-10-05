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

// #749: Stryker's gate found these edges unpinned.
describe("toSharedViewing, each optional field", () => {
  const base: LoggedViewing = {
    uid: "u",
    title: "T",
    start: "2026-01-01T19:00:00.000Z",
    end: "2026-01-01T21:00:00.000Z",
    medium: "cinema",
  };
  const optional: [keyof LoggedViewing, LoggedViewing[keyof LoggedViewing]][] = [
    ["year", "2021"],
    ["venue", "Grand Vista Cinema"],
    ["geo", { lat: 52.1, lon: 4.2 }],
    ["posterUrl", "https://example.com/p.jpg"],
    ["imdbId", "tt1160419"],
    ["letterboxdUrl", "https://letterboxd.com/film/dune/"],
  ];

  for (const [field, value] of optional) {
    test(`${field} is carried when set`, () => {
      const shared = toSharedViewing({ ...base, [field]: value });
      expect(shared).toStrictEqual({ ...base, [field]: value });
    });

    test(`${field} leaves no key behind when it's missing`, () => {
      expect(toSharedViewing(base)).toStrictEqual(base);
      expect(field in toSharedViewing(base)).toBe(false);
    });
  }

  test("an empty string is as good as missing", () => {
    const shared = toSharedViewing({ ...base, year: "", venue: "", imdbId: "" });
    expect(shared).toStrictEqual(base);
  });
});

describe("encodeSharedState, URL safety and padding", () => {
  // Gzip output comes in every length, so across enough different payloads the
  // base64 holds each character that has to be swapped (+ and /) and each
  // amount of padding (none, one = and two =). One payload would only ever show one.
  const states: SharedState[] = Array.from({ length: 60 }, (_, i) => ({
    sharedAt: "2026-01-02T00:00:00.000Z",
    viewings: [
      toSharedViewing({
        uid: `uid-${i}`,
        title: `Viewing number ${i} ${"é".repeat(i % 7)}${"?>".repeat(i % 5)}`,
        start: "2026-01-01T19:00:00.000Z",
        end: "2026-01-01T21:00:00.000Z",
        medium: "cinema",
        venue: "x".repeat(i),
      }),
    ],
  }));

  test("every link is plain base64url, with no +, / or = left in it", async () => {
    for (const state of states) {
      const encoded = await encodeSharedState(state);
      expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/);
    }
  });

  test("every link decodes back to what went in, whatever its length", async () => {
    const lengths = new Set<number>();
    for (const state of states) {
      const encoded = await encodeSharedState(state);
      lengths.add(encoded.length % 4);
      expect(await decodeSharedState(encoded)).toEqual(state);
    }
    // All three unpadded lengths (a multiple of four needs no padding at all)
    // were really exercised.
    expect([...lengths].sort()).toEqual([0, 2, 3]);
  });

  test("the swapped characters are really in play", async () => {
    // Re-derive the standard base64 to prove the corpus above contains '+' and '/'.
    const seen = new Set<string>();
    for (const state of states) {
      const encoded = await encodeSharedState(state);
      if (encoded.includes("-")) seen.add("+");
      if (encoded.includes("_")) seen.add("/");
    }
    expect([...seen].sort()).toEqual(["+", "/"]);
  });
});

describe("decodeSharedState, what counts as a shared link", () => {
  const encode = (value: unknown) => encodeSharedState(value as SharedState);
  const NOT_A_LINK = "not a recognised shared link";

  test("accepts an empty list of viewings", async () => {
    const state = { sharedAt: "2026-01-02T00:00:00.000Z", viewings: [] };
    expect(await decodeSharedState(await encode(state))).toEqual(state);
  });

  const invalid: [string, unknown][] = [
    ["a string", "just text"],
    ["a number", 42],
    ["null", null],
    ["an array", []],
    ["an object with no viewings", { sharedAt: "2026-01-02T00:00:00.000Z" }],
    ["viewings that aren't a list", { sharedAt: "2026-01-02T00:00:00.000Z", viewings: "none" }],
    ["an object with no sharedAt", { viewings: [] }],
    ["a sharedAt that isn't text", { sharedAt: 5, viewings: [] }],
  ];

  for (const [name, value] of invalid) {
    test(`rejects ${name}`, async () => {
      await expect(decodeSharedState(await encode(value))).rejects.toThrow(NOT_A_LINK);
    });
  }
});
