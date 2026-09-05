<script lang="ts">
import { deleteViewing, getPicklists, getViewing, updateViewing } from "../lib/caldav/client";
import type { CaldavConfig, LoggedViewing, NewViewing } from "../lib/caldav/types";
import { getCredentialsStore } from "../lib/credentials/store";
import { lookupByImdbId, lookupMovie, type OmdbCandidate, searchMovies } from "../lib/omdb/client";
// biome-ignore lint/correctness/noUnusedImports: used in the template below, which Biome does not parse for .svelte files
import { imdbUrl, letterboxdHref, rottenTomatoesSearchUrl } from "../lib/omdb/links";
import { hasOmdbMetadata } from "../lib/omdb/metadata";
// biome-ignore lint/correctness/noUnusedImports: used in the template below, which Biome does not parse for .svelte files
import { splitMultiValue } from "../lib/omdb/multi-value";
import { buildOmdbPicker } from "../lib/omdb/picker";
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
import { formatDateTime } from "../lib/ui/datetime";
// biome-ignore lint/correctness/noUnusedImports: used in the template below, which Biome does not parse for .svelte files
import IconImdb from "./icons/IconImdb.svelte";
// biome-ignore lint/correctness/noUnusedImports: used in the template below, which Biome does not parse for .svelte files
import IconLetterboxd from "./icons/IconLetterboxd.svelte";
// biome-ignore lint/correctness/noUnusedImports: used in the template below, which Biome does not parse for .svelte files
import IconRottenTomatoes from "./icons/IconRottenTomatoes.svelte";

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
let editValues = $state<Record<string, string>>({});

// biome-ignore lint/correctness/noUnusedVariables: bound in the template below, which Biome does not parse for .svelte files
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
	await loadVenueSuggestions();
}

init();
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
      {@const fields = [
        ['Start', formatDateTime(viewing.start)],
        ['End', formatDateTime(viewing.end)],
        ['Medium', viewing.medium],
        ['Venue', viewing.venue],
      ]}
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
            {#each fields as [term, value] (term)}
              {#if value}
                <dt class={DT}>{term}</dt>
                <dd class={DD}>{value}</dd>
              {/if}
            {/each}
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
            {#if viewing.notes}
              <dt class={DT}>Notes</dt>
              <dd class={DD}>{viewing.notes}</dd>
            {/if}
          </dl>
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
            {/if}
            <button
              type="button"
              class={`${BUTTON_SM} text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950`}
              onclick={() => handleDelete(viewing)}
            >
              Delete
            </button>
          </div>
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
