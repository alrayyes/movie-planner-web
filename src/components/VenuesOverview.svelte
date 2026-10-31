<script lang="ts">
import { getPicklists } from "../lib/caldav/client";
import type { CaldavConfig, LoggedViewing, VenueEntry } from "../lib/caldav/types";
import { listAllViewings } from "../lib/caldav/viewings-source";
import { getCredentialsStore } from "../lib/credentials/store";
import { reloadOnViewingSaved } from "../lib/movie-log/log-viewing";
import { importCheckRange } from "../lib/movie-log/run-import";
import { reloadOnBfcacheRestore } from "../lib/ui/bfcache";
// biome-ignore lint/correctness/noUnusedImports: used in the template below, which Biome does not parse for .svelte files
import { STATUS_TEXT, TABLE, TABLE_WRAP, TD, TH, TR_BODY } from "../lib/ui/classes";
import { venueHref } from "../lib/venue/display";
import { buildVenueInfos, groupByLocation, pinsFor, type VenueInfo } from "../lib/venue/overview";
import ConnectLink from "./ConnectLink.svelte";
// biome-ignore lint/correctness/noUnusedImports: used in the template below, which Biome does not parse for .svelte files
import ErrorToast from "./ErrorToast.svelte";
// biome-ignore lint/correctness/noUnusedImports: used in the template below, which Biome does not parse for .svelte files
import RefreshMaps from "./RefreshMaps.svelte";
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
// #677: set while no credentials are stored, so the empty state can link
// to where a visitor connects.
let disconnected = $state(false);
// #442: a genuine load failure gets the distinct error-toast treatment
// instead of blending into status's own quiet line.
// biome-ignore lint/correctness/noUnusedVariables: used in the template below, which Biome does not parse for .svelte files
let loadError = $state("");

// #277/#267: a venue's own geo/city/country come from whichever of its
// viewings happened to carry them first — every viewing at the same
// venue shares the same location data, so which one doesn't matter.
// A field missing from every viewing at that venue is simply left off,
// same "omit, don't guess" rule the other maps already follow.
let venueInfos = $state<VenueInfo[]>([]);
// #869: what "Refresh maps" looks at and writes to, and where to write it.
// biome-ignore lint/correctness/noUnusedVariables: read in the template below, which Biome does not parse for .svelte files
let loadedViewings = $state<LoggedViewing[]>([]);
// biome-ignore lint/correctness/noUnusedVariables: read in the template below, which Biome does not parse for .svelte files
let caldavConfig = $state<CaldavConfig | null>(null);
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

// #267: only a venue with BOTH city and country groups at all — see
// groupByLocation in ../lib/venue/overview.ts.
const grouped = $derived(groupByLocation(venueInfos));
// biome-ignore lint/correctness/noUnusedVariables: used in the template below, which Biome does not parse for .svelte files
const countryGroups = $derived(grouped.countries);
// biome-ignore lint/correctness/noUnusedVariables: used in the template below, which Biome does not parse for .svelte files
const ungroupedVenues = $derived(grouped.ungrouped);

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
	disconnected = !credentials;
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
		loadedRange = importCheckRange();
		// #715: viewings come from the cache at once and are redone if the
		// background refresh differs. The picklist is a small live fetch the
		// refresh waits for, since it can finish first.
		const picklists = getPicklists(config);
		caldavConfig = config;
		const apply = (venues: VenueEntry[], viewings: LoggedViewing[]) => {
			loadedViewings = viewings;
			venueInfos = buildVenueInfos(venues, viewings);
			status = `${venueInfos.length} venue${venueInfos.length === 1 ? "" : "s"}.`;
		};
		const viewings = await listAllViewings(config, {
			signal: controller.signal,
			onRefresh: (fresh) => {
				void picklists.then(({ venues }) => {
					if (!controller.signal.aborted) apply(venues, fresh);
				});
			},
			onRefreshError: (error) => {
				loadError = error instanceof Error ? error.message : "Failed to refresh viewings.";
			},
		});
		apply((await picklists).venues, viewings);
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
// #960: the header wizard saves apart from this page, so it announces it.
reloadOnViewingSaved(() => void load());
</script>

<div class="flex flex-col gap-4">
  <p class={STATUS_TEXT} role="status">{status}</p>
  {#if disconnected}
    <ConnectLink />
  {/if}
  {#if loadError}
    <ErrorToast message={loadError} onDismiss={() => (loadError = "")} />
  {/if}

  {#if caldavConfig}
    <RefreshMaps viewings={loadedViewings} config={caldavConfig} onApplied={() => void load()} />
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
