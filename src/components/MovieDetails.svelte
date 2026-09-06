<script lang="ts">
import {
	deleteViewing,
	getPicklists,
	getViewing,
	listViewings,
	updateViewing,
} from "../lib/caldav/client";
import type { CaldavConfig, LoggedViewing, NewViewing } from "../lib/caldav/types";
import { getCredentialsStore } from "../lib/credentials/store";
// biome-ignore lint/correctness/noUnusedImports: used in the template below, which Biome does not parse for .svelte files
import { openStreetMapUrl } from "../lib/geo/links";
import { type GeoCandidate, searchAddress } from "../lib/geo/nominatim";
import { findKnownGeo } from "../lib/geo/reuse";
import { importCheckRange } from "../lib/movie-log/run-import";
import { lookupByImdbId, lookupMovie, type OmdbCandidate, searchMovies } from "../lib/omdb/client";
// biome-ignore lint/correctness/noUnusedImports: used in the template below, which Biome does not parse for .svelte files
import { imdbUrl, letterboxdHref, rottenTomatoesSearchUrl } from "../lib/omdb/links";
import { hasOmdbMetadata } from "../lib/omdb/metadata";
// biome-ignore lint/correctness/noUnusedImports: used in the template below, which Biome does not parse for .svelte files
import { splitMultiValue } from "../lib/omdb/multi-value";
import { buildOmdbPicker } from "../lib/omdb/picker";
import { reloadOnBfcacheRestore } from "../lib/ui/bfcache";
// biome-ignore lint/correctness/noUnusedImports: used in the template below, which Biome does not parse for .svelte files
import {
	BUTTON_PRIMARY,
	BUTTON_SECONDARY,
	BUTTON_SM,
	DD,
	DL,
	DT,
	FIELD_WRAPPER,
	INPUT,
	LABEL,
	STATUS_TEXT,
} from "../lib/ui/classes";
// biome-ignore lint/correctness/noUnusedImports: used in the template below, which Biome does not parse for .svelte files
import { computeBlockedTimeBar, formatDateTime } from "../lib/ui/datetime";
import { debounce } from "../lib/ui/debounce";
// biome-ignore lint/correctness/noUnusedImports: used in the template below, which Biome does not parse for .svelte files
import IconImdb from "./icons/IconImdb.svelte";
// biome-ignore lint/correctness/noUnusedImports: used in the template below, which Biome does not parse for .svelte files
import IconLetterboxd from "./icons/IconLetterboxd.svelte";
// biome-ignore lint/correctness/noUnusedImports: used in the template below, which Biome does not parse for .svelte files
import IconRottenTomatoes from "./icons/IconRottenTomatoes.svelte";
// biome-ignore lint/correctness/noUnusedImports: used in the template below, which Biome does not parse for .svelte files
import PosterPlaceholder from "./PosterPlaceholder.svelte";
// biome-ignore lint/correctness/noUnusedImports: used in the template below, which Biome does not parse for .svelte files
import VenueMap from "./VenueMap.svelte";

// #38: a dedicated page per logged viewing, reached from the overview's
// title link — see CalendarOverview.svelte's own comment for why this is
// a ?uid= query string rather than a dynamic /movie/[uid] route (this
// build is fully static; a visitor's own private CalDAV UIDs can't be
// known at build time for getStaticPaths to enumerate).
//
// #105: converted to Svelte alongside adding notes support, per this
// project's "touch it for real work, convert it" rule — see
// CalendarOverview.svelte's own note on why.

const EDITABLE_FIELDS: { key: keyof NewViewing; label: string; type: string }[] = [
	{ key: "title", label: "Title", type: "text" },
	{ key: "start", label: "Start", type: "datetime-local" },
	{ key: "end", label: "End", type: "datetime-local" },
	{ key: "medium", label: "Medium", type: "text" },
	{ key: "venue", label: "Venue", type: "text" },
];

function toDatetimeLocal(iso: string): string {
	const date = new Date(iso);
	const pad = (n: number) => String(n).padStart(2, "0");
	return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

let config = $state<CaldavConfig | undefined>();
let omdbApiKey = $state<string | undefined>();
let omdbPaused = $state(false);
// #80: a key alone isn't enough — a visitor can pause lookups to stay
// under OMDb's daily rate limit without clearing the stored key.
const omdbActive = $derived(Boolean(omdbApiKey) && !omdbPaused);

let viewing = $state<LoggedViewing | undefined>();
// Distinct from `viewing` being unset before the first load resolves —
// notFound is only ever set once a load has genuinely come back empty
// (no uid in the URL, or a uid that doesn't resolve).
// biome-ignore lint/correctness/noUnusedVariables: read in the template below, which Biome does not parse for .svelte files
let notFound = $state(false);
// biome-ignore lint/correctness/noUnusedVariables: read in the template below, which Biome does not parse for .svelte files
let editing = $state(false);
// biome-ignore lint/correctness/noUnusedVariables: read in the template below, which Biome does not parse for .svelte files
let statusText = $state("");
// #98: the same venue suggestions the log form already offers
// (location-management's own picklist), so editing a viewing doesn't
// mean retyping an exact venue name used before.
// biome-ignore lint/correctness/noUnusedVariables: read in the template below, which Biome does not parse for .svelte files
let venues = $state<string[]>([]);
let pickerArea = $state<HTMLDivElement | undefined>();
// biome-ignore lint/correctness/noUnusedVariables: read in the template below, which Biome does not parse for .svelte files
let showingPicker = $state(false);
// #311: unlike "Refresh metadata" (best-effort, skips a viewing that
// already has any OMDb match at all), this always lets a visitor
// search — fixing a wrong match, or attaching one manually when
// nothing was found automatically.
// biome-ignore lint/correctness/noUnusedVariables: bound in the template below, which Biome does not parse for .svelte files
let searchingOmdb = $state(false);
let omdbSearchQuery = $state("");
let editValues = $state<Record<string, string>>({});

// #8/#203: same reuse-vs-search coordinate entry as the log form
// (LogViewingForm.svelte's own identical shape) — a lightweight
// wide-range query purely to back findKnownGeo's reuse lookup, same
// range Venues/heatmap/the log form already use.
let allViewings = $state<LoggedViewing[]>([]);
let editGeoQuery = $state("");
// biome-ignore lint/correctness/noUnusedVariables: read in the template below, which Biome does not parse for .svelte files
let editGeoCandidates = $state<GeoCandidate[]>([]);
// biome-ignore lint/correctness/noUnusedVariables: read in the template below, which Biome does not parse for .svelte files
let editGeoSearching = $state(false);
let chosenEditGeo = $state<{ lat: number; lon: number } | undefined>();
// biome-ignore lint/correctness/noUnusedVariables: read in the template below, which Biome does not parse for .svelte files
let chosenEditGeoLabel = $state("");
let chosenEditGeoFor = $state("");

const editKnownGeo = $derived(
	editValues.venue ? findKnownGeo(editValues.venue, allViewings) : undefined,
);
const editGeo = $derived(
	editKnownGeo ?? (chosenEditGeoFor === editValues.venue ? chosenEditGeo : undefined),
);

const runEditGeoSearch = debounce(async (query: string) => {
	if (!query.trim()) {
		editGeoCandidates = [];
		editGeoSearching = false;
		return;
	}
	editGeoSearching = true;
	editGeoCandidates = await searchAddress(query);
	editGeoSearching = false;
}, 400);

// biome-ignore lint/correctness/noUnusedVariables: bound in the template below, which Biome does not parse for .svelte files
function onEditGeoQueryInput() {
	runEditGeoSearch(editGeoQuery);
}

// biome-ignore lint/correctness/noUnusedVariables: bound in the template below, which Biome does not parse for .svelte files
function chooseEditGeo(candidate: GeoCandidate) {
	chosenEditGeo = { lat: candidate.lat, lon: candidate.lon };
	chosenEditGeoLabel = candidate.label;
	chosenEditGeoFor = editValues.venue ?? "";
	editGeoCandidates = [];
	editGeoQuery = "";
}

function startEdit(current: LoggedViewing) {
	editValues = Object.fromEntries(
		EDITABLE_FIELDS.map((field) => {
			const value = current[field.key];
			return [
				field.key,
				field.type === "datetime-local" ? toDatetimeLocal(String(value)) : (value ?? ""),
			];
		}),
	);
	chosenEditGeo = undefined;
	chosenEditGeoFor = "";
	editGeoQuery = "";
	editGeoCandidates = [];
	editing = true;
}

async function load() {
	if (!config) return;
	const uid = new URLSearchParams(location.search).get("uid");
	if (!uid) {
		notFound = true;
		return;
	}
	try {
		viewing = (await getViewing(config, uid)) ?? undefined;
	} catch {
		viewing = undefined;
	}
	notFound = !viewing;
	editing = false;
	showingPicker = false;
}

// #98: best-effort — a picklist fetch failure shouldn't block viewing or
// editing the page, same spirit as OMDb enrichment failing soft
// elsewhere in this app.
async function loadVenueSuggestions() {
	if (!config) return;
	try {
		const { venues: fetched } = await getPicklists(config);
		venues = fetched;
	} catch {
		// Suggestions just stay empty; free-text entry still works.
	}
}

// biome-ignore lint/correctness/noUnusedVariables: bound in the template below, which Biome does not parse for .svelte files
async function handleSave(current: LoggedViewing) {
	if (!config) return;
	const updated: NewViewing = {
		...current,
		title: editValues.title ?? "",
		start: new Date(editValues.start ?? "").toISOString(),
		end: new Date(editValues.end ?? "").toISOString(),
		medium: editValues.medium ?? "",
		venue: editValues.venue || undefined,
		geo: editGeo,
	};
	try {
		await updateViewing(config, current.uid, updated);
		await load();
		statusText = "Saved.";
	} catch (error) {
		statusText = error instanceof Error ? error.message : "Failed to save.";
	}
}

// biome-ignore lint/correctness/noUnusedVariables: bound in the template below, which Biome does not parse for .svelte files
async function handleRefresh(current: LoggedViewing) {
	if (!config || !omdbActive || !omdbApiKey) return;
	try {
		// #91: re-check the calendar entry itself first — it may have been
		// matched elsewhere (the CLI's own sync, another tab/device) since
		// this page loaded, and only what's still actually missing from it
		// should ever reach OMDb. Everything below reads and writes on top
		// of this fresh copy, not the possibly-stale argument.
		const fresh = (await getViewing(config, current.uid)) ?? current;
		if (hasOmdbMetadata(fresh)) {
			await load();
			statusText = "Already up to date.";
			return;
		}
		const metadata = await lookupMovie(
			omdbApiKey,
			fresh.title,
			new Date(fresh.start).getFullYear().toString(),
		);
		if (metadata) {
			await updateViewing(config, fresh.uid, { ...fresh, ...metadata });
			await load();
			statusText = "Refreshed.";
			return;
		}
		// #49: no single confident match — offer a disambiguation picker if
		// OMDb's search has candidates, rather than reporting no match
		// outright.
		const candidates = await searchMovies(omdbApiKey, fresh.title);
		if (candidates.length > 0) {
			showOmdbPicker(fresh, candidates);
			return;
		}
		statusText = "OMDb had no match for this title.";
	} catch (error) {
		statusText = error instanceof Error ? error.message : "Failed to refresh metadata.";
	}
}

function showOmdbPicker(current: LoggedViewing, candidates: OmdbCandidate[]) {
	if (!pickerArea || !config || !omdbApiKey) return;
	showingPicker = true;
	pickerArea.replaceChildren(
		buildOmdbPicker(
			candidates,
			async (candidate) => {
				if (!config || !omdbApiKey) return;
				try {
					const metadata = await lookupByImdbId(omdbApiKey, candidate.imdbId);
					if (metadata) {
						await updateViewing(config, current.uid, { ...current, ...metadata });
					}
					await load();
					statusText = "Refreshed.";
				} catch (error) {
					statusText =
						error instanceof Error ? error.message : "Failed to attach the selected match.";
				} finally {
					showingPicker = false;
					pickerArea?.replaceChildren();
				}
			},
			() => {
				showingPicker = false;
				pickerArea?.replaceChildren();
				statusText = "OMDb had no match for this title.";
			},
		),
	);
}

// biome-ignore lint/correctness/noUnusedVariables: bound in the template below, which Biome does not parse for .svelte files
function startOmdbSearch(current: LoggedViewing) {
	omdbSearchQuery = current.title;
	searchingOmdb = true;
}

// biome-ignore lint/correctness/noUnusedVariables: bound in the template below, which Biome does not parse for .svelte files
async function submitOmdbSearch(current: LoggedViewing, event: SubmitEvent) {
	event.preventDefault();
	if (!omdbApiKey || !omdbSearchQuery.trim()) return;
	searchingOmdb = false;
	try {
		const candidates = await searchMovies(omdbApiKey, omdbSearchQuery.trim());
		if (candidates.length > 0) {
			// #311: reuses the same picker/selection flow "Refresh metadata"
			// already uses — picking a result overwrites every OMDb-derived
			// field (poster included) via lookupByImdbId, regardless of
			// whether this viewing already had a (possibly wrong) match.
			showOmdbPicker(current, candidates);
		} else {
			statusText = "OMDb had no match for that search.";
		}
	} catch (error) {
		statusText = error instanceof Error ? error.message : "Failed to search OMDb.";
	}
}

// biome-ignore lint/correctness/noUnusedVariables: bound in the template below, which Biome does not parse for .svelte files
async function handleDelete(current: LoggedViewing) {
	if (!config) return;
	if (!window.confirm(`Delete "${current.title}"? This can't be undone.`)) return;
	try {
		await deleteViewing(config, current.uid);
		statusText = "Deleted.";
		viewing = undefined;
	} catch (error) {
		statusText = error instanceof Error ? error.message : "Failed to delete.";
	}
}

async function init() {
	const credentials = await getCredentialsStore().get();
	if (!credentials) {
		throw new Error("<movie-details> requires stored credentials");
	}
	config = {
		baseUrl: credentials.caldavUrl,
		username: credentials.caldavUsername,
		password: credentials.caldavPassword,
	};
	omdbApiKey = credentials.omdbApiKey;
	omdbPaused = credentials.omdbPaused ?? false;
	await load();
	// #298: the overview's own Edit icon links straight here with
	// ?edit=1 rather than making a visitor land on the plain view and
	// click Edit a second time.
	if (viewing && new URLSearchParams(location.search).get("edit")) {
		startEdit(viewing);
	}
	await loadVenueSuggestions();
	try {
		allViewings = await listViewings(config, importCheckRange());
	} catch {
		// The geo reuse lookup just finds nothing; the address-search
		// field still works.
	}
}

init();
// #223: see CalendarOverview.svelte's own reloadOnBfcacheRestore call —
// load() alone (not init(), which would redundantly redo credential
// and picklist setup) is enough once config is already set.
reloadOnBfcacheRestore(() => void load());
</script>

<div class="flex flex-col gap-4">
  <a href="/" class="text-sm text-indigo-600 hover:underline dark:text-indigo-400">
    Back to overview
  </a>

  {#if notFound}
    <p class="text-slate-700 dark:text-slate-300">Viewing not found.</p>
  {:else if viewing && !showingPicker}
    {#if editing}
      <form class="mt-4 flex flex-col gap-4" aria-label="Edit this viewing">
        <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {#each EDITABLE_FIELDS as field (field.key)}
            <label class={FIELD_WRAPPER} for={`details-${field.key}`}>
              <span class={LABEL}>{field.label}</span>
              <input
                class={INPUT}
                id={`details-${field.key}`}
                type={field.type}
                list={field.key === "venue" ? "details-venue-choices" : undefined}
                bind:value={editValues[field.key]}
              />
            </label>
            {#if field.key === "venue"}
              {#if editValues.venue && editKnownGeo}
                <p class={`${STATUS_TEXT} sm:col-span-2`}>
                  Using {editValues.venue}'s known location.
                </p>
              {:else if editValues.venue}
                <div
                  class="flex flex-col gap-2 rounded-lg bg-slate-50 p-3 sm:col-span-2 dark:bg-slate-900/40"
                >
                  <label class={LABEL} for="details-geo-search">
                    Search for "{editValues.venue}"'s address (optional)
                  </label>
                  <input
                    class={INPUT}
                    id="details-geo-search"
                    type="text"
                    placeholder="Address or venue name"
                    bind:value={editGeoQuery}
                    oninput={onEditGeoQueryInput}
                  />
                  {#if editGeoSearching}
                    <p class={STATUS_TEXT}>Searching…</p>
                  {/if}
                  {#if editGeoCandidates.length > 0}
                    <ul class="flex flex-col gap-1">
                      {#each editGeoCandidates as candidate (candidate.label)}
                        <li>
                          <button
                            type="button"
                            class="text-left text-sm text-indigo-600 hover:underline dark:text-indigo-400"
                            onclick={() => chooseEditGeo(candidate)}
                          >
                            {candidate.label}
                          </button>
                        </li>
                      {/each}
                    </ul>
                  {/if}
                  {#if chosenEditGeoFor === editValues.venue && chosenEditGeo}
                    <p class={STATUS_TEXT}>Location set: {chosenEditGeoLabel}</p>
                  {/if}
                </div>
              {/if}
            {/if}
          {/each}
        </div>
        <div class="flex gap-2">
          <button type="button" class={BUTTON_PRIMARY} onclick={() => handleSave(viewing)}>
            Save
          </button>
          <button type="button" class={BUTTON_SECONDARY} onclick={() => (editing = false)}>
            Cancel
          </button>
        </div>
      </form>
    {:else}
      <!-- #153: RT never has a real per-title ID (OMDb exposes no such
      thing), so its link always reads as a plain search — but IMDb and
      Letterboxd normally look like a confirmed match, and without a
      gap indicator there's no way to tell that one from a constructed
      search guessing off the title alone. -->
      {@const links = [
        viewing.imdbId
          ? { label: 'IMDb', href: imdbUrl(viewing.imdbId), icon: IconImdb }
          : { label: 'IMDb not linked', href: undefined, icon: null },
        { label: 'RT', href: rottenTomatoesSearchUrl(viewing.title), icon: IconRottenTomatoes },
        {
          label: viewing.letterboxdUrl ? 'Letterboxd' : 'Letterboxd (search)',
          href: letterboxdHref(viewing),
          icon: IconLetterboxd,
        },
      ]}
      <!-- #163: each rating source as its own small badge rather than
      one comma-joined string — lets a visitor scan for the source they
      trust instead of parsing a run-on sentence. -->
      {@const ratings = [
        viewing.ratingImdb && `IMDb ${viewing.ratingImdb}`,
        viewing.ratingRottenTomatoes && `RT ${viewing.ratingRottenTomatoes}`,
        viewing.ratingMetacritic && `Metacritic ${viewing.ratingMetacritic}`,
        viewing.letterboxdRating && `Letterboxd ${viewing.letterboxdRating}`,
      ].filter(Boolean)}
      <!-- #163: actors and genre as individually clickable chips, each
      linking to the overview filtered to that exact value — matches
      the venue-link-to-overview pattern (#131), split first so a click
      matches one value exactly rather than the whole comma-joined
      string. -->
      {@const directorChips = splitMultiValue(viewing.director)}
      {@const actorChips = splitMultiValue(viewing.actors)}
      {@const genreChips = splitMultiValue(viewing.genre)}
      {@const fields = [['Medium', viewing.medium]]}
      {@const blockedTimeBar = computeBlockedTimeBar(viewing.start, viewing.end)}
      <div class="mt-4 flex flex-col gap-4 sm:flex-row sm:gap-6">
        {#if viewing.posterUrl}
          <!-- #76: a fixed width + max-w-none, not h-64 w-auto — same fix
          as the overview's own poster, so a non-portrait source poster
          crops to a normal poster shape instead of rendering distorted
          or getting capped by a narrow container. -->
          <img
            src={viewing.posterUrl}
            alt={`${viewing.title} poster`}
            class="h-80 w-52 max-w-none self-start rounded object-cover"
          />
        {:else}
          <!-- #236: same slot/size a real poster would occupy. -->
          <PosterPlaceholder class="h-80 w-52 self-start rounded" />
        {/if}
        <div class="flex flex-1 flex-col gap-4">
          <h1 class="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            {viewing.year ? `${viewing.title} (${viewing.year})` : viewing.title}
          </h1>
          <div class="flex gap-3">
            <!-- #193: the brand mark stands in for the label visually;
            the link's accessible name stays the plain text via sr-only,
            same as the overview row's own cross-links. The "not linked"
            gap indicator (#153) has nothing to link to, so it keeps
            showing as plain text rather than a logo with no link. -->
            {#each links as link (link.label)}
              {#if link.href}
                {@const Icon = link.icon}
                <a
                  href={link.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={link.label}
                  class="text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300"
                >
                  <Icon class="h-5 w-5" />
                  <span class="sr-only">{link.label}</span>
                </a>
              {:else}
                <span class="text-sm text-slate-400 dark:text-slate-500">{link.label}</span>
              {/if}
            {/each}
          </div>
          <dl class={DL}>
            <dt class={DT}>Start</dt>
            <dd class={DD}>{formatDateTime(viewing.start)}</dd>
            <dt class={DT}>End</dt>
            <dd class={DD}>{formatDateTime(viewing.end)}</dd>
          </dl>
          <!-- #199: purely visual — the dl above (Start/End) is already
          the real, complete accessible description of the viewing's
          timing, so this decorative duration bar carries nothing a
          screen reader needs to hear a second time. -->
          <div
            class="relative h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700"
            aria-hidden="true"
          >
            <div
              class="absolute inset-y-0 rounded-full bg-indigo-500 dark:bg-indigo-400"
              style={`left: ${blockedTimeBar.positionPercent}%; width: ${blockedTimeBar.widthPercent}%;`}
            ></div>
          </div>
          <dl class={DL}>
            {#each fields as [term, value] (term)}
              {#if value}
                <dt class={DT}>{term}</dt>
                <dd class={DD}>{value}</dd>
              {/if}
            {/each}
            {#if viewing.venue}
              <!-- #303: same overview-filter link the Venues page's own
              venue link and director/actor/genre chips already use —
              a single link, not a chip, since a viewing has exactly
              one venue. -->
              <dt class={DT}>Venue</dt>
              <dd class={DD}>
                <a
                  href={`/?venue=${encodeURIComponent(viewing.venue)}`}
                  class="text-indigo-600 hover:underline dark:text-indigo-400"
                >
                  {viewing.venue}
                </a>
              </dd>
            {/if}
            {#if directorChips.length > 0}
              <dt class={DT}>Director</dt>
              <dd class={DD}>
                <div class="flex flex-wrap gap-1">
                  {#each directorChips as director (director)}
                    <a
                      href={`/?director=${encodeURIComponent(director)}`}
                      class="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-indigo-600 hover:underline dark:bg-slate-700 dark:text-indigo-400"
                    >
                      {director}
                    </a>
                  {/each}
                </div>
              </dd>
            {/if}
            {#if actorChips.length > 0}
              <dt class={DT}>Actors</dt>
              <dd class={DD}>
                <div class="flex flex-wrap gap-1">
                  {#each actorChips as actor (actor)}
                    <a
                      href={`/?actor=${encodeURIComponent(actor)}`}
                      class="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-indigo-600 hover:underline dark:bg-slate-700 dark:text-indigo-400"
                    >
                      {actor}
                    </a>
                  {/each}
                </div>
              </dd>
            {/if}
            {#if genreChips.length > 0}
              <dt class={DT}>Genre</dt>
              <dd class={DD}>
                <div class="flex flex-wrap gap-1">
                  {#each genreChips as genre (genre)}
                    <a
                      href={`/?genre=${encodeURIComponent(genre)}`}
                      class="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-indigo-600 hover:underline dark:bg-slate-700 dark:text-indigo-400"
                    >
                      {genre}
                    </a>
                  {/each}
                </div>
              </dd>
            {/if}
            {#if ratings.length > 0}
              <dt class={DT}>Ratings</dt>
              <dd class={DD}>
                <div class="flex flex-wrap gap-2">
                  {#each ratings as rating (rating)}
                    <span
                      class="rounded-full bg-slate-100 px-2 py-0.5 text-xs dark:bg-slate-700"
                    >
                      {rating}
                    </span>
                  {/each}
                </div>
              </dd>
            {/if}
            {#if viewing.row || viewing.seat}
              <!-- #288: a Pathé booking's seat assignment, when known —
              most media aren't a seated cinema booking at all, so this
              is absent far more often than present. -->
              <dt class={DT}>Seat</dt>
              <dd class={DD}>
                {[viewing.row && `Row ${viewing.row}`, viewing.seat && `Seat ${viewing.seat}`]
                  .filter(Boolean)
                  .join(", ")}
              </dd>
            {/if}
            {#if viewing.synopsis}
              <dt class={DT}>Synopsis</dt>
              <dd class={DD}>{viewing.synopsis}</dd>
            {/if}
            {#if viewing.notes}
              <dt class={DT}>Notes</dt>
              <dd class={DD}>{viewing.notes}</dd>
            {/if}
          </dl>
          {#if viewing.geo}
            <!-- #8/#203: renders only when this viewing's venue has
            known coordinates; nothing here otherwise, not a broken or
            empty map. -->
            <div class="flex flex-col gap-1">
              <VenueMap
                pins={[
                  {
                    lat: viewing.geo.lat,
                    lon: viewing.geo.lon,
                    label: viewing.venue ?? viewing.title,
                    posterUrl: viewing.posterUrl,
                  },
                ]}
              />
              <a
                href={openStreetMapUrl(viewing.geo)}
                target="_blank"
                rel="noopener noreferrer"
                class="self-start text-sm text-indigo-600 hover:underline dark:text-indigo-400"
              >
                Open in Maps
              </a>
            </div>
          {/if}
          <div class="flex gap-2">
            <button type="button" class={BUTTON_SM} onclick={() => startEdit(viewing)}>
              Edit
            </button>
            {#if omdbActive}
              <button
                type="button"
                class={BUTTON_SM}
                onclick={() => handleRefresh(viewing)}
              >
                Refresh metadata
              </button>
              <!-- #311: unlike Refresh (best-effort, skips a viewing that
              already has any OMDb match), always available — fixing a
              wrong match, or attaching one manually when nothing was
              found automatically. -->
              <button type="button" class={BUTTON_SM} onclick={() => startOmdbSearch(viewing)}>
                Search OMDb
              </button>
            {/if}
            <button
              type="button"
              class={`${BUTTON_SM} text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950`}
              onclick={() => handleDelete(viewing)}
            >
              Delete
            </button>
          </div>
          {#if searchingOmdb}
            <form
              class="flex items-end gap-2"
              aria-label="Search OMDb"
              onsubmit={(event) => submitOmdbSearch(viewing, event)}
            >
              <label class={FIELD_WRAPPER} for="omdb-search-query">
                <span class={LABEL}>Search OMDb</span>
                <input
                  class={INPUT}
                  type="text"
                  id="omdb-search-query"
                  bind:value={omdbSearchQuery}
                />
              </label>
              <button type="submit" class={BUTTON_PRIMARY}>Search</button>
              <button
                type="button"
                class={BUTTON_SECONDARY}
                onclick={() => (searchingOmdb = false)}
              >
                Cancel
              </button>
            </form>
          {/if}
        </div>
      </div>
    {/if}
  {/if}

  <div bind:this={pickerArea}></div>

  <p class={STATUS_TEXT} role="status">{statusText}</p>
  <datalist id="details-venue-choices">
    {#each venues as venue (venue)}
      <option value={venue}>{venue}</option>
    {/each}
  </datalist>
</div>
