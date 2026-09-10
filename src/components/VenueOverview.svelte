<script lang="ts">
import { listViewings } from "../lib/caldav/client";
import type { CaldavConfig, LoggedViewing } from "../lib/caldav/types";
import { getCredentialsStore } from "../lib/credentials/store";
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
import { venueDisplay } from "../lib/venue/display";
// biome-ignore lint/correctness/noUnusedImports: used in the template below, which Biome does not parse for .svelte files
import ErrorToast from "./ErrorToast.svelte";
// biome-ignore lint/correctness/noUnusedImports: used in the template below, which Biome does not parse for .svelte files
import PosterPlaceholder from "./PosterPlaceholder.svelte";
// biome-ignore lint/correctness/noUnusedImports: used in the template below, which Biome does not parse for .svelte files
import VenueMap, { type MapPin } from "./VenueMap.svelte";

// #448: a dedicated, filter-free view of one venue's own viewings —
// its own small component rather than a "hide the filters" mode
// threaded through CalendarOverview.svelte, the same call SharedOverview
// (#335) already made for the same reason: this page never offers a
// way to change what it's filtered to, so there's a much smaller
// subset of the overview's own display concerns to reproduce here.
// Reuses (rather than re-derives) the overview's own pagination
// (lib/ui/pagination.ts), map (VenueMap.svelte), venue-name trimming
// (venueDisplay), and date/time formatting (lib/ui/datetime.ts).
//
// The venue itself comes from the `venue` query string param — the
// same full, raw value venueHref (VenuesOverview.svelte) already
// links with, not the trimmed display name — read once, on mount,
// and never changed: there is deliberately no UI anywhere on this
// page to alter or clear it. Same reasoning as MovieDetails.svelte's
// own `?uid=` — a literal `/venue/<id>` path isn't possible since this
// app is fully static and venue names are private, visitor-specific
// data unknowable at build time.
const venue = new URLSearchParams(location.search).get("venue") ?? "";

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

// #123/#446: the visitor's whole history, same wide window
// bulk-import's own duplicate check and the Venues page already use —
// there's no From/To filter on this page to narrow it further.
const venueLower = venue.trim().toLowerCase();
const viewings = $derived.by(() => {
	const matched = allViewings.filter((v) => (v.venue ?? "").trim().toLowerCase() === venueLower);
	return [...matched].sort((a, b) => new Date(b.start).getTime() - new Date(a.start).getTime());
});
const total = $derived(viewings.length);
// #440: trimmed to name + known city, same rule the overview/venues
// tables already follow — the city comes from whichever matched
// viewing happens to carry one, same "first one that has it" rule
// VenuesOverview.svelte's own per-venue city already uses, not the
// raw venue string itself.
const trimmedVenue = $derived(venueDisplay(venue || undefined, viewings.find((v) => v.city)?.city));
// #534: the page <title> is set at build time (venue.astro's Layout
// prop, "Movie Planner") — this is the client-side update on top of
// that default, same pattern CalendarOverview.svelte's own
// DEFAULT_TITLE/$effect already uses for its filter label.
const DEFAULT_TITLE = document.title;

// #375: broadcasts the venue's trimmed display name the same way
// CalendarOverview.svelte's own chip-driven filter label already does
// (#375/#376), so site-breadcrumb.ts's existing dynamic-segment
// mechanism shows it without needing any per-venue awareness of its
// own. A blank/unmatched venue broadcasts nothing, leaving whatever
// static "Venues" label site-breadcrumb.ts already shows for this
// page in place.
$effect(() => {
	if (trimmedVenue) {
		window.dispatchEvent(new CustomEvent(ACTIVE_FILTER_LABEL_EVENT, { detail: trimmedVenue }));
		document.title = `${trimmedVenue} — Venues — Movie Planner`;
	} else {
		document.title = DEFAULT_TITLE;
	}
});
const pages = $derived(Math.max(1, Math.ceil(total / pageSize)));
// #59: clamps a stale currentPage (a smaller reloaded set, or a larger
// page size, can leave it past the new last page) rather than
// rendering an empty page silently.
$effect(() => {
	if (currentPage > pages - 1) currentPage = pages - 1;
	if (currentPage < 0) currentPage = 0;
});
const currentPageItems = $derived.by(() => {
	const start = currentPage * pageSize;
	return viewings.slice(start, start + pageSize);
});
// #358: every viewing on the current page with known coordinates —
// same page-scoped rule CalendarOverview.svelte's own map already
// follows, so this never shows a pin for a viewing that isn't in the
// rows below it.
// biome-ignore lint/correctness/noUnusedVariables: read in the template below, which Biome does not parse for .svelte files
const mapPins = $derived.by((): MapPin[] =>
	currentPageItems
		.filter((v): v is LoggedViewing & { geo: { lat: number; lon: number } } => Boolean(v.geo))
		.map((v) => ({
			lat: v.geo.lat,
			lon: v.geo.lon,
			label: v.year ? `${v.title} (${v.year})` : v.title,
			href: movieHref(v.uid, { from: location.pathname + location.search }),
			posterUrl: v.posterUrl,
		})),
);
// biome-ignore lint/correctness/noUnusedVariables: read in the template below, which Biome does not parse for .svelte files
const pageNumbers = $derived(computePageNumbers(currentPage, pages));

// biome-ignore lint/correctness/noUnusedVariables: bound in the template below, which Biome does not parse for .svelte files
function handlePageSizeChange(event: Event) {
	pageSize = Number((event.target as HTMLSelectElement).value);
	currentPage = 0;
}

// Gates the count line, map and table — false both before credentials
// are known to exist and while a load has failed, so "Connect first…"
// or the error toast stands alone rather than sitting next to a
// confusing "0 logged viewings." underneath it. True once a load has
// actually succeeded, including a zero-result one — that's the
// unmatched-venue empty state the acceptance criteria calls for.
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
		status = "Connect first to see this venue.";
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
		// Superseded by a newer load — the newer call's own catch/success
		// block is what should actually update status now, not this one.
		if (error instanceof DOMException && error.name === "AbortError") return;
		status = "";
		loadError = error instanceof Error ? error.message : "Failed to load viewings.";
	}
}

load();
// #223: same bfcache-restore gap as every other page reading live
// CalDAV data — see CalendarOverview.svelte's own call for why.
reloadOnBfcacheRestore(() => void load());
</script>

<div class="flex flex-col gap-4">
  <h1 class="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
    {trimmedVenue || "Venue"}
  </h1>
  <p class={STATUS_TEXT} role="status">{status}</p>
  {#if loadError}
    <ErrorToast message={loadError} onDismiss={() => (loadError = "")} />
  {/if}

  {#if hasLoaded}
    {#if mapPins.length > 0}
      <div>
        <h2 class="mb-2 text-sm font-semibold text-slate-700 dark:text-slate-300">Map</h2>
        <VenueMap pins={mapPins} />
      </div>
    {/if}

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
        for="venue-page-size"
      >
        Results per page
        <select id="venue-page-size" class={INPUT} value={pageSize} onchange={handlePageSizeChange}>
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
