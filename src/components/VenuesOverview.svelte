<script lang="ts">
import { getPicklists, listViewings } from "../lib/caldav/client";
import type { CaldavConfig } from "../lib/caldav/types";
import { getCredentialsStore } from "../lib/credentials/store";
import { importCheckRange } from "../lib/movie-log/run-import";
// biome-ignore lint/correctness/noUnusedImports: used in the template below, which Biome does not parse for .svelte files
import { STATUS_TEXT, TABLE, TABLE_WRAP, TD, TH, TR_BODY } from "../lib/ui/classes";

// #99: every venue the visitor has ever added to their picklist, each
// with a count of logged viewings there — not a map (#8, deferred,
// needs location data this app doesn't have), just a plain list built
// from data already available: location-management's own picklist
// plus a wide-range calendar query (importCheckRange's own 15-years-
// back window, same one bulk-import already uses for "the whole
// history", not calendar-overview's narrower 3-month default).
// biome-ignore lint/correctness/noUnusedVariables: used in the template below, which Biome does not parse for .svelte files
let status = $state("Loading…");
let venueCounts = $state<{ venue: string; count: number }[]>([]);

async function load() {
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
		const [{ venues }, viewings] = await Promise.all([
			getPicklists(config),
			listViewings(config, importCheckRange()),
		]);
		const counts = new Map<string, number>(venues.map((venue) => [venue, 0]));
		for (const viewing of viewings) {
			if (viewing.venue && counts.has(viewing.venue)) {
				counts.set(viewing.venue, (counts.get(viewing.venue) ?? 0) + 1);
			}
		}
		venueCounts = [...counts.entries()]
			.map(([venue, count]) => ({ venue, count }))
			.sort((a, b) => b.count - a.count || a.venue.localeCompare(b.venue));
		status = `${venueCounts.length} venue${venueCounts.length === 1 ? "" : "s"}.`;
	} catch (error) {
		status = error instanceof Error ? error.message : "Failed to load venues.";
	}
}

load();
</script>

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
            <td class={TD}>{venue}</td>
            <td class={TD}>{count}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
{/if}
