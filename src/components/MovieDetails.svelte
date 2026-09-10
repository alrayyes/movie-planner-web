<script lang="ts">
// biome-ignore lint/correctness/noUnusedImports: used in the template below, which Biome does not parse for .svelte files
import { attributeHref } from "../lib/attribute/attributes";
import {
	deleteViewing,
	getPicklists,
	getViewing,
	updatePicklists,
	updateViewing,
} from "../lib/caldav/client";
import type {
	CaldavConfig,
	LoggedViewing,
	NewViewing,
	Picklists,
	VenueEntry,
} from "../lib/caldav/types";
import { getCredentialsStore } from "../lib/credentials/store";
// biome-ignore lint/correctness/noUnusedImports: used in the template below, which Biome does not parse for .svelte files
import { openStreetMapUrl } from "../lib/geo/links";
import {
	exportSingleViewingFilename,
	exportViewingsToJson,
} from "../lib/movie-log/export-viewings";
import { resolveBackHref } from "../lib/movie-log/movie-link";
// biome-ignore lint/correctness/noUnusedImports: used in the template below, which Biome does not parse for .svelte files
import { youtubeEmbedUrl } from "../lib/movie-log/youtube";
import { lookupByImdbId, lookupMovie, type OmdbCandidate, searchMovies } from "../lib/omdb/client";
// biome-ignore lint/correctness/noUnusedImports: used in the template below, which Biome does not parse for .svelte files
import { imdbUrl, letterboxdHref, rottenTomatoesSearchUrl } from "../lib/omdb/links";
import { hasOmdbMetadata } from "../lib/omdb/metadata";
// biome-ignore lint/correctness/noUnusedImports: used in the template below, which Biome does not parse for .svelte files
import { splitMultiValue } from "../lib/omdb/multi-value";
import { buildOmdbPicker } from "../lib/omdb/picker";
// biome-ignore lint/correctness/noUnusedImports: used in the template below, which Biome does not parse for .svelte files
import { releasedDayOfWeek } from "../lib/omdb/released-date";
import { encodeSharedState, type SharedState, toSharedViewing } from "../lib/share/encode";
import { reloadOnBfcacheRestore } from "../lib/ui/bfcache";
// biome-ignore lint/correctness/noUnusedImports: used in the template below, which Biome does not parse for .svelte files
import {
	BUTTON_PRIMARY,
	BUTTON_SECONDARY,
	BUTTON_SM,
	DD,
	DL_RESPONSIVE,
	DT,
	FIELD_WRAPPER,
	INPUT,
	LABEL,
	SECTION_HEADING,
	STATUS_TEXT,
} from "../lib/ui/classes";
// biome-ignore lint/correctness/noUnusedImports: used in the template below, which Biome does not parse for .svelte files
import { computeBlockedTimeBar, formatDate, formatDateTime } from "../lib/ui/datetime";
// biome-ignore lint/correctness/noUnusedImports: used in the template below, which Biome does not parse for .svelte files
import { venueDisplay, venueHref } from "../lib/venue/display";
// biome-ignore lint/correctness/noUnusedImports: used in the template below, which Biome does not parse for .svelte files
import ChipList from "./ChipList.svelte";
// biome-ignore lint/correctness/noUnusedImports: used in the template below, which Biome does not parse for .svelte files
import ErrorToast from "./ErrorToast.svelte";
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
// biome-ignore lint/correctness/noUnusedImports: used in the template below, which Biome does not parse for .svelte files
import VenuePicker from "./VenuePicker.svelte";

// #38: a dedicated page per logged viewing, reached from the overview's
// title link — see CalendarOverview.svelte's own comment for why this is
// a ?uid= query string rather than a dynamic /movie/[uid] route (this
// build is fully static; a visitor's own private CalDAV UIDs can't be
// known at build time for getStaticPaths to enumerate).
//
// #105: converted to Svelte alongside adding notes support, per this
// project's "touch it for real work, convert it" rule — see
// CalendarOverview.svelte's own note on why.

// #452: venue isn't in this generic loop — a native <select> (populated
// from the picklist's own known venues) rather than a free-text field
// needs its own markup, rendered separately via VenuePicker below.
const EDITABLE_FIELDS: { key: keyof NewViewing; label: string; type: string }[] = [
	{ key: "title", label: "Title", type: "text" },
	{ key: "start", label: "Start", type: "datetime-local" },
	{ key: "end", label: "End", type: "datetime-local" },
	{ key: "medium", label: "Medium", type: "text" },
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

// #580: whichever listing linked here (missing-data, an attribute
// detail page, venue, activity, the heatmap, …) carries its own path as
// ?from= — see movie-link.ts. Read once: unlike `uid`, this never needs
// to change while the page stays mounted.
// biome-ignore lint/correctness/noUnusedVariables: read in the template below, which Biome does not parse for .svelte files
const backHref = resolveBackHref(new URLSearchParams(location.search).get("from"));

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
// #442: a genuine save/refresh/search/delete/attach failure gets the
// distinct error-toast treatment instead of blending into statusText's
// own quiet line.
// biome-ignore lint/correctness/noUnusedVariables: read in the template below, which Biome does not parse for .svelte files
let errorMessage = $state("");
// #389: separate from statusText — sharing doesn't touch CalDAV, so it
// shouldn't clobber (or be clobbered by) a save/delete/refresh
// confirmation that's mid-flight. Same three-variable shape the
// overview's own now-removed whole-list share used. No biome-ignore
// needed on this one or sharedUrl below — both are genuinely read in
// script (handleCopyShareLink), unlike sharing, which only this
// component's template ever reads.
let shareStatusText = $state("");
// #442: same split as errorMessage above, for handleShare's own failure
// path.
// biome-ignore lint/correctness/noUnusedVariables: read in the template below, which Biome does not parse for .svelte files
let shareError = $state("");
// biome-ignore lint/correctness/noUnusedVariables: read in the template below, which Biome does not parse for .svelte files
let sharing = $state(false);
// #389: the actual generated link, shown as visible/selectable text —
// clipboard-write and the Web Share API both depend on browser
// permission/gesture-timing quirks a real visitor can hit (see
// handleShare's own comment) — the link itself, not an invisible side
// effect, is the one thing this always falls back to.
let sharedUrl = $state("");
// #98/#452: the same venue picklist the log form uses — a native
// <select> (VenuePicker.svelte) populated from it, so editing a viewing
// doesn't mean retyping an exact venue name used before, and picking one
// attaches its own stored city/country/geo/address automatically.
let picklists = $state<Picklists>({ media: [], venues: [] });
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

// #452: the selected venue's own picklist entry is the canonical
// source for its city/country/geo/address — read directly here, not
// searched or reused by scanning prior viewings (the now-superseded
// findKnownGeo/#339 model this replaces).
const selectedVenueEntry = $derived(
	editValues.venue ? picklists.venues.find((entry) => entry.name === editValues.venue) : undefined,
);

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
	editValues.venue = current.venue ?? "";
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
async function loadPicklists() {
	if (!config) return;
	try {
		picklists = await getPicklists(config);
	} catch {
		// The select just shows "No venue"; adding a new one still works.
	}
}

// #452: VenuePicker's own "Add venue" submission — same shape as
// LogViewingForm.svelte's identical handler.
// biome-ignore lint/correctness/noUnusedVariables: bound in the template below, which Biome does not parse for .svelte files
async function handleAddVenue(entry: VenueEntry) {
	if (!config) return;
	const next = { ...picklists, venues: [...picklists.venues, entry] };
	picklists = next;
	try {
		await updatePicklists(config, next);
	} catch {
		// The next attempt just re-adds it; not worth failing the edit on.
	}
}

// #519: VenuePicker's own "Edit venue" submission — same shape as
// LogViewingForm.svelte's identical handler.
// biome-ignore lint/correctness/noUnusedVariables: bound in the template below, which Biome does not parse for .svelte files
async function handleEditVenue(entry: VenueEntry) {
	if (!config) return;
	const next = {
		...picklists,
		venues: picklists.venues.map((existing) => (existing.name === entry.name ? entry : existing)),
	};
	picklists = next;
	try {
		await updatePicklists(config, next);
	} catch {
		// The next attempt just re-saves it; not worth failing the edit on.
	}
}

// biome-ignore lint/correctness/noUnusedVariables: bound in the template below, which Biome does not parse for .svelte files
async function handleSave(current: LoggedViewing) {
	if (!config) return;
	const venueEntry = selectedVenueEntry;
	const updated: NewViewing = {
		...current,
		title: editValues.title ?? "",
		start: new Date(editValues.start ?? "").toISOString(),
		end: new Date(editValues.end ?? "").toISOString(),
		medium: editValues.medium ?? "",
		venue: editValues.venue || undefined,
		geo: venueEntry?.geo,
		city: venueEntry?.city,
		country: venueEntry?.country,
		streetAddress: venueEntry?.streetAddress,
		postalCode: venueEntry?.postalCode,
	};
	errorMessage = "";
	try {
		await updateViewing(config, current.uid, updated);
		await load();
		statusText = "Saved.";
	} catch (error) {
		errorMessage = error instanceof Error ? error.message : "Failed to save.";
	}
}

// biome-ignore lint/correctness/noUnusedVariables: bound in the template below, which Biome does not parse for .svelte files
async function handleRefresh(current: LoggedViewing) {
	if (!config || !omdbActive || !omdbApiKey) return;
	errorMessage = "";
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
			showOmdbPicker(fresh, candidates, "refresh");
			return;
		}
		statusText = "OMDb had no match for this title.";
	} catch (error) {
		errorMessage = error instanceof Error ? error.message : "Failed to refresh metadata.";
	}
}

// #579: "refresh" keeps the picker's original "Continue without metadata"
// wording (accurate there — nothing was attached either way); "search"
// is a visitor manually looking for a better match, where that same
// picker is the only way back to the viewing's own details, so it gets
// a plain "Cancel" instead and a status line that doesn't claim OMDb
// found nothing when candidates were shown and simply not picked.
function showOmdbPicker(
	current: LoggedViewing,
	candidates: OmdbCandidate[],
	origin: "refresh" | "search",
) {
	if (!pickerArea || !config || !omdbApiKey) return;
	showingPicker = true;
	pickerArea.replaceChildren(
		buildOmdbPicker(
			candidates,
			async (candidate) => {
				if (!config || !omdbApiKey) return;
				errorMessage = "";
				try {
					const metadata = await lookupByImdbId(omdbApiKey, candidate.imdbId);
					if (metadata) {
						await updateViewing(config, current.uid, { ...current, ...metadata });
					}
					await load();
					statusText = "Refreshed.";
				} catch (error) {
					errorMessage =
						error instanceof Error ? error.message : "Failed to attach the selected match.";
				} finally {
					showingPicker = false;
					pickerArea?.replaceChildren();
				}
			},
			() => {
				showingPicker = false;
				pickerArea?.replaceChildren();
				statusText = origin === "search" ? "Search canceled." : "OMDb had no match for this title.";
			},
			origin === "search" ? "Cancel" : undefined,
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
	errorMessage = "";
	try {
		const candidates = await searchMovies(omdbApiKey, omdbSearchQuery.trim());
		if (candidates.length > 0) {
			// #311: reuses the same picker/selection flow "Refresh metadata"
			// already uses — picking a result overwrites every OMDb-derived
			// field (poster included) via lookupByImdbId, regardless of
			// whether this viewing already had a (possibly wrong) match.
			showOmdbPicker(current, candidates, "search");
		} else {
			statusText = "OMDb had no match for that search.";
		}
	} catch (error) {
		errorMessage = error instanceof Error ? error.message : "Failed to search OMDb.";
	}
}

// #388: reuses exportViewingsToJson (already accepts an array) with a
// single-element array — same field shape as the bulk export, just one
// row, named from this viewing's own title/date rather than "today"
// (exportSingleViewingFilename).
// biome-ignore lint/correctness/noUnusedVariables: bound in the template below, which Biome does not parse for .svelte files
function handleExport(current: LoggedViewing) {
	const blob = new Blob([exportViewingsToJson([current])], { type: "application/json" });
	const url = URL.createObjectURL(blob);
	const link = document.createElement("a");
	link.href = url;
	link.download = exportSingleViewingFilename(current);
	link.click();
	URL.revokeObjectURL(url);
	statusText = "Exported.";
}

// #389: shares just this one viewing — the overview's own whole-list
// share (#335) hit a hard wall once the filtered set got too big to
// fit in a URL, and removed rather than raising that ceiling further
// (see the issue this replaces). Only the display fields
// toSharedViewing's own allowlist carries ever land in the link — no
// credential, server URL, or API key has a field to land in — and a
// single viewing is always comfortably within any URL length limit, so
// there's no "too big to fit" case to guard against here at all.
// #345/#362: Web Share tried first, when available (an unmistakable
// native share sheet, the best UX when it works); the link is always
// also revealed as visible, selectable text regardless, since
// clipboard-write and navigator.share can both fail for
// permission/gesture-timing reasons outside this app's control — see
// the overview's own now-removed handleShare for the full history of
// why that fallback exists.
// biome-ignore lint/correctness/noUnusedVariables: bound in the template below, which Biome does not parse for .svelte files
async function handleShare(current: LoggedViewing) {
	sharing = true;
	shareStatusText = "Preparing link…";
	shareError = "";
	sharedUrl = "";
	try {
		const state: SharedState = {
			sharedAt: new Date().toISOString(),
			viewings: [toSharedViewing(current)],
		};
		const encoded = await encodeSharedState(state);
		const url = `${location.origin}/shared?state=${encoded}`;

		if (typeof navigator.share === "function") {
			try {
				await navigator.share({ title: `Movie Planner — ${current.title}`, url });
				shareStatusText = "Shared — read-only, frozen as of now.";
				return;
			} catch (shareError) {
				// Closing the native share sheet without picking anything
				// throws AbortError — a visitor changing their mind, not a
				// failure worth falling through to the link box for.
				if (shareError instanceof Error && shareError.name === "AbortError") {
					shareStatusText = "";
					return;
				}
				// Any other failure falls through to the visible link below
				// instead of leaving a visitor with nothing.
			}
		}

		sharedUrl = url;
		shareStatusText = "Read-only, frozen as of now.";
	} catch (error) {
		shareStatusText = "";
		shareError = error instanceof Error ? error.message : "Failed to prepare the link.";
	} finally {
		sharing = false;
	}
}

// #389: a fresh click of its own, no async work ahead of the clipboard
// call — unlike handleShare's own attempt, this one isn't subject to
// the "user gesture expired during the await" failure, since the link
// is already computed by the time this fires.
// biome-ignore lint/correctness/noUnusedVariables: bound in the template below, which Biome does not parse for .svelte files
async function handleCopyShareLink() {
	try {
		await navigator.clipboard.writeText(sharedUrl);
		shareStatusText = `Copied — ${shareStatusText}`;
	} catch {
		// Best-effort only — the link is already visible and selectable
		// either way, so a failure here just means the status text
		// doesn't update, not that sharing stops working.
	}
}

// biome-ignore lint/correctness/noUnusedVariables: bound in the template below, which Biome does not parse for .svelte files
async function handleDelete(current: LoggedViewing) {
	if (!config) return;
	if (!window.confirm(`Delete "${current.title}"? This can't be undone.`)) return;
	errorMessage = "";
	try {
		await deleteViewing(config, current.uid);
		statusText = "Deleted.";
		viewing = undefined;
	} catch (error) {
		errorMessage = error instanceof Error ? error.message : "Failed to delete.";
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
	await loadPicklists();
}

init();
// #223: see CalendarOverview.svelte's own reloadOnBfcacheRestore call —
// load() alone (not init(), which would redundantly redo credential
// and picklist setup) is enough once config is already set.
reloadOnBfcacheRestore(() => void load());
</script>

<div class="flex flex-col gap-4">
  <div class="flex flex-wrap items-center gap-2">
    <!-- #384: a real navigation to a different URL — WAI-ARIA/WCAG both
    reserve <button> for an in-page action and <a> for navigation, so
    this stays a link rather than becoming a <button> (which would also
    lose right-click/open-in-new-tab and native browser back/forward
    semantics). What was actually missing was visual prominence — plain
    small text read as an afterthought — so it's styled with the app's
    existing button look instead, a widely-used pattern (a link visually
    styled as a button, semantically still a link). -->
    <a href={backHref} class={BUTTON_SECONDARY}>Back to overview</a>
    {#if viewing && !showingPicker}
      <!-- #402: grouped with Back to overview rather than the
      edit/export/refresh/delete row below — those all act on this
      viewing's own stored data, while Share (like Back to overview) is
      about this page itself, not a data operation. Also fixes that
      row overflowing its container on a narrow viewport once it had
      six buttons in it. -->
      <button
        type="button"
        class={BUTTON_SECONDARY}
        disabled={sharing}
        aria-busy={sharing}
        onclick={() => handleShare(viewing)}
      >
        Share
      </button>
    {/if}
  </div>
  {#if shareStatusText}
    <p class={STATUS_TEXT} role="status">{shareStatusText}</p>
  {/if}
  {#if shareError}
    <ErrorToast message={shareError} onDismiss={() => (shareError = "")} />
  {/if}
  {#if sharedUrl}
    <!-- #389: the always-reliable fallback — visible, selectable text,
    not dependent on either navigator.share or clipboard-write
    succeeding. select-on-focus makes "click the box, Ctrl/Cmd+C" a
    one-step copy even without the button next to it working. -->
    <div class="flex flex-wrap items-center gap-2">
      <input
        type="text"
        readonly
        value={sharedUrl}
        aria-label="Shareable link"
        class={`${INPUT} max-w-md`}
        onfocus={(event) => event.currentTarget.select()}
      />
      <button type="button" class={BUTTON_SM} onclick={handleCopyShareLink}>Copy</button>
    </div>
  {/if}

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
                bind:value={editValues[field.key]}
              />
            </label>
          {/each}
          <div class="sm:col-span-2">
            <VenuePicker
              idPrefix="details"
              {picklists}
              bind:value={editValues.venue}
              onAddVenue={handleAddVenue}
              onEditVenue={handleEditVenue}
            />
            {#if editValues.venue && selectedVenueEntry?.geo}
              <p class={STATUS_TEXT}>Using {editValues.venue}'s known location.</p>
            {/if}
          </div>
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
      <!-- #450: movie country/language get the same split-first treatment
      director/actors/genre already had — "United Kingdom, France" used to
      link as one whole unsplit string instead of two individually
      clickable values. -->
      {@const movieCountryChips = splitMultiValue(viewing.movieCountry)}
      {@const movieLanguageChips = splitMultiValue(viewing.movieLanguage)}
      <!-- #400: TMDb-derived collection/certification/budget/popularity
      join the existing scalar fields array — same tier as Runtime/
      Metascore/Box Office/Production, no bespoke UI. Keywords stays
      separate (keywordChips below) since it renders as chips, not a
      plain value. -->
      {@const fields = [
        ['Medium', viewing.medium],
        ['Runtime', viewing.runtime],
        ['Metascore', viewing.metascore],
        ['IMDb Votes', viewing.imdbVotes],
        ['Box Office', viewing.boxOffice],
        ['Production', viewing.production],
        ['DVD Release', viewing.dvd],
        ['Awards', viewing.awards],
        ['Collection', viewing.collection],
        ['Certification', viewing.certification],
        ['Budget', viewing.budget],
        ['Popularity', viewing.popularity],
      ]}
      <!-- #400/#535: comma-split for readability, same helper director/
      actors/genre use for their chips — and, since #535, rendered as
      the same clickable ChipList as those, each linking to its own
      dedicated Keyword page. -->
      {@const keywordChips = splitMultiValue(viewing.keywords)}
      {@const blockedTimeBar = computeBlockedTimeBar(viewing.start, viewing.end)}
      <!-- #414: whether each grouped section below has anything to show
      — {@const} has to sit at this top level (immediate child of the
      {:else} branch, same as fields/directorChips/etc. above) rather
      than nested inside the wrapper div below, or Svelte rejects it. -->
      {@const hasDetailsFields =
        fields.some(([, value]) => value) ||
        viewing.venue ||
        viewing.rated ||
        viewing.movieLanguage ||
        viewing.movieCountry ||
        viewing.released ||
        viewing.row ||
        viewing.seat ||
        keywordChips.length > 0}
      {@const hasCastCrew =
        directorChips.length > 0 || actorChips.length > 0 || genreChips.length > 0}
      {@const hasExtras = viewing.synopsis || viewing.website || viewing.notes}
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
                <!-- #313: text-slate-400/dark:text-slate-500 failed WCAG
                AA contrast (2.63:1, needs 4.5:1) — swapped for the same
                slate-600/dark:slate-400 pair STATUS_TEXT already uses
                everywhere else in the app, which passes. Still visually
                muted against the real cross-links' indigo, keeping
                #153's own "this is a guess, not a confirmed match"
                distinction intact. -->
                <span class="text-sm text-slate-600 dark:text-slate-400">{link.label}</span>
              {/if}
            {/each}
          </div>
          <dl class={DL_RESPONSIVE}>
            {#if viewing.start === viewing.end}
              <!-- #359: start/end being identical only ever means the
              time was never known at all (a genuinely date-only import,
              or #278's own "missing end defaults to start" rule for a
              real DTSTART with no DTEND) — showing two identical
              date-times implies a specific time that was never actually
              recorded. -->
              <dt class={DT}>Date</dt>
              <dd class={DD}>{formatDate(viewing.start)}</dd>
            {:else}
              <dt class={DT}>Start</dt>
              <dd class={DD}>{formatDateTime(viewing.start)}</dd>
              <dt class={DT}>End</dt>
              <dd class={DD}>{formatDateTime(viewing.end)}</dd>
            {/if}
          </dl>
          {#if blockedTimeBar.widthPercent > 0}
            <!-- #199: purely visual — the dl above (Start/End) is already
            the real, complete accessible description of the viewing's
            timing, so this decorative duration bar carries nothing a
            screen reader needs to hear a second time. #379/#444: hidden
            entirely (not just zero-width) whenever there's no
            meaningful duration to visualize — start/end identical, or
            end before start — same reasoning as the Date row above
            showing no time at all in the identical case. -->
            <div
              class="relative h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700"
              aria-hidden="true"
            >
              <div
                class="absolute inset-y-0 rounded-full bg-indigo-500 dark:bg-indigo-400"
                style={`left: ${blockedTimeBar.positionPercent}%; width: ${blockedTimeBar.widthPercent}%;`}
              ></div>
            </div>
          {/if}
          <!-- #414: grouped under section headings instead of one flat
          dl — the single list made a title with a long cast or a full
          set of OMDb fields read as an undifferentiated wall. Each
          group is its own dl (and its own DL_RESPONSIVE, so the label
          column stacks above the value on a narrow phone instead of
          squeezing it), and a group renders nothing at all when none
          of its fields are present. -->
          {#if hasDetailsFields}
            <h2 class={SECTION_HEADING}>Details</h2>
            <dl class={DL_RESPONSIVE}>
              {#each fields as [term, value] (term)}
                {#if value}
                  <dt class={DT}>{term}</dt>
                  <dd class={DD}>{value}</dd>
                {/if}
              {/each}
              {#if viewing.venue}
                <!-- #529: the same dedicated per-venue page (#448) the
                Venues page's own venue links go to — a single link, not
                a chip, since a viewing has exactly one venue. The link's
                href/filter target is still the full raw venue value
                (venue identity is unaffected); only the displayed text
                is trimmed. #440: trimmed to name + known city, absorbing
                what used to be a separate Address row — a raw venue
                value with a full street address baked into it
                (movie-planner#331) no longer shows one. -->
                <dt class={DT}>Venue</dt>
                <dd class={DD}>
                  <a
                    href={venueHref(viewing.venue)}
                    class="text-indigo-600 hover:underline dark:text-indigo-400"
                  >
                    {venueDisplay(viewing.venue, viewing.city)}
                  </a>
                </dd>
              {/if}
              {#if viewing.rated}
                <!-- #372/#535: the movie's own OMDb-derived Rated field,
                same single-link pattern as Venue above — a different
                concept from the venue's own city/country, which is
                clickable from the Venues page's own grouping instead.
                Links to Rated's own dedicated, filter-free per-value page
                (attributeHref) rather than the main overview pre-filtered
                to it, same as every other attribute chip on this page. -->
                <dt class={DT}>Rated</dt>
                <dd class={DD}>
                  <a
                    href={attributeHref("rated", viewing.rated)}
                    class="text-indigo-600 hover:underline dark:text-indigo-400"
                  >
                    {viewing.rated}
                  </a>
                </dd>
              {/if}
              {#if movieLanguageChips.length > 0}
                <!-- #450: individually clickable chips, split first — same
                fix as director/actors/genre already had (#163), each
                linking to its own dedicated per-value page rather than one
                link for the whole comma-joined string. -->
                <dt class={DT}>Language</dt>
                <dd class={DD}><ChipList items={movieLanguageChips} kind="movieLanguage" /></dd>
              {/if}
              {#if movieCountryChips.length > 0}
                <dt class={DT}>Country</dt>
                <dd class={DD}><ChipList items={movieCountryChips} kind="movieCountry" /></dd>
              {/if}
              {#if viewing.released}
                <!-- #545: plain text now, deliberately — Released
                previously linked its month/year pieces to their own
                per-value pages (#373/#437/#535), but that's not what a
                visitor wants out of a movie's own release date, just
                information. Day of week (releasedDayOfWeek) prepended
                when the date is parseable; falls back to the raw OMDb
                string unchanged when it isn't. -->
                {@const dayOfWeek = releasedDayOfWeek(viewing.released)}
                <dt class={DT}>Released</dt>
                <dd class={DD}>
                  {dayOfWeek ? `${dayOfWeek} ${viewing.released}` : viewing.released}
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
              {#if keywordChips.length > 0}
                <!-- #400/#535: now the same clickable-chip treatment
                director/actors/genre get above — a dedicated Keywords
                page (#535) exists for a chip to link to now, so this is
                no longer the plain, non-interactive badge #400 shipped
                when nothing existed to link to. -->
                <dt class={DT}>Keywords</dt>
                <dd class={DD}><ChipList items={keywordChips} kind="keyword" /></dd>
              {/if}
            </dl>
          {/if}
          {#if hasCastCrew}
            <h2 class={SECTION_HEADING}>Cast & crew</h2>
            <dl class={DL_RESPONSIVE}>
              {#if directorChips.length > 0}
                <dt class={DT}>Director</dt>
                <dd class={DD}><ChipList items={directorChips} kind="director" /></dd>
              {/if}
              {#if actorChips.length > 0}
                <dt class={DT}>Actors</dt>
                <dd class={DD}><ChipList items={actorChips} kind="actor" /></dd>
              {/if}
              {#if genreChips.length > 0}
                <dt class={DT}>Genre</dt>
                <dd class={DD}><ChipList items={genreChips} kind="genre" /></dd>
              {/if}
            </dl>
          {/if}
          {#if ratings.length > 0}
            <h2 class={SECTION_HEADING}>Ratings</h2>
            <div class="flex flex-wrap gap-2">
              {#each ratings as rating (rating)}
                <span class="rounded-full bg-slate-100 px-2 py-0.5 text-xs dark:bg-slate-700">
                  {rating}
                </span>
              {/each}
            </div>
          {/if}
          {#if hasExtras}
            <h2 class={SECTION_HEADING}>Extras</h2>
            <dl class={DL_RESPONSIVE}>
              {#if viewing.synopsis}
                <dt class={DT}>Synopsis</dt>
                <dd class={DD}>{viewing.synopsis}</dd>
              {/if}
              {#if viewing.website}
                <!-- #310: OMDb's own official-site field, verbatim — shown
                as a link since it's always a full URL when present. -->
                <dt class={DT}>Website</dt>
                <dd class={DD}>
                  <a
                    href={viewing.website}
                    target="_blank"
                    rel="noopener noreferrer"
                    class="text-indigo-600 hover:underline dark:text-indigo-400"
                  >
                    {viewing.website}
                  </a>
                </dd>
              {/if}
              {#if viewing.notes}
                <dt class={DT}>Notes</dt>
                <dd class={DD}>{viewing.notes}</dd>
              {/if}
            </dl>
          {/if}
          {#if viewing.trailerUrl}
            <!-- #310: TMDb's own official YouTube trailer link
            (alrayyes/movie-planner#236) — opportunistic, off by default
            until a visitor's CLI has a TMDb key configured. #350:
            embedded via YouTube's privacy-enhanced youtube-nocookie.com
            domain when the link is a recognizable YouTube URL (it
            always is, in practice, since only YouTube is ever supplied
            here) — falls back to a plain link for anything
            youtubeEmbedUrl can't parse, rather than showing a broken
            embed. #414: pulled out of the dl entirely (it was sharing
            the squeezed value column with every label above it, which
            is why it used to render far smaller than the page's actual
            available width) — full width of its own, not max-w-xl
            capped, since a video wants the space a label/value pair
            doesn't need. -->
            {@const embedUrl = youtubeEmbedUrl(viewing.trailerUrl)}
            <h2 class={SECTION_HEADING}>Trailer</h2>
            {#if embedUrl}
              <iframe
                class="aspect-video w-full rounded-lg"
                src={embedUrl}
                title={`${viewing.title} trailer`}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowfullscreen
              ></iframe>
            {:else}
              <a
                href={viewing.trailerUrl}
                target="_blank"
                rel="noopener noreferrer"
                class="text-indigo-600 hover:underline dark:text-indigo-400"
              >
                Watch trailer
              </a>
            {/if}
          {/if}
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
          <div class="flex flex-wrap gap-2">
            <button type="button" class={BUTTON_SM} onclick={() => startEdit(viewing)}>
              Edit
            </button>
            <button type="button" class={BUTTON_SM} onclick={() => handleExport(viewing)}>
              Export
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

  <p id="movie-status" class={STATUS_TEXT} role="status">{statusText}</p>
  {#if errorMessage}
    <ErrorToast message={errorMessage} onDismiss={() => (errorMessage = "")} />
  {/if}
</div>
