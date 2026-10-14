<script lang="ts">
import { updateViewing } from "../lib/caldav/client";
import type { CaldavConfig, LoggedViewing } from "../lib/caldav/types";
// biome-ignore lint/correctness/noUnusedImports: used in the template below, which Biome does not parse for .svelte files
import {
	BUTTON_PRIMARY,
	BUTTON_SECONDARY,
	STATUS_TEXT,
	TABLE,
	TABLE_WRAP,
	TD,
	TH,
} from "../lib/ui/classes";
import { applyMaps, type MapProposal, proposeMaps } from "../lib/venue/refresh-maps";

// #869: a venue's viewings can lose their coordinates (an import from before
// #867, a venue typed in free-form), and every map plots a viewing's own GEO.
// This looks each such venue up on Nominatim, shows what it found, and writes
// only what the visitor ticks. Nothing is looked up until the button is
// pressed, the same stance the "Add venue" address search takes.
interface Props {
	viewings: LoggedViewing[];
	config: CaldavConfig;
	onApplied: () => void;
}
const { viewings, config, onApplied }: Props = $props();

type Phase = "idle" | "searching" | "review" | "applying" | "done";
// biome-ignore lint/correctness/noUnusedVariables: used in the template below, which Biome does not parse for .svelte files
let phase = $state<Phase>("idle");
let proposals = $state<MapProposal[]>([]);
let ticked = $state<Record<string, boolean>>({});
// biome-ignore lint/correctness/noUnusedVariables: used in the template below, which Biome does not parse for .svelte files
let progress = $state("");
// biome-ignore lint/correctness/noUnusedVariables: used in the template below, which Biome does not parse for .svelte files
let message = $state("");

// Viewings at a venue with no coordinates; the button is hidden when none.
// biome-ignore lint/correctness/noUnusedVariables: read in the template below, which Biome does not parse for .svelte files
const missing = $derived(viewings.filter((v) => v.venue && !v.geo).length);

// biome-ignore lint/correctness/noUnusedVariables: used in the template below, which Biome does not parse for .svelte files
async function find() {
	phase = "searching";
	message = "";
	proposals = await proposeMaps(viewings, {
		onProgress: (done, total) => {
			progress = `Looking up venue ${done} of ${total}…`;
		},
	});
	ticked = Object.fromEntries(proposals.map((p) => [p.venue, p.source !== "none"]));
	phase = "review";
}

// biome-ignore lint/correctness/noUnusedVariables: used in the template below, which Biome does not parse for .svelte files
async function apply() {
	const approved = proposals
		.filter((p) => ticked[p.venue] && p.match)
		.map((p) => ({ venue: p.venue, geo: { lat: p.match?.lat ?? 0, lon: p.match?.lon ?? 0 } }));
	phase = "applying";
	const { updated, failed } = await applyMaps(viewings, approved, {
		update: (uid, viewing) => updateViewing(config, uid, viewing),
		onProgress: (done, total) => {
			progress = `Updating viewing ${done} of ${total}…`;
		},
	});
	message = `Updated ${updated} viewing${updated === 1 ? "" : "s"}${failed ? `, ${failed} failed` : ""}.`;
	phase = "done";
	onApplied();
}

// biome-ignore lint/correctness/noUnusedVariables: used in the template below, which Biome does not parse for .svelte files
function cancel() {
	phase = "idle";
	proposals = [];
}
</script>

{#if missing > 0 || phase !== "idle"}
  <section class="flex flex-col gap-3" aria-labelledby="refresh-maps-heading">
    <h2 id="refresh-maps-heading" class="text-base font-medium text-slate-700 dark:text-slate-300">
      Refresh maps
    </h2>

    {#if phase === "idle" || phase === "done"}
      <p class={STATUS_TEXT}>
        {missing} viewing{missing === 1 ? "" : "s"} at a venue ha{missing === 1 ? "s" : "ve"} no coordinates,
        so no map. This looks the venues up on OpenStreetMap's Nominatim, about a second each.
      </p>
      <div>
        <button type="button" class={BUTTON_SECONDARY} onclick={find} disabled={missing === 0}>
          Find missing maps
        </button>
      </div>
    {:else if phase === "searching" || phase === "applying"}
      <p class={STATUS_TEXT} role="status">{progress}</p>
    {:else}
      <div class={TABLE_WRAP}>
        <table class={TABLE}>
          <thead class="bg-slate-50 dark:bg-slate-900/40">
            <tr>
              <th class={TH} scope="col">Use</th>
              <th class={TH} scope="col">Venue</th>
              <th class={TH} scope="col">Found</th>
              <th class={TH} scope="col">Viewings</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-200 dark:divide-slate-700">
            {#each proposals as proposal (proposal.venue)}
              <tr>
                <td class={TD}>
                  <input
                    type="checkbox"
                    aria-label={`Use the match for ${proposal.venue}`}
                    bind:checked={ticked[proposal.venue]}
                    disabled={!proposal.match}
                  />
                </td>
                <td class={TD}>{proposal.venue}</td>
                <td class={TD}>
                  {#if proposal.source === "none"}
                    Nothing found
                  {:else if proposal.source === "viewing"}
                    Already known from another viewing
                  {:else}
                    {proposal.match?.label}
                  {/if}
                </td>
                <td class={TD}>{proposal.count}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
      <div class="flex gap-2">
        <button type="button" class={BUTTON_PRIMARY} onclick={apply}>Update viewings</button>
        <button type="button" class={BUTTON_SECONDARY} onclick={cancel}>Cancel</button>
      </div>
    {/if}

    {#if message}
      <p class={STATUS_TEXT} role="status">{message}</p>
    {/if}
  </section>
{/if}
