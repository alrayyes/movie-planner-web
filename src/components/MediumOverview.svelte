<script lang="ts">
import { listViewings } from "../lib/caldav/client";
import type { CaldavConfig, LoggedViewing } from "../lib/caldav/types";
import { getCredentialsStore } from "../lib/credentials/store";
import { mediumDisplay } from "../lib/medium/display";
// biome-ignore lint/correctness/noUnusedImports: used in the template below, which Biome does not parse for .svelte files
import { movieHref } from "../lib/movie-log/movie-link";
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

// #602: VenueOverview.svelte's own shape (#448), minus the map — a
// medium has no location to plot. The medium itself comes from the
// `medium` query string param (mediumHref's own value), read once on
// mount and never changed, same reasoning as VenueOverview's own
// `venue` param.
const medium = new URLSearchParams(location.search).get("medium") ?? "";

// biome-ignore lint/correctness/noUnusedVariables: read in the template below, which Biome does not parse for .svelte files
let status = $state("Loading…");
// biome-ignore lint/correctness/noUnusedVariables: read in the template below, which Biome does not parse for .svelte files
let loadError = $state("");

let allViewings = $state<LoggedViewing[]>([]);
let pageSize = $state(25);
let currentPage = $state(0);

// #600: matches via mediumDisplay, not the raw stored value — a blank
// medium (every CLI-logged viewing, since the CLI never writes that
// property) is what "Cinema" means here, the same rule it displays
// under everywhere else.
const viewings = $derived.by(() => {
	const matched = allViewings.filter((v) => mediumDisplay(v.medium) === medium);
	return [...matched].sort((a, b) => new Date(b.start).getTime() - new Date(a.start).getTime());
});
const total = $derived(viewings.length);
const DEFAULT_TITLE = document.title;

// #375: same breadcrumb/title broadcast VenueOverview.svelte's own
// $effect already uses.
$effect(() => {
	if (medium) {
		window.dispatchEvent(new CustomEvent(ACTIVE_FILTER_LABEL_EVENT, { detail: medium }));
		document.title = `${medium} — Mediums — Movie Planner`;
	} else {
		document.title = DEFAULT_TITLE;
	}
});
const pages = $derived(Math.max(1, Math.ceil(total / pageSize)));
$effect(() => {
	if (currentPage > pages - 1) currentPage = pages - 1;
	if (currentPage < 0) currentPage = 0;
});
// biome-ignore lint/correctness/noUnusedVariables: read in the template below, which Biome does not parse for .svelte files
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
		status = "Connect first to see this medium.";
		return;
	}
	const config: CaldavConfig = {
		baseUrl: credentials.caldavUrl,
		username: credentials.caldavUsername,
		password: credentials.caldavPassword,
	};
	try {
		allViewings = await listViewings(config, importCheckRange(), { signal: controller.signal });
		status = "";
		hasLoaded = true;
	} catch (error) {
		if (error instanceof DOMException && error.name === "AbortError") return;
		status = "";
		loadError = error instanceof Error ? error.message : "Failed to load viewings.";
	}
}

load();
reloadOnBfcacheRestore(() => void load());
</script>

<div class="flex flex-col gap-4">
  <h1 class="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
    {medium || "Medium"}
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
                  <a href={movieHref(viewing.uid, { from: location.pathname + location.search })}>
                    <img
                      src={viewing.posterUrl}
                      alt={`${viewing.title} poster`}
                      class="h-24 w-16 max-w-none rounded object-cover shadow-sm sm:h-40 sm:w-24"
                      loading="lazy"
                    />
                  </a>
                {:else}
                  <a href={movieHref(viewing.uid, { from: location.pathname + location.search })}>
                    <PosterPlaceholder class="h-24 w-16 rounded shadow-sm sm:h-40 sm:w-24" />
                  </a>
                {/if}
              </td>
              <td class={TD}>
                <a
                  href={movieHref(viewing.uid, { from: location.pathname + location.search })}
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
        for="medium-page-size"
      >
        Results per page
        <select id="medium-page-size" class={INPUT} value={pageSize} onchange={handlePageSizeChange}>
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
