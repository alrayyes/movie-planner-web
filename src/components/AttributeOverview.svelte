<script lang="ts">
import {
	ATTRIBUTES,
	type AttributeKind,
	// biome-ignore lint/correctness/noUnusedImports: used in the template below, which Biome does not parse for .svelte files
	attributeHref,
	attributeValues,
} from "../lib/attribute/attributes";
import { listViewings } from "../lib/caldav/client";
import type { CaldavConfig } from "../lib/caldav/types";
import { getCredentialsStore } from "../lib/credentials/store";
import { importCheckRange } from "../lib/movie-log/run-import";
import { reloadOnBfcacheRestore } from "../lib/ui/bfcache";
// biome-ignore lint/correctness/noUnusedImports: used in the template below, which Biome does not parse for .svelte files
import { STATUS_TEXT, TABLE, TABLE_WRAP, TD, TH, TR_BODY } from "../lib/ui/classes";
// biome-ignore lint/correctness/noUnusedImports: used in the template below, which Biome does not parse for .svelte files
import ErrorToast from "./ErrorToast.svelte";

// #450: the shared listing half of the generalized director/actor/genre/
// movie-country/movie-language pattern — one component for all five,
// driven entirely by the `kind` prop and lib/attribute/attributes.ts's
// config table, analogous to VenuesOverview.svelte but simpler: none of
// these five have venue's own picklist union, geo/map or city+country
// grouping, so retrofitting VenuesOverview itself would have meant
// stripping those out at every call site rather than just not paying
// for what isn't needed.
interface Props {
	kind: AttributeKind;
}
const { kind }: Props = $props();
const config = ATTRIBUTES[kind];

// biome-ignore lint/correctness/noUnusedVariables: used in the template below, which Biome does not parse for .svelte files
let status = $state("Loading…");
// #442: a genuine load failure gets the distinct error-toast treatment
// instead of blending into status's own quiet line.
// biome-ignore lint/correctness/noUnusedVariables: used in the template below, which Biome does not parse for .svelte files
let loadError = $state("");

interface ValueInfo {
	value: string;
	count: number;
}

let valueInfos = $state<ValueInfo[]>([]);

// Aborts a still-in-flight load when a newer one starts (a mount-time
// load overlapping a bfcache-restore reload) — same reasoning as
// VenuesOverview.svelte's own loadController.
let loadController: AbortController | undefined;

async function load() {
	loadController?.abort();
	const controller = new AbortController();
	loadController = controller;
	loadError = "";
	const credentials = await getCredentialsStore().get();
	if (!credentials) {
		status = `Connect first to see your ${config.plural.toLowerCase()}.`;
		return;
	}
	const caldavConfig: CaldavConfig = {
		baseUrl: credentials.caldavUrl,
		username: credentials.caldavUsername,
		password: credentials.caldavPassword,
	};
	try {
		// #123/#446: the visitor's whole history, same wide window every
		// other listing page (Venues) and bulk-import's own duplicate check
		// already use — there's no filter UI here to narrow it.
		const viewings = await listViewings(caldavConfig, importCheckRange(), {
			signal: controller.signal,
		});
		const counts = new Map<string, number>();
		for (const viewing of viewings) {
			for (const value of attributeValues(viewing, kind)) {
				counts.set(value, (counts.get(value) ?? 0) + 1);
			}
		}
		valueInfos = [...counts.entries()]
			.map(([value, count]) => ({ value, count }))
			.sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
		const label =
			valueInfos.length === 1 ? config.singular.toLowerCase() : config.plural.toLowerCase();
		status = `${valueInfos.length} ${label}.`;
	} catch (error) {
		// Superseded by a newer load — the newer call's own catch/success
		// block is what should actually update status now, not this one.
		if (error instanceof DOMException && error.name === "AbortError") return;
		status = "";
		loadError =
			error instanceof Error ? error.message : `Failed to load ${config.plural.toLowerCase()}.`;
	}
}

load();
// #223: same bfcache-restore gap as every other page reading live CalDAV
// data — see CalendarOverview.svelte's own call for why.
reloadOnBfcacheRestore(() => void load());
</script>

<div class="flex flex-col gap-4">
  <p class={STATUS_TEXT} role="status">{status}</p>
  {#if loadError}
    <ErrorToast message={loadError} onDismiss={() => (loadError = "")} />
  {/if}

  {#if valueInfos.length > 0}
    <div class={TABLE_WRAP}>
      <table class={TABLE}>
        <thead class="bg-slate-50 dark:bg-slate-900/40">
          <tr>
            <th class={TH} scope="col">{config.singular}</th>
            <th class={TH} scope="col">Viewings</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-200 dark:divide-slate-700">
          {#each valueInfos as { value, count } (value)}
            <tr class={TR_BODY}>
              <td class={TD}>
                <a
                  href={attributeHref(kind, value)}
                  class="text-indigo-600 hover:underline dark:text-indigo-400"
                >
                  {value}
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
