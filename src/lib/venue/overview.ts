import type { LoggedViewing, VenueEntry } from "../caldav/types";
import { venueHref } from "./display";

// #914: the Venues page's own logic, lifted out of VenuesOverview.svelte so it
// is tested in milliseconds instead of through a browser.

export interface VenueInfo {
  venue: string;
  count: number;
  city?: string;
  country?: string;
  lat?: number;
  lon?: number;
}

export interface VenuePin {
  lat: number;
  lon: number;
  label: string;
  href: string;
}

export interface CityGroup {
  city: string;
  venues: VenueInfo[];
  pins: VenuePin[];
}

export interface CountryGroup {
  country: string;
  cities: CityGroup[];
}

// #99/#116/#452: every venue on the picklist (so one with zero viewings still
// shows) plus every venue seen on a viewing (a CLI-logged one is never on the
// picklist), each with its count. A venue's city, country and coordinates come
// from its picklist entry, then from whichever of its viewings carries them
// first; a field missing everywhere is left off ("omit, don't guess").
export function buildVenueInfos(venues: VenueEntry[], viewings: LoggedViewing[]): VenueInfo[] {
  const infoByVenue = new Map<string, VenueInfo>(
    venues.map((entry) => [
      entry.name,
      {
        venue: entry.name,
        count: 0,
        city: entry.city,
        country: entry.country,
        lat: entry.geo?.lat,
        lon: entry.geo?.lon,
      },
    ]),
  );
  for (const viewing of viewings) {
    if (!viewing.venue) continue;
    const info = infoByVenue.get(viewing.venue) ?? { venue: viewing.venue, count: 0 };
    info.count += 1;
    if (viewing.geo && info.lat === undefined) {
      info.lat = viewing.geo.lat;
      info.lon = viewing.geo.lon;
    }
    if (viewing.city && info.city === undefined) info.city = viewing.city;
    if (viewing.country && info.country === undefined) info.country = viewing.country;
    infoByVenue.set(viewing.venue, info);
  }
  return [...infoByVenue.values()].sort(
    (a, b) => b.count - a.count || a.venue.localeCompare(b.venue),
  );
}

// #277: one pin per venue with known coordinates.
export function pinsFor(list: VenueInfo[]): VenuePin[] {
  return list
    .filter(
      (v): v is VenueInfo & { lat: number; lon: number } =>
        v.lat !== undefined && v.lon !== undefined,
    )
    .map((v) => ({ lat: v.lat, lon: v.lon, label: v.venue, href: venueHref(v.venue) }));
}

// #267: only a venue with BOTH city and country groups at all. The CLI's own
// chain table sets both together or neither, so a venue with just one isn't a
// real shape to expect; it stays ungrouped rather than guessing an axis.
export function groupByLocation(infos: VenueInfo[]): {
  countries: CountryGroup[];
  ungrouped: VenueInfo[];
} {
  const byCountry = new Map<string, Map<string, VenueInfo[]>>();
  const ungrouped: VenueInfo[] = [];
  for (const info of infos) {
    if (!info.city || !info.country) {
      ungrouped.push(info);
      continue;
    }
    let byCity = byCountry.get(info.country);
    if (!byCity) {
      byCity = new Map();
      byCountry.set(info.country, byCity);
    }
    const list = byCity.get(info.city) ?? [];
    list.push(info);
    byCity.set(info.city, list);
  }
  const countries = [...byCountry.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([country, byCity]) => ({
      country,
      cities: [...byCity.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([city, cityVenues]) => ({
          city,
          venues: cityVenues,
          pins: pinsFor(cityVenues),
        })),
    }));
  return { countries, ungrouped };
}
