<script lang="ts">
import { getPicklists, getViewing, listViewings, updateViewing } from "../lib/caldav/client";
import type { CaldavConfig, LoggedViewing } from "../lib/caldav/types";
import { exportFilename, exportViewingsToJson } from "../lib/movie-log/export-viewings";
import { importCheckRange } from "../lib/movie-log/run-import";
import { lookupByImdbId, lookupMovie, type OmdbCandidate, searchMovies } from "../lib/omdb/client";
// biome-ignore lint/correctness/noUnusedImports: used in the template below, which Biome does not parse for .svelte files
import { imdbUrl, letterboxdHref, rottenTomatoesSearchUrl } from "../lib/omdb/links";
import { hasOmdbMetadata } from "../lib/omdb/metadata";
import { splitMultiValue } from "../lib/omdb/multi-value";
import { buildOmdbPicker } from "../lib/omdb/picker";
// biome-ignore lint/correctness/noUnusedImports: used in the template below, which Biome does not parse for .svelte files
import {
	BUTTON_PRIMARY,
	BUTTON_SECONDARY,
	BUTTON_SM,
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
// biome-ignore lint/correctness/noUnusedImports: used in the template below, which Biome does not parse for .svelte files
import { formatPeriod } from "../lib/ui/datetime";

// calendar-overview spec: the main screen — every logged viewing with full
// metadata, filterable by date range and medium, scoped to the visitor's
// own calendar (their own stored credentials are the only config this ever
// reads, so "whose data" falls out of the credentials capability rather
// than anything this element does itself).
//
// #102/#97: the first vanilla-to-Svelte conversion under this project's
// "touch it for real work, convert it" rule — this component's own
// manual `this.render()`-after-every-mutation bookkeeping (the vanilla
// version this replaced) is exactly the class of code Svelte's runes
// remove, and this PR's actual feature (a busy spinner while a refresh
// is in flight) needed that reactivity to not be its own tangle of
// manual DOM toggling on top of the manual re-rendering.
const DEFAULT_RANGE_MONTHS_BACK = 3;
const DEFAULT_RANGE_YEARS_FORWARD = 1;
// #59: bounds how many rows render at once so the overview stays fast
// and scannable as the calendar grows, rather than rendering every
// viewing in the selected date range in one table.
const PAGE_SIZE = 25;

// #169: Title/When/Venue are sortable columns — Poster and Refresh
// aren't real data to sort by.
type SortKey = "title" | "when" | "venue";
// biome-ignore lint/correctness/noUnusedVariables: used in the template below, which Biome does not parse for .svelte files
const SORTABLE_COLUMNS: [SortKey, string][] = [
	["title", "Title"],
	["when", "When"],
	["venue", "Venue"],
];

interface Props {
	config: CaldavConfig;
	omdbApiKey?: string;
	omdbPaused?: boolean;
}
const { config, omdbApiKey, omdbPaused = false }: Props = $props();

// #80: a key alone isn't enough — a visitor can pause lookups to stay
// under OMDb's daily rate limit without clearing the stored key.
const omdbActive = $derived(Boolean(omdbApiKey) && !omdbPaused);

let allViewings = $state<LoggedViewing[]>([]);
// #140: the location-management picklist alone misses a medium that
// was only ever logged via the CLI, never typed into this app's own
// log form — same gap #116 fixed for the venues page's counts, here
// as the medium filter's autocomplete suggestions.
let mediumPicklist = $state<string[]>([]);
// biome-ignore lint/correctness/noUnusedVariables: read in the template below, which Biome does not parse for .svelte files
const mediumOptions = $derived.by(() => {
	const fromViewings = allViewings.map((v) => v.medium);
	return [...new Set([...mediumPicklist, ...fromViewings])].sort();
});
// biome-ignore lint/correctness/noUnusedVariables: read in the template below, which Biome does not parse for .svelte files
let statusText = $state("");
// Separate from statusText (the result count, rewritten on every
// reload) so a "Saved."/"Refreshed." confirmation isn't clobbered the
// instant the post-write reload runs — see the omdb-refresh tests for
// why this used to disappear before anyone could read it.
// biome-ignore lint/correctness/noUnusedVariables: read in the template below, which Biome does not parse for .svelte files
let actionStatusText = $state("");
// #131/#146: pre-populated from `venue`/`from`/`to` query params so a
// link from the venues page (or anywhere else) lands here already
// filtered to the same viewings, with the values visible and editable
// like any other filter field rather than a silent, unexplained
// restriction. Without `from`/`to` too, a venue's count (drawn from
// whatever range was active on the venues page — its own wide default,
// or a narrower one a visitor picked there) wouldn't match what shows
// up here, which otherwise defaults to a much narrower ~3-month window.
const initialParams = new URLSearchParams(location.search);
let fromValue = $state(initialParams.get("from") ?? "");
let toValue = $state(initialParams.get("to") ?? "");
let mediumValue = $state("");
let venueValue = $state(initialParams.get("venue") ?? "");
// #163: actor/genre are multi-value comma-separated OMDb fields, unlike
// venue/medium — matched against each individually split value, not
// the raw whole-string field, so a filter click always matches exactly
// the value a chip showed rather than a substring of the whole string.
let actorValue = $state(initialParams.get("actor") ?? "");
let genreValue = $state(initialParams.get("genre") ?? "");
// #169: defaults match the previous hardcoded "most recently watched
// first" behaviour — clicking a column header switches to sorting by
// it (ascending on first click), and clicking the same header again
// reverses direction.
let sortKey = $state<SortKey>("when");
let sortDirection = $state<"asc" | "desc">("desc");

// biome-ignore lint/correctness/noUnusedVariables: bound in the template below, which Biome does not parse for .svelte files
function handleSortClick(key: SortKey) {
	if (sortKey === key) {
		sortDirection = sortDirection === "asc" ? "desc" : "asc";
	} else {
		sortKey = key;
		sortDirection = "asc";
	}
}
let currentPage = $state(0);
// #97: which row (by uid) or whether the bulk control is mid-request —
// drives the spinner in place of the refresh icon and disables the
// triggering control so it can't be double-clicked mid-flight.
// biome-ignore lint/correctness/noUnusedVariables: read in the template below, which Biome does not parse for .svelte files
let refreshingUid = $state<string | null>(null);
// biome-ignore lint/correctness/noUnusedVariables: read in the template below, which Biome does not parse for .svelte files
let refreshingAll = $state(false);
let pickerArea = $state<HTMLDivElement | undefined>();

// Shared by currentPageItems and handleRefreshAll, so "refresh all"
// always acts on exactly what's currently on screen, not the
// unfiltered/unsorted full set.
const currentlyDisplayed = $derived.by(() => {
	const mediumFilter = mediumValue.trim().toLowerCase();
	const venueFilter = venueValue.trim().toLowerCase();
	const actorFilter = actorValue.trim().toLowerCase();
	const genreFilter = genreValue.trim().toLowerCase();
	const filtered = allViewings.filter((v) => {
		if (mediumFilter && v.medium.toLowerCase() !== mediumFilter) return false;
		if (venueFilter && (v.venue ?? "").toLowerCase() !== venueFilter) return false;
		if (
			actorFilter &&
			!splitMultiValue(v.actors).some((actor) => actor.toLowerCase() === actorFilter)
		)
			return false;
		if (
			genreFilter &&
			!splitMultiValue(v.genre).some((genre) => genre.toLowerCase() === genreFilter)
		)
			return false;
		return true;
	});
	// Re-sorted fresh every time rather than relying on insertion order,
	// since a filtered subset can change shape after every reload.
	const direction = sortDirection === "asc" ? 1 : -1;
	return [...filtered].sort((a, b) => {
		if (sortKey === "title") return a.title.localeCompare(b.title) * direction;
		if (sortKey === "venue") return (a.venue ?? "").localeCompare(b.venue ?? "") * direction;
		return (new Date(a.start).getTime() - new Date(b.start).getTime()) * direction;
	});
});
const total = $derived(currentlyDisplayed.length);
const pages = $derived(Math.max(1, Math.ceil(total / PAGE_SIZE)));
// #59: clamps a stale currentPage (a smaller reloaded set can leave it
// past the new last page) rather than rendering an empty page silently.
$effect(() => {
	if (currentPage > pages - 1) currentPage = pages - 1;
	if (currentPage < 0) currentPage = 0;
});
const currentPageItems = $derived.by(() => {
	const start = currentPage * PAGE_SIZE;
	return currentlyDisplayed.slice(start, start + PAGE_SIZE);
});
// #89: nothing to bulk-refresh once every title on this page already
// has matched metadata — hide the control rather than offer an action
// that would call OMDb for nobody.
// biome-ignore lint/correctness/noUnusedVariables: read in the template below, which Biome does not parse for .svelte files
const showRefreshAll = $derived(omdbActive && currentPageItems.some((v) => !hasOmdbMetadata(v)));

function currentRange() {
	const now = new Date();
	const defaultFrom = new Date(now);
	defaultFrom.setMonth(now.getMonth() - DEFAULT_RANGE_MONTHS_BACK);
	const defaultTo = new Date(now);
	defaultTo.setFullYear(now.getFullYear() + DEFAULT_RANGE_YEARS_FORWARD);

	const from = fromValue ? new Date(fromValue) : defaultFrom;
	const to = toValue ? new Date(toValue) : defaultTo;
	return { from: from.toISOString(), to: to.toISOString() };
}

async function reload() {
	statusText = "Loading…";
	try {
		allViewings = await listViewings(config, currentRange());
		statusText = `${total} logged viewing${total === 1 ? "" : "s"}.`;
	} catch (error) {
		statusText = error instanceof Error ? error.message : "Failed to load viewings.";
	}
}

// biome-ignore lint/correctness/noUnusedVariables: bound in the template below, which Biome does not parse for .svelte files
function handleFilterSubmit(event: SubmitEvent) {
	event.preventDefault();
	// #59: a new date range or medium filter is a new result set —
	// always reset to its first page rather than potentially landing
	// past its end.
	currentPage = 0;
	void reload();
}

// biome-ignore lint/correctness/noUnusedVariables: bound in the template below, which Biome does not parse for .svelte files
function handleClearFilter() {
	fromValue = "";
	toValue = "";
	mediumValue = "";
	venueValue = "";
	actorValue = "";
	genreValue = "";
	currentPage = 0;
	void reload();
}

// #69: the whole history, not the filtered/paginated set currently on
// screen — the calendar is the source of truth, so "export" means
// everything, the same wide range bulk-import's own duplicate check
// already queries, not whatever filter happens to be active here.
// biome-ignore lint/correctness/noUnusedVariables: bound in the template below, which Biome does not parse for .svelte files
async function handleExport() {
	actionStatusText = "Preparing export…";
	try {
		const all = await listViewings(config, importCheckRange());
		const blob = new Blob([exportViewingsToJson(all)], { type: "application/json" });
		const url = URL.createObjectURL(blob);
		const link = document.createElement("a");
		link.href = url;
		link.download = exportFilename(new Date());
		link.click();
		URL.revokeObjectURL(url);
		actionStatusText = `Exported ${all.length} viewing${all.length === 1 ? "" : "s"}.`;
	} catch (error) {
		actionStatusText = error instanceof Error ? error.message : "Failed to export.";
	}
}

// #37: re-runs the best-effort OMDb lookup against the viewing's
// stored title and overwrites the stored director/actors/ratings/
// genre/year/poster/imdbId with the new result — the corrective action
// for stale or since-updated OMDb data, now that those fields aren't
// hand-editable.
// biome-ignore lint/correctness/noUnusedVariables: bound in the template below, which Biome does not parse for .svelte files
async function handleRefresh(viewing: LoggedViewing) {
	if (!omdbActive || !omdbApiKey) return;
	refreshingUid = viewing.uid;
	try {
		// #91: re-check the calendar entry itself first — it may have
		// been matched elsewhere (the CLI's own sync, another tab/device)
		// since this list was loaded, and only what's still actually
		// missing from it should ever reach OMDb. Everything below reads
		// and writes on top of this fresh copy, not the possibly-stale
		// `viewing` argument.
		const current = (await getViewing(config, viewing.uid)) ?? viewing;
		if (hasOmdbMetadata(current)) {
			await reload();
			actionStatusText = "Already up to date.";
			return;
		}
		const metadata = await lookupMovie(
			omdbApiKey,
			current.title,
			new Date(current.start).getFullYear().toString(),
		);
		if (metadata) {
			await updateViewing(config, current.uid, { ...current, ...metadata });
			await reload();
			actionStatusText = "Refreshed.";
			return;
		}
		// #49: no single confident match — offer a disambiguation picker
		// if OMDb's search has candidates, rather than reporting no match
		// outright.
		const candidates = await searchMovies(omdbApiKey, current.title);
		if (candidates.length > 0) {
			showOmdbPicker(current, candidates);
			return;
		}
		actionStatusText = "OMDb had no match for this title.";
	} catch (error) {
		actionStatusText = error instanceof Error ? error.message : "Failed to refresh metadata.";
	} finally {
		refreshingUid = null;
	}
}

function showOmdbPicker(viewing: LoggedViewing, candidates: OmdbCandidate[]) {
	if (!pickerArea || !omdbApiKey) return;
	pickerArea.replaceChildren(
		buildOmdbPicker(
			candidates,
			async (candidate) => {
				if (!omdbApiKey || !pickerArea) return;
				try {
					const metadata = await lookupByImdbId(omdbApiKey, candidate.imdbId);
					if (metadata) {
						await updateViewing(config, viewing.uid, { ...viewing, ...metadata });
					}
					await reload();
					actionStatusText = "Refreshed.";
				} catch (error) {
					actionStatusText =
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

// Runs the same per-row refresh across every viewing currently on
// screen (#59: the current page of the filtered/sorted set, not the
// whole calendar or even the whole filtered result) — sequential
// rather than parallel, since it's hitting OMDb's own rate limits, not
// just this app's. #89: skips anything that already has matched
// metadata (an imdbId) — the calendar entry is the source of truth
// once it's been matched, so a bulk refresh doesn't spend quota
// re-confirming it.
// biome-ignore lint/correctness/noUnusedVariables: bound in the template below, which Biome does not parse for .svelte files
async function handleRefreshAll() {
	if (!omdbActive || !omdbApiKey) return;
	const targets = currentPageItems.filter((v) => !hasOmdbMetadata(v));
	if (targets.length === 0) return;

	refreshingAll = true;
	actionStatusText = `Refreshing 0 of ${targets.length}…`;
	let refreshed = 0;
	let misses = 0;
	try {
		for (const viewing of targets) {
			try {
				const metadata = await lookupMovie(
					omdbApiKey,
					viewing.title,
					new Date(viewing.start).getFullYear().toString(),
				);
				if (metadata) {
					await updateViewing(config, viewing.uid, { ...viewing, ...metadata });
					refreshed++;
				} else {
					misses++;
				}
			} catch {
				misses++;
			}
			actionStatusText = `Refreshing ${refreshed + misses} of ${targets.length}…`;
		}

		await reload();
		actionStatusText =
			misses > 0
				? `Refreshed ${refreshed} of ${targets.length} (${misses} had no OMDb match or failed).`
				: `Refreshed ${refreshed} of ${targets.length}.`;
	} finally {
		refreshingAll = false;
	}
}

reload();
getPicklists(config).then((picklists) => {
	mediumPicklist = picklists.media;
});
</script>

<div class="flex flex-col gap-4">
  <form
    class="flex flex-wrap items-end gap-3"
    aria-label="Filter logged viewings"
    onsubmit={handleFilterSubmit}
  >
    <label class={FIELD_WRAPPER} for="overview-from">
      <span class={LABEL}>From</span>
      <input class={INPUT} type="date" id="overview-from" bind:value={fromValue} />
    </label>
    <label class={FIELD_WRAPPER} for="overview-to">
      <span class={LABEL}>To</span>
      <input class={INPUT} type="date" id="overview-to" bind:value={toValue} />
    </label>
    <label class={FIELD_WRAPPER} for="overview-medium">
      <span class={LABEL}>Medium</span>
      <input
        class={INPUT}
        type="text"
        id="overview-medium"
        placeholder="e.g. cinema"
        list="overview-medium-choices"
        bind:value={mediumValue}
      />
      <datalist id="overview-medium-choices">
        {#each mediumOptions as medium (medium)}
          <option value={medium}></option>
        {/each}
      </datalist>
    </label>
    <label class={FIELD_WRAPPER} for="overview-venue">
      <span class={LABEL}>Venue</span>
      <input
        class={INPUT}
        type="text"
        id="overview-venue"
        placeholder="e.g. Grand Vista Cinema"
        bind:value={venueValue}
      />
    </label>
    <label class={FIELD_WRAPPER} for="overview-actor">
      <span class={LABEL}>Actor</span>
      <input
        class={INPUT}
        type="text"
        id="overview-actor"
        placeholder="e.g. Zendaya"
        bind:value={actorValue}
      />
    </label>
    <label class={FIELD_WRAPPER} for="overview-genre">
      <span class={LABEL}>Genre</span>
      <input
        class={INPUT}
        type="text"
        id="overview-genre"
        placeholder="e.g. Drama"
        bind:value={genreValue}
      />
    </label>
    <button type="submit" class={BUTTON_PRIMARY}>Filter</button>
    <button type="button" class={BUTTON_SECONDARY} onclick={handleClearFilter}>
      Clear filter
    </button>
  </form>

  <div class="flex flex-wrap items-center gap-3">
    <button type="button" class={BUTTON_SECONDARY} onclick={handleExport}>
      Export as JSON
    </button>
    <p class={STATUS_TEXT}>
      Downloads your whole watch history, not just what's filtered or shown here — including
      poster, ratings and every other OMDb-derived field.
    </p>
  </div>

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
    <p class={STATUS_TEXT}>
      Only touches titles missing metadata — the calendar entry is the source of truth once a
      title's matched.
    </p>
  {/if}

  <p class={STATUS_TEXT} role="status">{statusText}</p>
  <p class={STATUS_TEXT} role="status">{actionStatusText}</p>
  <div bind:this={pickerArea}></div>

  {#if total > 0}
    <div class={TABLE_WRAP}>
      <table class={TABLE}>
        <thead class="bg-slate-50 dark:bg-slate-900/40">
          <tr>
            <!-- #93: Medium dropped, Start/End merged into one "When"
            column, and "Actions" (Edit/Delete/Refresh) reduced to
            "Refresh" — editing and deleting now live only on the
            movie-details page. #169: Title/When/Venue are sortable —
            Poster and Refresh aren't real data columns to sort by. -->
            <th class={TH} scope="col">Poster</th>
            {#each SORTABLE_COLUMNS as [key, heading] (key)}
              <th class={TH} scope="col">
                <button
                  type="button"
                  class="flex items-center gap-1 font-semibold"
                  onclick={() => handleSortClick(key)}
                >
                  {heading}
                  {#if sortKey === key}
                    <span aria-hidden="true">{sortDirection === "asc" ? "▲" : "▼"}</span>
                  {/if}
                </button>
              </th>
            {/each}
            <th class={TH} scope="col">Refresh</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-200 dark:divide-slate-700">
          {#each currentPageItems as viewing (viewing.uid)}
            {@const links = [
              viewing.imdbId ? { label: 'IMDb', href: imdbUrl(viewing.imdbId) } : null,
              { label: 'RT', href: rottenTomatoesSearchUrl(viewing.title) },
              { label: 'Letterboxd', href: letterboxdHref(viewing) },
            ].filter((l) => l !== null)}
            {@const isRefreshing = refreshingUid === viewing.uid}
            <tr class={TR_BODY} aria-busy={isRefreshing}>
              <td class={TD}>
                {#if viewing.posterUrl}
                  <!-- #64: a UX audit flagged the previous h-16 (64px)
                  thumbnail as too small to recognize a poster by — this
                  is double that. #76: an explicit fixed width plus
                  max-w-none — w-auto or aspect-* alone still leave the
                  image's effective width capped by Tailwind Preflight's
                  `img { max-width: 100% }` against whatever the table's
                  own column layout assigns. #133: wrapped in the same
                  details-page link the title uses — the image's own alt
                  text ("<title> poster") gives this link a distinct
                  accessible name from the title link right next to it. -->
                  <a href={`/movie?uid=${encodeURIComponent(viewing.uid)}`}>
                    <img
                      src={viewing.posterUrl}
                      alt={`${viewing.title} poster`}
                      class="h-32 w-20 max-w-none rounded object-cover shadow-sm"
                      loading="lazy"
                    />
                  </a>
                {/if}
              </td>
              <td class={TD}>
                <!-- #38: the details page — a query-string ?uid=, not a
                dynamic /movie/[uid] route, since this build is fully
                static (no getStaticPaths could ever know a visitor's
                own private CalDAV UIDs at build time). -->
                <a
                  href={`/movie?uid=${encodeURIComponent(viewing.uid)}`}
                  class="font-medium text-indigo-600 hover:underline dark:text-indigo-400"
                >
                  {viewing.year ? `${viewing.title} (${viewing.year})` : viewing.title}
                </a>
                {#if links.length > 0}
                  <div class="mt-1 flex gap-2 text-xs">
                    {#each links as link (link.label)}
                      <a
                        href={link.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        class="text-indigo-600 hover:underline dark:text-indigo-400"
                      >
                        {link.label}
                      </a>
                    {/each}
                  </div>
                {/if}
              </td>
              <!-- #93: Medium dropped, and Start/End merged into one
              "When" cell — director/actors/genre/ratings already live
              on the details page (#38, one click away via the title
              link) rather than as their own columns here; keeping this
              table to a fixed, narrow column count is what lets it fit
              a phone screen without horizontal scroll. -->
              <td class={TD}>{formatPeriod(viewing.start, viewing.end)}</td>
              <td class={TD}>{viewing.venue ?? ""}</td>
              <!-- #93: editing and deleting now live only on the
              movie-details page (its own independent edit form/delete
              button, unaffected by this) — this cell is refresh-only,
              and empty when refresh isn't offered (#37: only once an
              OMDb key is active — #89's "skip already matched" rule is
              deliberately scoped to bulk refresh only, not this
              single-row control, which stays the way to correct a
              title whose match went stale or wrong). -->
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

    <!-- #59: only rendered once there's a second page to reach — a
    single page needs no "Page 1 of 1" chrome. -->
    {#if pages > 1}
      <div class="mt-2 flex items-center justify-center gap-3" aria-label="Pagination">
        <button
          type="button"
          class={BUTTON_SM}
          disabled={currentPage === 0}
          onclick={() => (currentPage -= 1)}
        >
          Previous page
        </button>
        <span class={STATUS_TEXT}>Page {currentPage + 1} of {pages}</span>
        <button
          type="button"
          class={BUTTON_SM}
          disabled={currentPage >= pages - 1}
          onclick={() => (currentPage += 1)}
        >
          Next page
        </button>
      </div>
    {/if}
  {/if}
</div>
