// Address-search lookup for a venue with no known coordinates yet
// (movie-log/movie-editing, task 4/5) — OpenStreetMap's free Nominatim
// geocoder, no API key. Called only from those forms, never
// automatically: design.md's own "no live third-party network call
// just from viewing a page" stance.
export interface GeoCandidate {
  label: string;
  lat: number;
  lon: number;
}

interface NominatimResult {
  display_name?: string;
  lat?: string;
  lon?: string;
}

// Nominatim's usage policy (https://operations.osmfoundation.org/policies/nominatim/)
// asks for a descriptive User-Agent or Referer identifying the calling
// application. `User-Agent` is on the Fetch spec's forbidden-header
// list — a browser silently keeps its own UA string regardless of what
// a fetch() call's `headers` option asks for, so setting it here would
// be a no-op giving false confidence, not a real identifier. The
// browser's own default `Referer` (this app's own origin) is what
// actually satisfies the policy instead — real, sent automatically,
// nothing to configure. Confirmed live: Chrome and Firefox both drop a
// script-set User-Agent header outright rather than sending it.
const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";

// #873: Nominatim refusing a request (429 is its usage-policy limit), being down
// or unreachable is not "no such place". It throws, so a caller can say the
// lookup failed instead of reporting nothing found. A genuine empty result is
// still an empty list.
export class GeocoderUnavailableError extends Error {
  constructor(readonly status?: number) {
    super(status ? `The address lookup failed (HTTP ${status}).` : "The address lookup failed.");
    this.name = "GeocoderUnavailableError";
  }
}

export async function searchAddress(query: string): Promise<GeoCandidate[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const url = new URL(NOMINATIM_URL);
  url.searchParams.set("q", trimmed);
  url.searchParams.set("format", "json");
  url.searchParams.set("limit", "5");

  let response: Response;
  try {
    response = await fetch(url);
  } catch {
    throw new GeocoderUnavailableError();
  }
  if (!response.ok) throw new GeocoderUnavailableError(response.status);
  let data: NominatimResult[];
  try {
    data = (await response.json()) as NominatimResult[];
  } catch {
    throw new GeocoderUnavailableError();
  }
  if (!Array.isArray(data)) throw new GeocoderUnavailableError();
  return data
    .map((result) => ({
      label: result.display_name ?? "",
      lat: Number(result.lat),
      lon: Number(result.lon),
    }))
    .filter(
      (candidate) =>
        candidate.label && Number.isFinite(candidate.lat) && Number.isFinite(candidate.lon),
    );
}
