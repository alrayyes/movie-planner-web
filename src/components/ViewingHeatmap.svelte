<script lang="ts">
import { listViewings } from "../lib/caldav/client";
import type { CaldavConfig } from "../lib/caldav/types";
import { getCredentialsStore } from "../lib/credentials/store";
import { importCheckRange } from "../lib/movie-log/run-import";
// biome-ignore lint/correctness/noUnusedImports: used in the template below, which Biome does not parse for .svelte files
import { STATUS_TEXT } from "../lib/ui/classes";
import { toDateInputValue } from "../lib/ui/datetime";
import { bucketViewingsByLocalDay } from "../lib/ui/heatmap";

// #198/#204: a GitHub-contribution-style heatmap of viewing density
// across the visitor's whole logged history — a different
// visualization of the same data the calendar overview already shows
// as a table, on its own page (same reasoning as the Venues page:
// avoids reconciling the overview's own filter state with this view).
// No range scrubber — a visitor wanting a narrower view already has
// the overview's own From/To fields; clicking a day cell here takes
// them straight there.

// biome-ignore lint/correctness/noUnusedVariables: read in the template below, which Biome does not parse for .svelte files
let status = $state("Loading…");
let dayCounts = $state<Map<string, number>>(new Map());

// #199 (this feature reuses the same #188-fixed local-day handling):
// when there's no logged history at all to infer a range from, default
// to the last 12 months ending today — a reasonable "recent activity"
// view rather than an arbitrary or empty range.
function fallbackDays(): string[] {
	const days: string[] = [];
	const end = new Date();
	const start = new Date(end.getFullYear(), end.getMonth() - 11, end.getDate());
	for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
		days.push(toDateInputValue(d.toISOString()));
	}
	return days;
}

// The full contiguous day range to render — from the earliest to the
// latest local day with a logged viewing, inclusive, so the grid shows
// exactly the ground the visitor's own history actually covers.
// biome-ignore lint/correctness/noUnusedVariables: read in the template below, which Biome does not parse for .svelte files
const days = $derived.by(() => {
	if (dayCounts.size === 0) return fallbackDays();
	const keys = [...dayCounts.keys()].sort();
	const first = keys[0] as string;
	const last = keys[keys.length - 1] as string;
	const [fy, fm, fd] = first.split("-").map(Number) as [number, number, number];
	const [ly, lm, ld] = last.split("-").map(Number) as [number, number, number];
	const start = new Date(fy, fm - 1, fd);
	const end = new Date(ly, lm - 1, ld);
	const result: string[] = [];
	for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
		result.push(toDateInputValue(d.toISOString()));
	}
	return result;
});

// A small fixed set of buckets, not a continuous gradient — easier to
// keep distinguishable in both light and dark mode (design.md).
// biome-ignore lint/correctness/noUnusedVariables: read in the template below, which Biome does not parse for .svelte files
function shadeClass(count: number): string {
	if (count === 0) return "bg-slate-100 dark:bg-slate-800";
	if (count === 1) return "bg-indigo-200 dark:bg-indigo-900";
	if (count <= 3) return "bg-indigo-400 dark:bg-indigo-600";
	return "bg-indigo-600 dark:bg-indigo-400";
}

// biome-ignore lint/correctness/noUnusedVariables: read in the template below, which Biome does not parse for .svelte files
function cellLabel(day: string, count: number): string {
	return `${day}: ${count} viewing${count === 1 ? "" : "s"}`;
}

async function load() {
	const credentials = await getCredentialsStore().get();
	if (!credentials) {
		status = "Connect first to see your viewing heatmap.";
		return;
	}
	const config: CaldavConfig = {
		baseUrl: credentials.caldavUrl,
		username: credentials.caldavUsername,
		password: credentials.caldavPassword,
	};
	try {
		const viewings = await listViewings(config, importCheckRange());
		dayCounts = bucketViewingsByLocalDay(viewings);
		status =
			viewings.length === 0
				? "No logged viewings yet."
				: `${viewings.length} logged viewing${viewings.length === 1 ? "" : "s"}.`;
	} catch (error) {
		status = error instanceof Error ? error.message : "Failed to load the heatmap.";
	}
}

load();
</script>

<div class="flex flex-col gap-4">
  <p class={STATUS_TEXT} role="status">{status}</p>
  <div
    class="grid gap-1"
    style="grid-template-columns: repeat(auto-fill, minmax(0.85rem, 1fr));"
  >
    {#each days as day (day)}
      {@const count = dayCounts.get(day) ?? 0}
      {#if count > 0}
        <a
          href={`/?from=${day}&to=${day}`}
          class={`aspect-square rounded-sm ${shadeClass(count)} hover:ring-2 hover:ring-indigo-500`}
          aria-label={cellLabel(day, count)}
          title={cellLabel(day, count)}
        ></a>
      {:else}
        <span
          role="img"
          class={`aspect-square rounded-sm ${shadeClass(count)}`}
          aria-label={cellLabel(day, count)}
          title={cellLabel(day, count)}
        ></span>
      {/if}
    {/each}
  </div>
</div>
