import { describe, expect, test } from "bun:test";
import { CaldavRequestFailedError } from "../caldav/errors";
import type { LoggedViewing } from "../caldav/types";
import { type GeoCandidate, GeocoderUnavailableError } from "../geo/nominatim";
import { applyMaps, proposeMaps } from "./refresh-maps";

const VENUE = "City, Kleine-Gartmanplantsoen 15-19, 1017 RP Amsterdam, Netherlands";
const HIT: GeoCandidate = { label: "Kleine-Gartmanplantsoen 15, Amsterdam", lat: 52.36, lon: 4.88 };

function viewing(
  uid: string,
  venue: string | undefined,
  geo?: LoggedViewing["geo"],
): LoggedViewing {
  return {
    uid,
    title: `Film ${uid}`,
    start: "2026-01-01T19:00:00.000Z",
    end: "2026-01-01T21:00:00.000Z",
    medium: "cinema",
    venue,
    geo,
  };
}

const noSleep = async () => {};

describe("proposeMaps", () => {
  test("proposes the first geocoder hit for a venue whose viewings have no coordinates", async () => {
    const queries: string[] = [];
    const search = async (q: string) => {
      queries.push(q);
      return [HIT, { ...HIT, label: "other" }];
    };
    const result = await proposeMaps([viewing("a", VENUE), viewing("b", VENUE)], {
      search,
      sleep: noSleep,
    });
    expect(result).toEqual([{ venue: VENUE, count: 2, source: "lookup", match: HIT }]);
    expect(queries).toEqual([VENUE]);
  });

  test("retries without the leading venue name when the full string finds nothing", async () => {
    const queries: string[] = [];
    const search = async (q: string) => {
      queries.push(q);
      return q === VENUE ? [] : [HIT];
    };
    const [proposal] = await proposeMaps([viewing("a", VENUE)], { search, sleep: noSleep });
    expect(queries).toEqual([
      VENUE,
      "Kleine-Gartmanplantsoen 15-19, 1017 RP Amsterdam, Netherlands",
    ]);
    expect(proposal?.match).toEqual(HIT);
  });

  test("a venue with no comma is only searched once", async () => {
    const queries: string[] = [];
    const search = async (q: string) => {
      queries.push(q);
      return [];
    };
    const [proposal] = await proposeMaps([viewing("a", "Tuschinski")], { search, sleep: noSleep });
    expect(queries).toEqual(["Tuschinski"]);
    expect(proposal).toEqual({ venue: "Tuschinski", count: 1, source: "none" });
  });

  test("reuses coordinates another viewing at the venue already has, with no lookup", async () => {
    const search = async () => {
      throw new Error("must not search");
    };
    const known = { lat: 1, lon: 2 };
    const result = await proposeMaps([viewing("a", VENUE), viewing("b", VENUE, known)], {
      search,
      sleep: noSleep,
    });
    expect(result).toEqual([
      { venue: VENUE, count: 1, source: "viewing", match: { label: "", ...known } },
    ]);
  });

  test("leaves out venues where every viewing has coordinates, and viewings with no venue", async () => {
    const search = async () => [HIT];
    const result = await proposeMaps(
      [viewing("a", VENUE, { lat: 1, lon: 2 }), viewing("b", undefined), viewing("c", "")],
      { search, sleep: noSleep },
    );
    expect(result).toEqual([]);
  });

  test("waits between geocoder requests, never before the first", async () => {
    const sleeps: number[] = [];
    await proposeMaps([viewing("a", "One, x"), viewing("b", "Two, y")], {
      search: async () => [],
      sleep: async (ms) => {
        sleeps.push(ms);
      },
    });
    // One: 2 requests, Two: 2 requests -> 3 gaps of 1.1 s.
    expect(sleeps).toEqual([1100, 1100, 1100]);
  });

  // #873: Nominatim refusing or failing is not "no match", and carrying on would
  // keep sending requests it has already said no to.
  test("stops at the first failed lookup and marks the rest as not looked up", async () => {
    const queries: string[] = [];
    const search = async (q: string) => {
      queries.push(q);
      if (q.startsWith("Two")) throw new GeocoderUnavailableError(429);
      return [HIT];
    };
    const result = await proposeMaps(
      [
        viewing("a", "One"),
        viewing("a2", "One"),
        viewing("a3", "One"),
        viewing("b", "Two"),
        viewing("b2", "Two"),
        viewing("c", "Three"),
      ],
      { search, sleep: noSleep },
    );
    expect(result.map((p) => [p.venue, p.source])).toEqual([
      ["One", "lookup"],
      ["Two", "failed"],
      ["Three", "failed"],
    ]);
    // One, then the failing Two; Three is never asked.
    expect(queries).toEqual(["One", "Two"]);
  });

  test("an error that isn't the geocoder being unavailable is not swallowed", async () => {
    const search = async () => {
      throw new Error("a bug");
    };
    await expect(proposeMaps([viewing("a", "One")], { search, sleep: noSleep })).rejects.toThrow(
      "a bug",
    );
  });

  test("orders by number of viewings, most first, and reports progress", async () => {
    const progress: [number, number][] = [];
    const result = await proposeMaps(
      [viewing("a", "Few, x"), viewing("b", "Many, y"), viewing("c", "Many, y")],
      { search: async () => [], sleep: noSleep, onProgress: (d, t) => progress.push([d, t]) },
    );
    expect(result.map((p) => p.venue)).toEqual(["Many, y", "Few, x"]);
    expect(progress).toEqual([
      [1, 2],
      [2, 2],
    ]);
  });
});

describe("applyMaps", () => {
  test("writes the coordinates onto each viewing at the venue that lacks them, keeping every other field", async () => {
    const written: { uid: string; geo: unknown; title: unknown }[] = [];
    const update = async (uid: string, v: Record<string, unknown>) => {
      written.push({ uid, geo: v.geo, title: v.title });
      expect("uid" in v).toBe(false);
    };
    const keep = viewing("keep", VENUE, { lat: 9, lon: 9 });
    const result = await applyMaps(
      [viewing("a", VENUE), viewing("b", VENUE), keep, viewing("c", "Elsewhere")],
      [{ venue: VENUE, geo: { lat: 1, lon: 2 } }],
      { update, sleep: noSleep },
    );
    expect(result).toEqual({ updated: 2, failed: 0 });
    expect(written).toEqual([
      { uid: "a", geo: { lat: 1, lon: 2 }, title: "Film a" },
      { uid: "b", geo: { lat: 1, lon: 2 }, title: "Film b" },
    ]);
  });

  test("counts a failed write and carries on with the rest", async () => {
    const update = async (uid: string) => {
      if (uid === "a") throw new Error("nope");
    };
    const progress: [number, number][] = [];
    const result = await applyMaps(
      [viewing("a", VENUE), viewing("b", VENUE)],
      [{ venue: VENUE, geo: { lat: 1, lon: 2 } }],
      { update, sleep: noSleep, onProgress: (d, t) => progress.push([d, t]) },
    );
    expect(result).toEqual({ updated: 1, failed: 1 });
    expect(progress).toEqual([
      [1, 2],
      [2, 2],
    ]);
  });

  test("waits out a busy server instead of counting the write as failed", async () => {
    let calls = 0;
    const update = async () => {
      if (++calls === 1) throw new CaldavRequestFailedError("locked", 423);
    };
    const sleeps: number[] = [];
    const result = await applyMaps(
      [viewing("a", VENUE)],
      [{ venue: VENUE, geo: { lat: 1, lon: 2 } }],
      { update, sleep: async (ms) => void sleeps.push(ms) },
    );
    expect(result).toEqual({ updated: 1, failed: 0 });
    expect(sleeps).toHaveLength(1);
  });
});
