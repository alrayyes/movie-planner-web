<script lang="ts">
import { getPicklists, listViewings } from "../lib/caldav/client";
import type { CaldavConfig } from "../lib/caldav/types";
import { getCredentialsStore } from "../lib/credentials/store";
import { importCheckRange } from "../lib/movie-log/run-import";
import { reloadOnBfcacheRestore } from "../lib/ui/bfcache";
// biome-ignore lint/correctness/noUnusedImports: used in the template below, which Biome does not parse for .svelte files
import {
	BUTTON_PRIMARY,
	BUTTON_SECONDARY,
	FIELD_WRAPPER,
	INPUT,
	LABEL,
	STATUS_TEXT,
	TABLE,
	TABLE_WRAP,
	TD,
	TH,
	TR_BODY,
} from "../lib/ui/classes";
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
// #123: defaults to the same wide range bulk-import's own duplicate
// check already uses (importCheckRange's 15-years-back window) — the
// visitor's whole history, same as before this filter existed — but a
// visitor can narrow it, same From/To shape as the calendar overview's
// own filter.
let fromValue = $state("");
let toValue = $state("");
// biome-ignore lint/correctness/noUnusedVariables: used in the template below, which Biome does not parse for .svelte files
let status = $state("Loading…");

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
// #146: the exact range that produced the counts currently on screen —
// not just whatever's typed into fromValue/toValue right now, which can
// differ from what's loaded until "Filter" is clicked. A venue link
// needs to carry this so the overview it lands on shows the same
// viewings the count was drawn from, rather than falling back to its
// own much narrower default window.
let loadedRange = $state<{ from: string; to: string } | null>(null);

function currentRange(): { from: string; to: string } {
	const wide = importCheckRange();
	return {
		from: fromValue ? new Date(fromValue).toISOString() : wide.from,
		to: toValue ? new Date(toValue).toISOString() : wide.to,
	};
}

function toDateInputValue(iso: string): string {
	const d = new Date(iso);
	const pad = (n: number) => String(n).padStart(2, "0");
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// #131/#146: the overview's own venue filter reads the `venue` query
// param on load, and its From/To fields read `from`/`to` the same way
// — see CalendarOverview.svelte's own venueValue/fromValue/toValue
// init. Without carrying the range, the link would land on the
// overview's own much narrower default window instead of the one that
// produced this venue's count/pin. Shared by the table's own venue
// link and the map pin's popup link below, so the two can't drift.
function venueHref(venue: string): string {
	const range = loadedRange
		? `&from=${toDateInputValue(loadedRange.from)}&to=${toDateInputValue(loadedRange.to)}`
		: "";
	return `/?venue=${encodeURIComponent(venue)}${range}`;
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

// Aborts a still-in-flight load when a newer one starts (a fast
// double-submit of the filter form, a mount-time load overlapping a
// filter change) — same reasoning as CalendarOverview's own
// reloadController, see its comment there.
let loadController: AbortController | undefined;

async function load() {
	loadController?.abort();
	const controller = new AbortController();
	loadController = controller;
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
		const range = currentRange();
		loadedRange = range;
		const [{ venues }, viewings] = await Promise.all([
			getPicklists(config),
			listViewings(config, range, { signal: controller.signal }),
		]);
		const infoByVenue = new Map<string, VenueInfo>(
			venues.map((venue) => [venue, { venue, count: 0 }]),
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
		status = error instanceof Error ? error.message : "Failed to load venues.";
	}
}

// biome-ignore lint/correctness/noUnusedVariables: bound in the template below, which Biome does not parse for .svelte files
function handleFilterSubmit(event: SubmitEvent) {
	event.preventDefault();
	void load();
}

// biome-ignore lint/correctness/noUnusedVariables: bound in the template below, which Biome does not parse for .svelte files
function handleClearFilter() {
	fromValue = "";
	toValue = "";
	void load();
}

load();
// #223: see CalendarOverview.svelte's own reloadOnBfcacheRestore call.
reloadOnBfcacheRestore(() => void load());
</script>

<div class="flex flex-col gap-4">
  <form
    class="flex flex-wrap items-end gap-3"
    aria-label="Filter venues"
    onsubmit={handleFilterSubmit}
  >
    <label class={FIELD_WRAPPER} for="venues-from">
      <span class={LABEL}>From</span>
      <input class={INPUT} type="date" id="venues-from" bind:value={fromValue} />
    </label>
    <label class={FIELD_WRAPPER} for="venues-to">
      <span class={LABEL}>To</span>
      <input class={INPUT} type="date" id="venues-to" bind:value={toValue} />
    </label>
    <button type="submit" class={BUTTON_PRIMARY}>Filter</button>
    <button type="button" class={BUTTON_SECONDARY} onclick={handleClearFilter}>
      Clear filter
    </button>
  </form>

  <p class={STATUS_TEXT} role="status">{status}</p>

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
                {cityGroup.city}
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
