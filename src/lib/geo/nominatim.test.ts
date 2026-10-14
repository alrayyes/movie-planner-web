import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { GeocoderUnavailableError, searchAddress } from "./nominatim";

let originalFetch: typeof fetch;

beforeEach(() => {
  originalFetch = globalThis.fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("searchAddress", () => {
  test("returns candidates with a label and numeric coordinates on a match", async () => {
    globalThis.fetch = (async (url: URL) => {
      expect(url.toString()).toContain("nominatim.openstreetmap.org/search");
      expect(url.searchParams.get("q")).toBe("Tuschinski");
      expect(url.searchParams.get("format")).toBe("json");
      expect(url.searchParams.get("limit")).toBe("5");
      return new Response(
        JSON.stringify([
          {
            display_name: "Tuschinski, Reguliersbreestraat, Amsterdam, Netherlands",
            lat: "52.3665062",
            lon: "4.8947073",
          },
        ]),
        { status: 200 },
      );
    }) as unknown as typeof fetch;

    const result = await searchAddress("Tuschinski");

    expect(result).toEqual([
      {
        label: "Tuschinski, Reguliersbreestraat, Amsterdam, Netherlands",
        lat: 52.3665062,
        lon: 4.8947073,
      },
    ]);
  });

  test("returns an empty array when Nominatim finds nothing", async () => {
    globalThis.fetch = (async () =>
      new Response(JSON.stringify([]), { status: 200 })) as unknown as typeof fetch;

    expect(await searchAddress("a venue that doesn't exist anywhere")).toEqual([]);
  });

  // #873: a refusal or an outage is not "no such place", so the caller has to be
  // able to tell them apart.
  test.each([429, 500, 503])("throws GeocoderUnavailableError on an HTTP %d", async (status) => {
    globalThis.fetch = (async () => new Response("", { status })) as unknown as typeof fetch;

    const failure = await searchAddress("Tuschinski").catch((error) => error);

    expect(failure).toBeInstanceOf(GeocoderUnavailableError);
    expect(failure.status).toBe(status);
    expect(failure.name).toBe("GeocoderUnavailableError");
    expect(failure.message).toBe(`The address lookup failed (HTTP ${status}).`);
  });

  test("throws GeocoderUnavailableError on a network failure", async () => {
    globalThis.fetch = (async () => {
      throw new TypeError("network error");
    }) as unknown as typeof fetch;

    const failure = await searchAddress("Tuschinski").catch((error) => error);

    expect(failure).toBeInstanceOf(GeocoderUnavailableError);
    expect(failure.status).toBeUndefined();
    expect(failure.message).toBe("The address lookup failed.");
  });

  test("throws GeocoderUnavailableError when the body is not a list", async () => {
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ error: "x" }), { status: 200 })) as unknown as typeof fetch;

    expect(await searchAddress("Tuschinski").catch((error) => error)).toBeInstanceOf(
      GeocoderUnavailableError,
    );
  });

  test("returns an empty array for a blank query without calling out", async () => {
    let called = false;
    globalThis.fetch = (async () => {
      called = true;
      return new Response(JSON.stringify([]), { status: 200 });
    }) as unknown as typeof fetch;

    expect(await searchAddress("   ")).toEqual([]);
    expect(called).toBe(false);
  });

  test("drops a result missing a display name or non-numeric coordinates", async () => {
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify([
          { display_name: "", lat: "52.3665062", lon: "4.8947073" },
          { display_name: "Somewhere", lat: "not-a-number", lon: "4.8947073" },
          { display_name: "Elsewhere", lat: "5.0", lon: "5.0" },
        ]),
        { status: 200 },
      )) as unknown as typeof fetch;

    const result = await searchAddress("query");

    expect(result).toEqual([{ label: "Elsewhere", lat: 5.0, lon: 5.0 }]);
  });

  test("drops a result with no display name at all", async () => {
    globalThis.fetch = (async () =>
      new Response(JSON.stringify([{ lat: "1", lon: "2" }]), {
        status: 200,
      })) as unknown as typeof fetch;

    expect(await searchAddress("query")).toEqual([]);
  });
});
