<script lang="ts">
import { listViewings } from "../lib/caldav/client";
import type { CaldavConfig, LoggedViewing } from "../lib/caldav/types";
import { getCredentialsStore } from "../lib/credentials/store";
// biome-ignore lint/correctness/noUnusedImports: used in the template below, which Biome does not parse for .svelte files
import { movieHref } from "../lib/movie-log/movie-link";
import { importCheckRange } from "../lib/movie-log/run-import";
import { hasOmdbMetadata, type MissingOmdbField, missingOmdbFields } from "../lib/omdb/metadata";
import { buildOmdbPicker } from "../lib/omdb/picker";
import {
	applyOmdbCandidate,
	type RefreshResult,
	refreshAllMetadata,
	refreshMetadata,
} from "../lib/omdb/refresh-actions";
import { reloadOnBfcacheRestore } from "../lib/ui/bfcache";
// biome-ignore lint/correctness/noUnusedImports: used in the template below, which Biome does not parse for .svelte files
import {
	BUTTON_SECONDARY,
	BUTTON_SM,
	FILTER_CARD,
	INPUT,
	STATUS_TEXT,
	TABLE,
	TABLE_WRAP,
	TD,
	TH,
	TR_BODY,
} from "../lib/ui/classes";
// biome-ignore lint/correctness/noUnusedImports: used in the template below, which Biome does not parse for .svelte files
import { formatDate } from "../lib/ui/datetime";
// biome-ignore lint/correctness/noUnusedImports: used in the template below, which Biome does not parse for .svelte files
import { computePageNumbers, PAGE_SIZE_OPTIONS } from "../lib/ui/pagination";
// biome-ignore lint/correctness/noUnusedImports: used in the template below, which Biome does not parse for .svelte files
import ErrorToast from "./ErrorToast.svelte";
// biome-ignore lint/correctness/noUnusedImports: used in the template below, which Biome does not parse for .svelte files
import PosterPlaceholder from "./PosterPlaceholder.svelte";

// missing-data-overview capability: a dedicated, filterable list of
// logged viewings missing OMDb-sourced data — a gap here is usually the
// first sign a wrong title got matched. Follows AttributeDetail.svelte's
// shape (own load, own pagination, whole-history scan, no persisted
// filter state — design.md's own "New page follows AttributeDetail, not
// a CalendarOverview mode" decision), not CalendarOverview.svelte's
// filter-persistence pattern: this is a narrow diagnostic tool opened
// deliberately, not a primary browsing view.
// biome-ignore lint/correctness/noUnusedVariables: used in the template below, which Biome does not parse for .svelte files
const FIELD_OPTIONS: [MissingOmdbField, string][] = [
	["imdbMatch", "No IMDb match"],
	["poster", "Poster"],
	["director", "Director"],
	["actors", "Actors"],
	["genre", "Genre"],
	["synopsis", "Synopsis"],
];

// All checked by default — the page is useful immediately, showing
// every viewing missing any of the six tracked fields.
let checked = $state<Record<MissingOmdbField, boolean>>({
	imdbMatch: true,
	poster: true,
	director: true,
	actors: true,
	genre: true,
	synopsis: true,
});

// biome-ignore lint/correctness/noUnusedVariables: bound in the template below, which Biome does not parse for .svelte files
function toggleField(field: MissingOmdbField) {
	checked[field] = !checked[field];
	currentPage = 0;
}

// biome-ignore lint/correctness/noUnusedVariables: read in the template below, which Biome does not parse for .svelte files
let status = $state("Loading…");
// biome-ignore lint/correctness/noUnusedVariables: read in the template below, which Biome does not parse for .svelte files
let loadError = $state("");
// biome-ignore lint/correctness/noUnusedVariables: read in the template below, which Biome does not parse for .svelte files
let hasLoaded = $state(false);

let allViewings = $state<LoggedViewing[]>([]);
let config: CaldavConfig | undefined;
let omdbApiKey: string | undefined;
let tmdbApiKey: string | undefined;
const omdbActive = $derived(Boolean(omdbApiKey));

let pageSize = $state(25);
let currentPage = $state(0);

interface Gap {
	viewing: LoggedViewing;
	missing: MissingOmdbField[];
}

// Every viewing missing at least one of the six tracked fields, each
// paired with the full, actual list of what it's missing — the row's
// own "Missing" badges always show the whole truth, independent of
// which checkboxes currently narrow the list.
const gaps = $derived.by((): Gap[] =>
	allViewings
		.map((viewing) => ({ viewing, missing: missingOmdbFields(viewing) }))
		.filter((gap) => gap.missing.length > 0),
);

// OR across the checked set: a viewing shows if it's missing at least
// one checked field.
const filtered = $derived.by(() => {
	const matched = gaps.filter((gap) => gap.missing.some((field) => checked[field]));
	return [...matched].sort(
		(a, b) => new Date(b.viewing.start).getTime() - new Date(a.viewing.start).getTime(),
	);
});
const total = $derived(filtered.length);

const pages = $derived(Math.max(1, Math.ceil(total / pageSize)));
$effect(() => {
	if (currentPage > pages - 1) currentPage = pages - 1;
	if (currentPage < 0) currentPage = 0;
});
const currentPageItems = $derived.by(() => {
	const start = currentPage * pageSize;
	return filtered.slice(start, start + pageSize);
});
// biome-ignore lint/correctness/noUnusedVariables: read in the template below, which Biome does not parse for .svelte files
const pageNumbers = $derived(computePageNumbers(currentPage, pages));

// biome-ignore lint/correctness/noUnusedVariables: bound in the template below, which Biome does not parse for .svelte files
function handlePageSizeChange(event: Event) {
	pageSize = Number((event.target as HTMLSelectElement).value);
	currentPage = 0;
}

let loadController: AbortController | undefined;

async function load() {
	loadController?.abort();
	const controller = new AbortController();
	loadController = controller;
	loadError = "";
	const credentials = await getCredentialsStore().get();
	if (!credentials) {
		status = "Connect first to see missing data.";
		return;
	}
	config = {
		baseUrl: credentials.caldavUrl,
		username: credentials.caldavUsername,
		password: credentials.caldavPassword,
	};
	omdbApiKey = credentials.omdbPaused ? undefined : credentials.omdbApiKey;
	tmdbApiKey = credentials.tmdbApiKey;
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

// biome-ignore lint/correctness/noUnusedVariables: read in the template below, which Biome does not parse for .svelte files
let refreshingUid = $state<string | null>(null);
// biome-ignore lint/correctness/noUnusedVariables: read in the template below, which Biome does not parse for .svelte files
let refreshingAll = $state(false);
let pickerArea = $state<HTMLDivElement | undefined>();
// biome-ignore lint/correctness/noUnusedVariables: read in the template below, which Biome does not parse for .svelte files
let actionStatusText = $state("");
// biome-ignore lint/correctness/noUnusedVariables: read in the template below, which Biome does not parse for .svelte files
let actionError = $state("");

// biome-ignore lint/correctness/noUnusedVariables: read in the template below, which Biome does not parse for .svelte files
const showRefreshAll = $derived(
	omdbActive && currentPageItems.some((g) => !hasOmdbMetadata(g.viewing)),
);

function showOmdbPicker(
	viewing: LoggedViewing,
	result: Extract<RefreshResult, { kind: "needs-picker" }>,
) {
	if (!pickerArea || !omdbApiKey) return;
	const key = omdbApiKey;
	pickerArea.replaceChildren(
		buildOmdbPicker(
			result.candidates,
			async (candidate) => {
				if (!pickerArea) return;
				actionError = "";
				try {
					await applyOmdbCandidate({
						config: config as CaldavConfig,
						omdbApiKey: key,
						tmdbApiKey,
						current: viewing,
						candidate,
					});
					await load();
					actionStatusText = "Refreshed.";
				} catch (error) {
					actionError =
						error instanceof Error ? error.message : "Failed to attach the selected match.";
				} finally {
					pickerArea?.replaceChildren();
				}
			},
			() => {
				pickerArea?.replaceChildren();
				actionStatusText = "OMDb had no match for this title.";
			},
		),
	);
}

// biome-ignore lint/correctness/noUnusedVariables: bound in the template below, which Biome does not parse for .svelte files
async function handleRefresh(viewing: LoggedViewing) {
	if (!omdbActive || !omdbApiKey || !config) return;
	refreshingUid = viewing.uid;
	actionError = "";
	try {
		const result = await refreshMetadata({ config, omdbApiKey, tmdbApiKey, viewing });
		switch (result.kind) {
			case "already-up-to-date":
				await load();
				actionStatusText = "Already up to date.";
				break;
			case "refreshed":
				await load();
				actionStatusText = "Refreshed.";
				break;
			case "needs-picker":
				showOmdbPicker(result.current, result);
				break;
			case "no-match":
				actionStatusText = "OMDb had no match for this title.";
				break;
		}
	} catch (error) {
		actionError = error instanceof Error ? error.message : "Failed to refresh metadata.";
	} finally {
		refreshingUid = null;
	}
}

// biome-ignore lint/correctness/noUnusedVariables: bound in the template below, which Biome does not parse for .svelte files
async function handleRefreshAll() {
	if (!omdbActive || !omdbApiKey || !config) return;
	const targets = currentPageItems.map((g) => g.viewing).filter((v) => !hasOmdbMetadata(v));
	if (targets.length === 0) return;

	refreshingAll = true;
	actionError = "";
	actionStatusText = `Refreshing 0 of ${targets.length}…`;
	try {
		const { refreshed, misses } = await refreshAllMetadata({
			config,
			omdbApiKey,
			tmdbApiKey,
			targets,
			onProgress: (currentRefreshed, currentMisses, total) => {
				actionStatusText = `Refreshing ${currentRefreshed + currentMisses} of ${total}…`;
			},
		});
		await load();
		actionStatusText =
			misses > 0
				? `Refreshed ${refreshed} of ${targets.length} (${misses} had no OMDb match or failed).`
				: `Refreshed ${refreshed} of ${targets.length}.`;
	} finally {
		refreshingAll = false;
	}
}
</script>

<div class="flex flex-col gap-4">
  <p class={STATUS_TEXT} role="status">{status}</p>
  {#if loadError}
    <ErrorToast message={loadError} onDismiss={() => (loadError = "")} />
  {/if}

  {#if hasLoaded}
    <div class={FILTER_CARD}>
      <fieldset class="flex flex-col gap-2">
        <legend class="text-sm font-medium text-slate-700 dark:text-slate-300">
          Show viewings missing
        </legend>
        <div class="flex flex-wrap gap-x-4 gap-y-2">
          {#each FIELD_OPTIONS as [field, label] (field)}
            <label class="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
              <input
                type="checkbox"
                class="size-4 rounded border-slate-300 text-indigo-600 dark:border-slate-600 dark:bg-slate-800"
                checked={checked[field]}
                onchange={() => toggleField(field)}
              />
              {label}
            </label>
          {/each}
        </div>
      </fieldset>

      {#if showRefreshAll}
        <button
          type="button"
          class={BUTTON_SECONDARY}
          disabled={refreshingAll}
          aria-busy={refreshingAll}
          onclick={handleRefreshAll}
        >
          {#if refreshingAll}
            <svg
              class="mr-2 h-4 w-4 animate-spin"
              viewBox="0 0 20 20"
              fill="none"
              stroke="currentColor"
              stroke-width="1.5"
              aria-hidden="true"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                d="M15.5 4.5A7 7 0 1 0 17 10M17 10V5M17 10h-5"
              />
            </svg>
          {/if}
          Refresh all metadata
        </button>
      {/if}
    </div>

    <p class={STATUS_TEXT} role="status">{actionStatusText}</p>
    {#if actionError}
      <ErrorToast message={actionError} onDismiss={() => (actionError = "")} />
    {/if}
    <div bind:this={pickerArea}></div>

    {#if total === 0}
      <p class={STATUS_TEXT}>Nothing's missing any of the checked fields.</p>
    {:else}
      <div class={TABLE_WRAP}>
        <table class={TABLE}>
          <thead class="bg-slate-50 dark:bg-slate-900/40">
            <tr>
              <th class={TH} scope="col">Poster</th>
              <th class={TH} scope="col">Title</th>
              <th class={TH} scope="col">Watched</th>
              <th class={TH} scope="col">Missing</th>
              <th class={TH} scope="col"><span class="sr-only">Refresh</span></th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-200 dark:divide-slate-700">
            {#each currentPageItems as { viewing, missing } (viewing.uid)}
              {@const isRefreshing = refreshingUid === viewing.uid}
              <tr class={`${TR_BODY} ${isRefreshing ? "opacity-50 transition-opacity" : ""}`} aria-busy={isRefreshing}>
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
                <td class={TD}>{formatDate(viewing.start)}</td>
                <td class={TD}>
                  <div class="flex flex-wrap gap-1">
                    {#each missing as field (field)}
                      <span
                        class="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800 dark:bg-amber-900/40 dark:text-amber-300"
                      >
                        {FIELD_OPTIONS.find(([key]) => key === field)?.[1]}
                      </span>
                    {/each}
                  </div>
                </td>
                <td class={TD}>
                  {#if omdbActive}
                    <button
                      type="button"
                      class="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-300 bg-white text-slate-600 shadow-sm hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-1 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                      title="Refresh metadata"
                      aria-label="Refresh metadata"
                      disabled={isRefreshing}
                      aria-busy={isRefreshing}
                      onclick={() => handleRefresh(viewing)}
                    >
                      {#if isRefreshing}
                        <svg
                          class="h-4 w-4 animate-spin"
                          viewBox="0 0 20 20"
                          fill="none"
                          stroke="currentColor"
                          stroke-width="1.5"
                          aria-hidden="true"
                        >
                          <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            d="M12 4v2m0 8v2m8-6h-2M6 10H4m11.3-5.3-1.4 1.4M8.1 13.9l-1.4 1.4m9.6 0-1.4-1.4M8.1 6.1 6.7 4.7"
                          />
                        </svg>
                      {:else}
                        <svg
                          class="h-4 w-4"
                          viewBox="0 0 20 20"
                          fill="none"
                          stroke="currentColor"
                          stroke-width="1.5"
                          aria-hidden="true"
                        >
                          <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            d="M15.5 4.5A7 7 0 1 0 17 10M17 10V5M17 10h-5"
                          />
                        </svg>
                      {/if}
                    </button>
                  {/if}
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>

      <p class={STATUS_TEXT}>{total} logged viewing{total === 1 ? "" : "s"}.</p>

      <div class="mt-2 flex items-center justify-end gap-2">
        <label
          class="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400"
          for="missing-data-page-size"
        >
          Results per page
          <select
            id="missing-data-page-size"
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
  {/if}
</div>
