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

// #99: every venue the visitor has ever logged a viewing at, or added
// to their picklist, each with a count of logged viewings there — not
// a map (#8, deferred, needs location data this app doesn't have),
// just a plain list built from data already available: the union of
// location-management's own picklist (so a venue with zero viewings
// still shows, #99's own scenario) and a calendar query.
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
let venueCounts = $state<{ venue: string; count: number }[]>([]);
// #146: the exact range that produced the counts currently on screen —
// not just whatever's typed into fromValue/toValue right now, which can
// differ from what's loaded until "Filter" is clicked. A venue link
// needs to carry this so the overview it lands on shows the same
// viewings the count was drawn from, rather than falling back to its
// own much narrower default window.
// biome-ignore lint/correctness/noUnusedVariables: used in the template below, which Biome does not parse for .svelte files
let loadedRange = $state<{ from: string; to: string } | null>(null);

function currentRange(): { from: string; to: string } {
	const wide = importCheckRange();
	return {
		from: fromValue ? new Date(fromValue).toISOString() : wide.from,
		to: toValue ? new Date(toValue).toISOString() : wide.to,
	};
}

// biome-ignore lint/correctness/noUnusedVariables: used in the template below, which Biome does not parse for .svelte files
function toDateInputValue(iso: string): string {
	const d = new Date(iso);
	const pad = (n: number) => String(n).padStart(2, "0");
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

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
		const counts = new Map<string, number>(venues.map((venue) => [venue, 0]));
		for (const viewing of viewings) {
			if (!viewing.venue) continue;
			counts.set(viewing.venue, (counts.get(viewing.venue) ?? 0) + 1);
		}
		venueCounts = [...counts.entries()]
			.map(([venue, count]) => ({ venue, count }))
			.sort((a, b) => b.count - a.count || a.venue.localeCompare(b.venue));
		status = `${venueCounts.length} venue${venueCounts.length === 1 ? "" : "s"}.`;
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

  {#if venueCounts.length > 0}
    <div class={TABLE_WRAP}>
      <table class={TABLE}>
        <thead class="bg-slate-50 dark:bg-slate-900/40">
          <tr>
            <th class={TH} scope="col">Venue</th>
            <th class={TH} scope="col">Viewings</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-200 dark:divide-slate-700">
          {#each venueCounts as { venue, count } (venue)}
            <tr class={TR_BODY}>
              <td class={TD}>
                <!-- #131/#146: the overview's own venue filter reads
                the `venue` query param on load, and its From/To fields
                read `from`/`to` the same way — see
                CalendarOverview.svelte's own venueValue/fromValue/
                toValue init. Without carrying the range, the link would
                land on the overview's own much narrower default window
                instead of the one that produced this count. -->
                <a
                  href={`/?venue=${encodeURIComponent(venue)}${
                    loadedRange
                      ? `&from=${toDateInputValue(loadedRange.from)}&to=${toDateInputValue(loadedRange.to)}`
                      : ""
                  }`}
                  class="text-indigo-600 hover:underline dark:text-indigo-400"
                >
                  {venue}
                </a>
              </td>
              <td class={TD}>{count}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</div>
