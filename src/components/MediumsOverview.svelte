<script lang="ts">
import { getPicklists, listViewings } from "../lib/caldav/client";
import type { CaldavConfig } from "../lib/caldav/types";
import { getCredentialsStore } from "../lib/credentials/store";
// biome-ignore lint/correctness/noUnusedImports: used in the template below, which Biome does not parse for .svelte files
import { mediumDisplay, mediumHref } from "../lib/medium/display";
import { importCheckRange } from "../lib/movie-log/run-import";
import { reloadOnBfcacheRestore } from "../lib/ui/bfcache";
// biome-ignore lint/correctness/noUnusedImports: used in the template below, which Biome does not parse for .svelte files
import { STATUS_TEXT, TABLE, TABLE_WRAP, TD, TH, TR_BODY } from "../lib/ui/classes";
// biome-ignore lint/correctness/noUnusedImports: used in the template below, which Biome does not parse for .svelte files
import ErrorToast from "./ErrorToast.svelte";

// #602: VenuesOverview.svelte's own shape (#99/#116), minus the map and
// city/country grouping — a medium has no location to plot or group by,
// just a name and a count. "Cinema" (mediumDisplay's own always-there
// baseline, #600) is always included even with zero viewings, same
// "seed from the picklist, backfill from viewings" rule venue already
// follows so a medium with zero viewings still shows.
//
// #123/#446: same wide importCheckRange() window venues/the main
// overview already use — no filter UI to narrow it.
// biome-ignore lint/correctness/noUnusedVariables: used in the template below, which Biome does not parse for .svelte files
let status = $state("Loading…");
// biome-ignore lint/correctness/noUnusedVariables: used in the template below, which Biome does not parse for .svelte files
let loadError = $state("");

interface MediumInfo {
	medium: string;
	count: number;
}

let mediumInfos = $state<MediumInfo[]>([]);

let loadController: AbortController | undefined;

async function load() {
	loadController?.abort();
	const controller = new AbortController();
	loadController = controller;
	loadError = "";
	const credentials = await getCredentialsStore().get();
	if (!credentials) {
		status = "Connect first to see your mediums.";
		return;
	}
	const config: CaldavConfig = {
		baseUrl: credentials.caldavUrl,
		username: credentials.caldavUsername,
		password: credentials.caldavPassword,
	};
	try {
		const range = importCheckRange();
		const [{ media }, viewings] = await Promise.all([
			getPicklists(config),
			listViewings(config, range, { signal: controller.signal }),
		]);
		const infoByMedium = new Map<string, MediumInfo>(
			["Cinema", ...media].map((medium) => [medium, { medium, count: 0 }]),
		);
		for (const viewing of viewings) {
			const medium = mediumDisplay(viewing.medium);
			const info = infoByMedium.get(medium) ?? { medium, count: 0 };
			info.count += 1;
			infoByMedium.set(medium, info);
		}
		mediumInfos = [...infoByMedium.values()].sort(
			(a, b) => b.count - a.count || a.medium.localeCompare(b.medium),
		);
		status = `${mediumInfos.length} medium${mediumInfos.length === 1 ? "" : "s"}.`;
	} catch (error) {
		// Superseded by a newer load — the newer call's own catch/success
		// block is what should actually update status now, not this one.
		if (error instanceof DOMException && error.name === "AbortError") return;
		status = "";
		loadError = error instanceof Error ? error.message : "Failed to load mediums.";
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

  {#if mediumInfos.length > 0}
    <div class={TABLE_WRAP}>
      <table class={TABLE}>
        <thead class="bg-slate-50 dark:bg-slate-900/40">
          <tr>
            <th class={TH} scope="col">Medium</th>
            <th class={TH} scope="col">Viewings</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-200 dark:divide-slate-700">
          {#each mediumInfos as { medium, count } (medium)}
            <tr class={TR_BODY}>
              <td class={TD}>
                <a
                  href={mediumHref(medium)}
                  class="text-indigo-600 hover:underline dark:text-indigo-400"
                >
                  {medium}
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
