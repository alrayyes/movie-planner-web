<script lang="ts">
import { ATTRIBUTES, type AttributeKind, attributeValues } from "../lib/attribute/attributes";
import { listViewings } from "../lib/caldav/client";
import type { CaldavConfig, LoggedViewing } from "../lib/caldav/types";
import { getCredentialsStore } from "../lib/credentials/store";
import { importCheckRange } from "../lib/movie-log/run-import";
import { ACTIVE_FILTER_LABEL_EVENT } from "../lib/ui/active-filter";
import { reloadOnBfcacheRestore } from "../lib/ui/bfcache";
// biome-ignore lint/correctness/noUnusedImports: used in the template below, which Biome does not parse for .svelte files
import {
	BUTTON_SM,
	INPUT,
	STATUS_TEXT,
	TABLE,
	TABLE_WRAP,
	TD,
	TH,
	TR_BODY,
} from "../lib/ui/classes";
// biome-ignore lint/correctness/noUnusedImports: used in the template below, which Biome does not parse for .svelte files
import { computeBlockedTimeBar, formatPeriod } from "../lib/ui/datetime";
// biome-ignore lint/correctness/noUnusedImports: used in the template below, which Biome does not parse for .svelte files
import { computePageNumbers, PAGE_SIZE_OPTIONS } from "../lib/ui/pagination";
// biome-ignore lint/correctness/noUnusedImports: used in the template below, which Biome does not parse for .svelte files
import ErrorToast from "./ErrorToast.svelte";
// biome-ignore lint/correctness/noUnusedImports: used in the template below, which Biome does not parse for .svelte files
import PosterPlaceholder from "./PosterPlaceholder.svelte";

// #450: the shared detail half of the generalized director/actor/genre/
// movie-country/movie-language pattern — a dedicated, filter-free view
// of one attribute value's own viewings, the same call VenueOverview.svelte
// (#448) already made for venue: its own small component rather than a
// "hide the filters" mode threaded through CalendarOverview.svelte.
// Reuses the overview's own pagination (lib/ui/pagination.ts) and date/
// time formatting (lib/ui/datetime.ts), same as VenueOverview.svelte.
//
// No map, no geo, no name-trimming — none of these five attributes carry
// coordinates or a display-name concept the way a venue does, so this
// stays a plain results table + pagination, nothing else.
interface Props {
	kind: AttributeKind;
}
const { kind }: Props = $props();
const config = ATTRIBUTES[kind];

// The value itself comes from this attribute's own query string param —
// the same raw value a chip link (ChipList.svelte's attributeHref) and
// the listing page's own per-value link already carry — read once, on
// mount, and never changed: there is deliberately no UI anywhere on this
// page to alter or clear it. Same reasoning as VenueOverview.svelte's
// own `venue` const.
const value = new URLSearchParams(location.search).get(config.paramName) ?? "";
const valueLower = value.trim().toLowerCase();

// biome-ignore lint/correctness/noUnusedVariables: read in the template below, which Biome does not parse for .svelte files
let status = $state("Loading…");
// #442: a genuine load failure gets the distinct error-toast treatment
// instead of blending into status's own quiet line.
// biome-ignore lint/correctness/noUnusedVariables: read in the template below, which Biome does not parse for .svelte files
let loadError = $state("");

let allViewings = $state<LoggedViewing[]>([]);
// #300: same visitor-adjustable page size as the main overview.
let pageSize = $state(25);
let currentPage = $state(0);

// #123/#446: the visitor's whole history, same wide window every other
// per-value/listing page and bulk-import's own duplicate check already
// use — there's no From/To filter on this page to narrow it further.
const viewings = $derived.by(() => {
	const matched = allViewings.filter((v) =>
		attributeValues(v, kind).some((x) => x.trim().toLowerCase() === valueLower),
	);
	return [...matched].sort((a, b) => new Date(b.start).getTime() - new Date(a.start).getTime());
});
const total = $derived(viewings.length);
// #375: broadcasts this value the same way CalendarOverview.svelte's own
// chip-driven filter label (and VenueOverview.svelte's own trimmed venue
// name) already do, so site-breadcrumb.ts's existing dynamic-segment
// mechanism shows it without needing any per-attribute awareness of its
// own.
$effect(() => {
	if (value) {
		window.dispatchEvent(new CustomEvent(ACTIVE_FILTER_LABEL_EVENT, { detail: value }));
	}
});
const pages = $derived(Math.max(1, Math.ceil(total / pageSize)));
// #59: clamps a stale currentPage (a smaller reloaded set, or a larger
// page size, can leave it past the new last page) rather than rendering
// an empty page silently.
$effect(() => {
	if (currentPage > pages - 1) currentPage = pages - 1;
	if (currentPage < 0) currentPage = 0;
});
// biome-ignore lint/correctness/noUnusedVariables: used in the template below, which Biome does not parse for .svelte files
const currentPageItems = $derived.by(() => {
	const start = currentPage * pageSize;
	return viewings.slice(start, start + pageSize);
});
// biome-ignore lint/correctness/noUnusedVariables: read in the template below, which Biome does not parse for .svelte files
const pageNumbers = $derived(computePageNumbers(currentPage, pages));

// biome-ignore lint/correctness/noUnusedVariables: bound in the template below, which Biome does not parse for .svelte files
function handlePageSizeChange(event: Event) {
	pageSize = Number((event.target as HTMLSelectElement).value);
	currentPage = 0;
}

// Gates the count line and table — false both before credentials are
// known to exist and while a load has failed, so "Connect first…" or the
// error toast stands alone rather than sitting next to a confusing "0
// logged viewings." underneath it. True once a load has actually
// succeeded, including a zero-result one — the unmatched-value empty
// state.
// biome-ignore lint/correctness/noUnusedVariables: read in the template below, which Biome does not parse for .svelte files
let hasLoaded = $state(false);

let loadController: AbortController | undefined;

async function load() {
	loadController?.abort();
	const controller = new AbortController();
	loadController = controller;
	loadError = "";
	const credentials = await getCredentialsStore().get();
	if (!credentials) {
		status = `Connect first to see this ${config.singular.toLowerCase()}.`;
		return;
	}
	const caldavConfig: CaldavConfig = {
		baseUrl: credentials.caldavUrl,
		username: credentials.caldavUsername,
		password: credentials.caldavPassword,
	};
	try {
		allViewings = await listViewings(caldavConfig, importCheckRange(), {
			signal: controller.signal,
		});
		status = "";
		hasLoaded = true;
	} catch (error) {
		// Superseded by a newer load — the newer call's own catch/success
		// block is what should actually update status now, not this one.
		if (error instanceof DOMException && error.name === "AbortError") return;
		status = "";
		loadError = error instanceof Error ? error.message : "Failed to load viewings.";
	}
}

load();
// #223: same bfcache-restore gap as every other page reading live CalDAV
// data — see CalendarOverview.svelte's own call for why.
reloadOnBfcacheRestore(() => void load());
</script>

<div class="flex flex-col gap-4">
  <h1 class="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
    {value || config.singular}
  </h1>
  <p class={STATUS_TEXT} role="status">{status}</p>
  {#if loadError}
    <ErrorToast message={loadError} onDismiss={() => (loadError = "")} />
  {/if}

  {#if hasLoaded}
    <p class={STATUS_TEXT}>{total} logged viewing{total === 1 ? "" : "s"}.</p>
  {/if}

  {#if total > 0}
    <div class={TABLE_WRAP}>
      <table class={TABLE}>
        <thead class="bg-slate-50 dark:bg-slate-900/40">
          <tr>
            <th class={TH} scope="col">Poster</th>
            <th class={TH} scope="col">Title</th>
            <th class={TH} scope="col">When</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-200 dark:divide-slate-700">
          {#each currentPageItems as viewing (viewing.uid)}
            {@const blockedTimeBar = computeBlockedTimeBar(viewing.start, viewing.end)}
            <tr class={TR_BODY}>
              <td class={TD}>
                {#if viewing.posterUrl}
                  <a href={`/movie?uid=${encodeURIComponent(viewing.uid)}`}>
                    <img
                      src={viewing.posterUrl}
                      alt={`${viewing.title} poster`}
                      class="h-24 w-16 max-w-none rounded object-cover shadow-sm sm:h-40 sm:w-24"
                      loading="lazy"
                    />
                  </a>
                {:else}
                  <a href={`/movie?uid=${encodeURIComponent(viewing.uid)}`}>
                    <PosterPlaceholder class="h-24 w-16 rounded shadow-sm sm:h-40 sm:w-24" />
                  </a>
                {/if}
              </td>
              <td class={TD}>
                <a
                  href={`/movie?uid=${encodeURIComponent(viewing.uid)}`}
                  class="font-medium text-indigo-600 hover:underline dark:text-indigo-400"
                >
                  {viewing.year ? `${viewing.title} (${viewing.year})` : viewing.title}
                </a>
              </td>
              <td class={TD}>
                {formatPeriod(viewing.start, viewing.end)}
                {#if blockedTimeBar.widthPercent > 0}
                  <div
                    class="relative mt-1 h-1.5 w-full max-w-32 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700"
                    aria-hidden="true"
                  >
                    <div
                      class="absolute inset-y-0 rounded-full bg-indigo-500 dark:bg-indigo-400"
                      style={`left: ${blockedTimeBar.positionPercent}%; width: ${blockedTimeBar.widthPercent}%;`}
                    ></div>
                  </div>
                {/if}
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>

    <div class="mt-2 flex items-center justify-end gap-2">
      <label
        class="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400"
        for="attribute-page-size"
      >
        Results per page
        <select
          id="attribute-page-size"
          class={INPUT}
          value={pageSize}
          onchange={handlePageSizeChange}
        >
          {#each PAGE_SIZE_OPTIONS as option (option)}
            <option value={option}>{option}</option>
          {/each}
        </select>
      </label>
    </div>

    {#if pages > 1}
      <div class="mt-2 flex flex-wrap items-center justify-center gap-2" aria-label="Pagination">
        <button
          type="button"
          class={BUTTON_SM}
          disabled={currentPage === 0}
          onclick={() => (currentPage = 0)}
        >
          First
        </button>
        <button
          type="button"
          class={BUTTON_SM}
          disabled={currentPage === 0}
          onclick={() => (currentPage -= 1)}
        >
          Previous page
        </button>
        {#each pageNumbers as pageNumber, i (i)}
          {#if pageNumber === "…"}
            <span aria-hidden="true" class="px-1 text-slate-400 dark:text-slate-500">…</span>
          {:else}
            <button
              type="button"
              class={pageNumber === currentPage + 1
                ? "inline-flex h-8 w-8 items-center justify-center rounded-md bg-indigo-600 text-sm font-medium text-white"
                : "inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-300 text-sm text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700"}
              aria-current={pageNumber === currentPage + 1 ? "page" : undefined}
              aria-label={`Go to page ${pageNumber}`}
              onclick={() => (currentPage = pageNumber - 1)}
            >
              {pageNumber}
            </button>
          {/if}
        {/each}
        <button
          type="button"
          class={BUTTON_SM}
          disabled={currentPage >= pages - 1}
          onclick={() => (currentPage += 1)}
        >
          Next page
        </button>
        <button
          type="button"
          class={BUTTON_SM}
          disabled={currentPage >= pages - 1}
          onclick={() => (currentPage = pages - 1)}
        >
          Last
        </button>
        <span class={STATUS_TEXT}>Page {currentPage + 1} of {pages}</span>
      </div>
    {/if}
  {/if}
</div>
