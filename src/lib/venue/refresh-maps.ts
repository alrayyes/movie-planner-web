import { retryWhenBusy } from "../caldav/retry";
import type { LoggedViewing, NewViewing } from "../caldav/types";
import { type GeoCandidate, searchAddress } from "../geo/nominatim";

// #869: restores the coordinates a venue's viewings lost (an import from before
// #867, a venue typed in free-form). The maps plot a viewing's own GEO, not the
// venue picklist, so the result is written onto the viewings themselves.
//
// Nominatim's usage policy allows one request a second at most
// (https://operations.osmfoundation.org/policies/nominatim/), and it runs only
// when a visitor asks, never from just viewing a page.
const REQUEST_GAP_MS = 1100;

export interface MapProposal {
  venue: string;
  // Viewings at this venue that have no coordinates.
  count: number;
  // "viewing": another viewing at the venue already had them. "lookup": the
  // geocoder's first hit. "none": nothing found, nothing will be written.
  source: "viewing" | "lookup" | "none";
  match?: GeoCandidate;
}

export interface ProposeDeps {
  search?: (query: string) => Promise<GeoCandidate[]>;
  sleep?: (ms: number) => Promise<void>;
  onProgress?: (done: number, total: number) => void;
}

// Stryker disable next-line all: a real timer, injected away in every test.
const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export async function proposeMaps(
  viewings: readonly LoggedViewing[],
  { search = searchAddress, sleep = defaultSleep, onProgress }: ProposeDeps = {},
): Promise<MapProposal[]> {
  const byVenue = new Map<string, { missing: number; known?: { lat: number; lon: number } }>();
  for (const viewing of viewings) {
    if (!viewing.venue) continue;
    const entry = byVenue.get(viewing.venue) ?? { missing: 0 };
    if (viewing.geo) entry.known ??= viewing.geo;
    else entry.missing++;
    byVenue.set(viewing.venue, entry);
  }
  const todo = [...byVenue.entries()]
    .filter(([, entry]) => entry.missing > 0)
    .sort((a, b) => b[1].missing - a[1].missing || a[0].localeCompare(b[0]));

  const proposals: MapProposal[] = [];
  let requested = false;
  const lookup = async (query: string): Promise<GeoCandidate | undefined> => {
    if (requested) await sleep(REQUEST_GAP_MS);
    requested = true;
    // searchAddress fails soft, so a lookup that finds nothing is just empty.
    return (await search(query))[0];
  };

  for (const [venue, { missing, known }] of todo) {
    if (known) {
      proposals.push({ venue, count: missing, source: "viewing", match: { label: "", ...known } });
    } else {
      // A venue is "Name, street, postcode city, country". The geocoder knows
      // the address, rarely the cinema's name, so the second try drops it.
      const address = venue.includes(",") ? venue.slice(venue.indexOf(",") + 1).trim() : "";
      const match = (await lookup(venue)) ?? (address ? await lookup(address) : undefined);
      proposals.push(
        match
          ? { venue, count: missing, source: "lookup", match }
          : { venue, count: missing, source: "none" },
      );
    }
    onProgress?.(proposals.length, todo.length);
  }
  return proposals;
}

export interface ApplyDeps {
  update: (uid: string, viewing: NewViewing) => Promise<unknown>;
  sleep?: (ms: number) => Promise<void>;
  onProgress?: (done: number, total: number) => void;
}

// One write at a time, as the import does, so a small CalDAV server isn't
// flooded. A viewing that already has coordinates is never touched.
export async function applyMaps(
  viewings: readonly LoggedViewing[],
  approved: readonly { venue: string; geo: { lat: number; lon: number } }[],
  { update, sleep, onProgress }: ApplyDeps,
): Promise<{ updated: number; failed: number }> {
  const geoByVenue = new Map(approved.map(({ venue, geo }) => [venue, geo]));
  const targets = viewings.flatMap((viewing) => {
    const geo = viewing.venue ? geoByVenue.get(viewing.venue) : undefined;
    return geo && !viewing.geo ? [{ viewing, geo }] : [];
  });
  const outcome = { updated: 0, failed: 0 };
  let done = 0;
  for (const { viewing, geo } of targets) {
    const { uid, ...rest } = viewing;
    try {
      await retryWhenBusy(() => update(uid, { ...rest, geo }), { sleep });
      outcome.updated++;
    } catch {
      outcome.failed++;
    }
    onProgress?.(++done, targets.length);
  }
  return outcome;
}
