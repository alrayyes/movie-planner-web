<script lang="ts">
import { getPicklists, listViewings } from "../lib/caldav/client";
import type { CaldavConfig } from "../lib/caldav/types";
import { getCredentialsStore } from "../lib/credentials/store";
import { importCheckRange } from "../lib/movie-log/run-import";
import { reloadOnBfcacheRestore } from "../lib/ui/bfcache";
// biome-ignore lint/correctness/noUnusedImports: used in the template below, which Biome does not parse for .svelte files
import { STATUS_TEXT, TABLE, TABLE_WRAP, TD, TH, TR_BODY } from "../lib/ui/classes";
import { venueHref } from "../lib/venue/display";
// biome-ignore lint/correctness/noUnusedImports: used in the template below, which Biome does not parse for .svelte files
import ErrorToast from "./ErrorToast.svelte";
// biome-ignore lint/correctness/noUnusedImports: used in the template below, which Biome does not parse for .svelte files
import VenueMap from "./VenueMap.svelte";

// #99: every venue the visitor has ever logged a viewing at, or added
// to their picklist, each with a count of logged viewings there — a
// plain list built from data already available: the union of
// location-management's own picklist (so a venue with zero viewings
// still shows, #99's own scenario) and a calendar query.
// #277: a map above the table, one pin per venue with known
// coordinates — deferred from #99 (this app had no location data
// yet), added once #8/#203 shipped venue geo.
// #267: grouped by country then city, each city group with its own
// map above its own table — a venue missing either (no viewing has a
// city/country match from the CLI's hardcoded chain table, or the
// venue was only ever typed in here free-form) falls into a single
// "Other locations" section instead, same flat single-table shape
// this page had before grouping existed.
//
// #116: the picklist alone isn't enough — it's this app's own
// autocomplete suggestion list, populated only when a visitor types a
// new venue into this app's log form. A CLI-logged entry's venue was
// never typed in here, so it's never in the picklist even though it's
// real LOCATION text on the calendar entry — counting only picklist
// hits silently dropped every such venue.
//
// #123/#446: always the same wide range bulk-import's own duplicate
// check already uses (importCheckRange's 15-years-back window) — the
// visitor's whole history. There's no filter UI to narrow it anymore,
// and no other date range in the app (a `from`/`to` query param,
// say) narrows it either.
// biome-ignore lint/correctness/noUnusedVariables: used in the template below, which Biome does not parse for .svelte files
let status = $state("Loading…");
// #442: a genuine load failure gets the distinct error-toast treatment
// instead of blending into status's own quiet line.
// biome-ignore lint/correctness/noUnusedVariables: used in the template below, which Biome does not parse for .svelte files
let loadError = $state("");

interface VenueInfo {
	venue: string;
	count: number;
	city?: string;
	country?: string;
	lat?: number;
	lon?: number;
}

// #277/#267: a venue's own geo/city/country come from whichever of its
// viewings happened to carry them first — every viewing at the same
// venue shares the same location data, so which one doesn't matter.
// A field missing from every viewing at that venue is simply left off,
// same "omit, don't guess" rule the other maps already follow.
let venueInfos = $state<VenueInfo[]>([]);
// #146: the exact range that produced the counts currently on screen.
// A venue link needs to carry this so the overview it lands on shows
// the same viewings the count was drawn from, rather than falling back
// to its own much narrower default window. #446: always the wide
// whole-history default now, never visitor-adjustable.
let loadedRange = $state<{ from: string; to: string } | null>(null);

function toDateInputValue(iso: string): string {
	const d = new Date(iso);
	const pad = (n: number) => String(n).padStart(2, "0");
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// #372: same date-range-carrying pattern as venueHref (imported from
// ../lib/venue/display — #529 shares it with MovieDetails.svelte's own
// venue link, so both go to the same dedicated page) — a city
// heading links to the overview filtered to every viewing at a venue in
// that city, not just the one venue venueHref covers. #437: the
// matching country heading lost its own link when the overview's
// standalone Country filter was removed outright — the country grouping
// itself stays (still a useful way to organize venues), just as plain
// text now, nothing left to link it to.
// biome-ignore lint/correctness/noUnusedVariables: used in the template below, which Biome does not parse for .svelte files
function cityHref(city: string): string {
	const range = loadedRange
		? `&from=${toDateInputValue(loadedRange.from)}&to=${toDateInputValue(loadedRange.to)}`
		: "";
	return `/?city=${encodeURIComponent(city)}${range}`;
}

interface CityGroup {
	city: string;
	venues: VenueInfo[];
	pins: { lat: number; lon: number; label: string; href: string }[];
}

// #277: shared by every rendered table (the flat ungrouped view, "Other
// locations", and each city group below) — a venue's own row still
// gets a pin here even without city/country grouping, same as this
// page's map showed before #267.
function pinsFor(list: VenueInfo[]): { lat: number; lon: number; label: string; href: string }[] {
	return list
		.filter(
			(v): v is VenueInfo & { lat: number; lon: number } =>
				v.lat !== undefined && v.lon !== undefined,
		)
		.map((v) => ({ lat: v.lat, lon: v.lon, label: v.venue, href: venueHref(v.venue) }));
}

interface CountryGroup {
	country: string;
	cities: CityGroup[];
}

// #267: only a venue with BOTH city and country groups at all — the
// CLI's own hardcoded chain table always sets both together or
// neither (docs/calendar-schema.md), so a venue with just one of the
// two isn't a real shape to expect; treating it as ungrouped rather
// than guessing which axis it belongs under is the same "omit, don't
// guess" rule city/country themselves already follow.
// biome-ignore lint/correctness/noUnusedVariables: used in the template below, which Biome does not parse for .svelte files
const countryGroups = $derived.by((): CountryGroup[] => {
	const byCountry = new Map<string, Map<string, VenueInfo[]>>();
	for (const info of venueInfos) {
		if (!info.city || !info.country) continue;
		let byCity = byCountry.get(info.country);
		if (!byCity) {
			byCity = new Map();
			byCountry.set(info.country, byCity);
		}
		const list = byCity.get(info.city) ?? [];
		list.push(info);
		byCity.set(info.city, list);
	}
	return [...byCountry.entries()]
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
});

// biome-ignore lint/correctness/noUnusedVariables: used in the template below, which Biome does not parse for .svelte files
const ungroupedVenues = $derived(venueInfos.filter((v) => !v.city || !v.country));

// Aborts a still-in-flight load when a newer one starts (a mount-time
// load overlapping a bfcache-restore reload) — same reasoning as
// CalendarOverview's own reloadController, see its comment there.
let loadController: AbortController | undefined;

async function load() {
	loadController?.abort();
	const controller = new AbortController();
	loadController = controller;
	loadError = "";
	const credentials = await getCredentialsStore().get();
	if (!credentials) {
		status = "Connect first to see your venues.";
		return;
	}
	const config: CaldavConfig = {
		baseUrl: credentials.caldavUrl,
		username: credentials.caldavUsername,
		password: credentials.caldavPassword,
	};
	try {
		const range = importCheckRange();
		loadedRange = range;
		const [{ venues }, viewings] = await Promise.all([
			getPicklists(config),
			listViewings(config, range, { signal: controller.signal }),
		]);
		// #452: a picklist entry now carries its own city/country/geo
		// directly — seeded here so a venue with zero viewings (still
		// worth showing, #99's own scenario) can be grouped/pinned from
		// its own structured data alone, same as one only known from a
		// viewing already was.
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
		venueInfos = [...infoByVenue.values()].sort(
			(a, b) => b.count - a.count || a.venue.localeCompare(b.venue),
		);
		status = `${venueInfos.length} venue${venueInfos.length === 1 ? "" : "s"}.`;
	} catch (error) {
		// Superseded by a newer load — the newer call's own catch/success
		// block is what should actually update status now, not this one.
		if (error instanceof DOMException && error.name === "AbortError") return;
		status = "";
		loadError = error instanceof Error ? error.message : "Failed to load venues.";
	}
}

load();
// #223: see CalendarOverview.svelte's own reloadOnBfcacheRestore call.
reloadOnBfcacheRestore(() => void load());
</script>

<div class="flex flex-col gap-4">
  <p class={STATUS_TEXT} role="status">{status}</p>
  {#if loadError}
    <ErrorToast message={loadError} onDismiss={() => (loadError = "")} />
  {/if}

  {#snippet venueTable(list: VenueInfo[])}
    <div class={TABLE_WRAP}>
      <table class={TABLE}>
        <thead class="bg-slate-50 dark:bg-slate-900/40">
          <tr>
            <th class={TH} scope="col">Venue</th>
            <th class={TH} scope="col">Viewings</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-200 dark:divide-slate-700">
          {#each list as { venue, count } (venue)}
            <tr class={TR_BODY}>
              <td class={TD}>
                <!-- #131/#146: the overview's own venue filter reads
                the `venue` query param on load, and its From/To fields
                read `from`/`to` the same way — see
                CalendarOverview.svelte's own venueValue/fromValue/
                toValue init. Without carrying the range, the link would
                land on the overview's own much narrower default window
                instead of the one that produced this count. -->
                <a href={venueHref(venue)} class="text-indigo-600 hover:underline dark:text-indigo-400">
                  {venue}
                </a>
              </td>
              <td class={TD}>{count}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/snippet}

  {#if countryGroups.length === 0}
    <!-- #267: nobody's venues have a known city/country yet (the CLI
    hasn't backfilled X-CITY/X-COUNTRY onto them, or none match its
    hardcoded chain table) — the same flat, ungrouped view this page
    always showed, rather than a lone "Other locations" heading with
    nothing else to contrast it against. -->
    {#if venueInfos.length > 0}
      {#if pinsFor(venueInfos).length > 0}
        <VenueMap pins={pinsFor(venueInfos)} />
      {/if}
      {@render venueTable(venueInfos)}
    {/if}
  {:else}
    <div class="flex flex-col gap-8">
      {#each countryGroups as group (group.country)}
        <section class="flex flex-col gap-6">
          <h2 class="text-lg font-semibold text-slate-900 dark:text-slate-100">
            {group.country}
          </h2>
          {#each group.cities as cityGroup (cityGroup.city)}
            <div class="flex flex-col gap-3">
              <h3 class="text-base font-medium text-slate-700 dark:text-slate-300">
                <a href={cityHref(cityGroup.city)} class="hover:underline">{cityGroup.city}</a>
              </h3>
              {#if cityGroup.pins.length > 0}
                <VenueMap pins={cityGroup.pins} />
              {/if}
              {@render venueTable(cityGroup.venues)}
            </div>
          {/each}
        </section>
      {/each}

      {#if ungroupedVenues.length > 0}
        <section class="flex flex-col gap-3">
          <h2 class="text-lg font-semibold text-slate-900 dark:text-slate-100">
            Other locations
          </h2>
          {#if pinsFor(ungroupedVenues).length > 0}
            <VenueMap pins={pinsFor(ungroupedVenues)} />
          {/if}
          {@render venueTable(ungroupedVenues)}
        </section>
      {/if}
    </div>
  {/if}
</div>
