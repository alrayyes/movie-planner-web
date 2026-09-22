<script lang="ts">
import { getPicklists, listViewings, updatePicklists, updateViewing } from "../lib/caldav/client";
import type { CaldavConfig, LoggedViewing, Picklists, VenueEntry } from "../lib/caldav/types";
import { CREDENTIALS_CONNECTED_EVENT, getCredentialsStore } from "../lib/credentials/store";
import type { Credentials } from "../lib/credentials/types";
import { logManualViewing, OPEN_LOG_VIEWING_WIZARD_EVENT } from "../lib/movie-log/log-viewing";
import { importCheckRange, toIsoDateTime } from "../lib/movie-log/run-import";
import {
	lookupByImdbId,
	type MovieMetadata,
	type OmdbCandidate,
	searchOmdb,
} from "../lib/omdb/client";
import { buildOmdbPicker } from "../lib/omdb/picker";
import { enrichWithTmdb } from "../lib/tmdb/client";
// biome-ignore lint/correctness/noUnusedImports: used in the template below, which Biome does not parse for .svelte files
import {
	BUTTON_PRIMARY,
	BUTTON_SECONDARY,
	FIELD_WRAPPER,
	INPUT,
	LABEL,
	STATUS_TEXT,
} from "../lib/ui/classes";
import { type MissingVenue, venuesMissingFromPicklist } from "../lib/venue/backfill";
import { findVenueEntry } from "../lib/venue/lookup";
// biome-ignore lint/correctness/noUnusedImports: used in the template below, which Biome does not parse for .svelte files
import ErrorToast from "./ErrorToast.svelte";
// biome-ignore lint/correctness/noUnusedImports: used in the template below, which Biome does not parse for .svelte files
import MediumPicker from "./MediumPicker.svelte";
// biome-ignore lint/correctness/noUnusedImports: used in the template below, which Biome does not parse for .svelte files
import VenuePicker from "./VenuePicker.svelte";

// #603: the header's "Log a viewing" button (log-viewing-button.ts) used
// to navigate to /log, a single-screen form with OMDb search available
// but optional. This is its replacement — a two-step <dialog> wizard,
// mounted once in SiteHeader.astro (so it's reachable from every page,
// same as the button itself) and opened via OPEN_LOG_VIEWING_WIZARD_EVENT
// rather than a direct reference, since a vanilla custom element and a
// Svelte island have none.
//
// Step one is search-and-select-first: picking a title is its own gated
// step before date/medium/venue are even shown, rather than one field
// among several on a single screen — so a visitor commits to the right
// title before, not alongside, the rest of the form. Step two reuses
// MediumPicker/VenuePicker (#600/#601) and logManualViewing (extended in
// #593/#594 to accept a pre-selected match) exactly as /log's own
// LogViewingForm.svelte does — /log itself, and its Pathé-booking-email
// flow, are unaffected and still reachable directly by URL.

let credentials: Credentials | null = null;
let omdbApiKey = $state<string | undefined>();
let omdbPaused = $state(false);
// biome-ignore lint/correctness/noUnusedVariables: read in the template below, which Biome does not parse for .svelte files
const omdbActive = $derived(Boolean(omdbApiKey) && !omdbPaused);

let picklists = $state<Picklists>({ media: [], venues: [] });
let dialogEl = $state<HTMLDialogElement>();
let pickerArea = $state<HTMLDivElement>();
// biome-ignore lint/correctness/noUnusedVariables: read in the template below, which Biome does not parse for .svelte files
let formError = $state("");
// #636/#646: venue names seen in viewing history but not yet in the
// picklist — computed lazily (see loadMissingVenues below) on opening
// this wizard, not on page mount, so the wizard's own header button
// staying unopened doesn't pay for a full-history listViewings() call.
// biome-ignore lint/correctness/noUnusedVariables: read in the template below, which Biome does not parse for .svelte files
let missingVenues = $state<MissingVenue[]>([]);
let cachedViewingsForBackfill: LoggedViewing[] | undefined;

// biome-ignore lint/correctness/noUnusedVariables: read in the template below, which Biome does not parse for .svelte files
let step = $state<1 | 2>(1);

// ---- Step 1: find the movie ----

let title = $state("");
let selectedOmdbMatch = $state<MovieMetadata | undefined>();
// #627: narrows OMDb's own search (y=) rather than sorting/paging
// through everything it has for a title — optional, left blank leaves
// the search unscoped exactly as before.
let searchYear = $state("");
// biome-ignore lint/correctness/noUnusedVariables: read in the template below, which Biome does not parse for .svelte files
let searchStatus = $state("");
let searchPickerArea = $state<HTMLDivElement>();
// biome-ignore lint/correctness/noUnusedVariables: read in the template below, which Biome does not parse for .svelte files
let searchHasResults = $state(false);

// ---- Step 2: the rest of the details ----

let date = $state("");
let startTime = $state("");
let endTime = $state("");
let medium = $state("Cinema");
let venue = $state("");

const selectedVenueEntry = $derived(venue ? findVenueEntry(venue, picklists.venues) : undefined);

function caldavConfig(): CaldavConfig {
	if (!credentials) throw new Error("<LogViewingWizard> requires stored credentials");
	return {
		baseUrl: credentials.caldavUrl,
		username: credentials.caldavUsername,
		password: credentials.caldavPassword,
	};
}

async function loadCredentials() {
	credentials = await getCredentialsStore().get();
	if (!credentials) return;
	omdbApiKey = credentials.omdbApiKey;
	omdbPaused = credentials.omdbPaused ?? false;
}
loadCredentials();
// Mirrors log-viewing-button.ts's own listener: a visitor can connect
// mid-session, after this island already mounted with no credentials.
window.addEventListener(CREDENTIALS_CONNECTED_EVENT, () => void loadCredentials());

// #600/#452: same auto-learn behaviour as LogViewingForm.svelte's own
// handleAddMedium/handleAddVenue/handleEditVenue/learnFromViewing —
// duplicated here rather than shared, since the two forms' write paths
// differ only in which component's own `picklists` state they update,
// not in what they do.
// biome-ignore lint/correctness/noUnusedVariables: bound in the template below, which Biome does not parse for .svelte files
async function handleAddMedium(name: string) {
	const next = { ...picklists, media: [...picklists.media, name] };
	picklists = next;
	try {
		await updatePicklists(caldavConfig(), picklists);
	} catch {
		// The next attempt just re-adds it; not worth failing the log on.
	}
}

// biome-ignore lint/correctness/noUnusedVariables: bound in the template below, which Biome does not parse for .svelte files
async function handleAddVenue(entry: VenueEntry) {
	const next = { ...picklists, venues: [...picklists.venues, entry] };
	picklists = next;
	try {
		await updatePicklists(caldavConfig(), picklists);
	} catch {
		// The next attempt just re-adds it; not worth failing the log on.
	}
}

// biome-ignore lint/correctness/noUnusedVariables: bound in the template below, which Biome does not parse for .svelte files
async function handleEditVenue(entry: VenueEntry) {
	const next = {
		...picklists,
		venues: picklists.venues.map((existing) => (existing.name === entry.name ? entry : existing)),
	};
	picklists = next;
	try {
		await updatePicklists(caldavConfig(), picklists);
	} catch {
		// The next attempt just re-saves it; not worth failing the log on.
	}
}

// #636/#646: a full listViewings() scan (importCheckRange's whole-history
// window, same range /venues itself uses) — fired once from openWizard
// above on each wizard open, and again from VenuePicker's own "Add
// venue" dialog opening in case the first attempt failed. Cached across
// repeat calls in the same session; recomputed against the current
// picklist each time so an already-added name drops off the list
// without a second network round trip.
async function loadMissingVenues() {
	if (!cachedViewingsForBackfill) {
		try {
			cachedViewingsForBackfill = await listViewings(caldavConfig(), importCheckRange());
		} catch {
			// Leave missingVenues at whatever it already was (likely empty)
			// — the freehand Name field still works either way.
			return;
		}
	}
	missingVenues = venuesMissingFromPicklist(cachedViewingsForBackfill, picklists.venues);
}

// #636/#657: one updatePicklists write for every entry picked from the
// "Already in your history" checklist or select group — each already
// seeded with whatever city/country/address/geo a matching viewing has
// (VenuePicker.svelte's own missingVenueToEntry), not a bare name.
// biome-ignore lint/correctness/noUnusedVariables: bound in the template below, which Biome does not parse for .svelte files
async function handleBulkAddVenues(entries: VenueEntry[]) {
	const next = {
		...picklists,
		venues: [...picklists.venues, ...entries],
	};
	picklists = next;
	try {
		await updatePicklists(caldavConfig(), picklists);
	} catch {
		// The next attempt just re-adds them; not worth failing the log on.
	}
	missingVenues = venuesMissingFromPicklist(cachedViewingsForBackfill ?? [], picklists.venues);
}

async function learnFromViewing(loggedMedium: string, loggedVenue: string | undefined) {
	let changed = false;
	let next = picklists;
	if (loggedMedium && !next.media.includes(loggedMedium)) {
		next = { ...next, media: [...next.media, loggedMedium] };
		changed = true;
	}
	if (loggedVenue && !next.venues.some((entry) => entry.name === loggedVenue)) {
		next = { ...next, venues: [...next.venues, { name: loggedVenue }] };
		changed = true;
	}
	if (!changed) return;
	picklists = next;
	try {
		await updatePicklists(caldavConfig(), picklists);
	} catch {
		// The next log attempt just re-learns it; not worth failing on.
	}
}

// #603: fires on every close — Cancel, Esc, clicking outside, or the
// programmatic close() after a successful log below — same
// one-place-resets-it pattern every other dialog in this app already
// uses (MediumPicker's resetAddMediumDialog, VenuePicker's resetForm,
// LogViewingForm's own resetSearchDialog).
function resetWizard() {
	step = 1;
	title = "";
	selectedOmdbMatch = undefined;
	searchYear = "";
	searchStatus = "";
	searchHasResults = false;
	searchPickerArea?.replaceChildren();
	date = "";
	startTime = "";
	endTime = "";
	medium = "Cinema";
	venue = "";
	formError = "";
	pickerArea?.replaceChildren();
}

// biome-ignore lint/correctness/noUnusedVariables: bound in the template below, which Biome does not parse for .svelte files
function onTitleInput() {
	// #593: a stale match never silently attaches to a title that's since
	// changed — same rule LogViewingForm.svelte's own title field applies.
	selectedOmdbMatch = undefined;
	searchHasResults = false;
	searchPickerArea?.replaceChildren();
}

function showSearchResults(candidates: OmdbCandidate[]) {
	if (!searchPickerArea) return;
	searchHasResults = true;
	searchPickerArea.replaceChildren(
		buildOmdbPicker(
			candidates,
			selectCandidate,
			() => {
				searchHasResults = false;
				searchPickerArea?.replaceChildren();
			},
			"Dismiss",
		),
	);
}

async function selectCandidate(candidate: OmdbCandidate) {
	if (!omdbApiKey) return;
	formError = "";
	try {
		const metadata = await lookupByImdbId(omdbApiKey, candidate.imdbId);
		if (metadata) {
			selectedOmdbMatch = metadata;
			title = candidate.title;
		}
	} catch (error) {
		formError = error instanceof Error ? error.message : "Failed to fetch the selected match.";
	} finally {
		searchHasResults = false;
		searchPickerArea?.replaceChildren();
	}
}

// biome-ignore lint/correctness/noUnusedVariables: bound in the template below, which Biome does not parse for .svelte files
async function runSearch() {
	if (!omdbApiKey || !title.trim()) return;
	formError = "";
	searchStatus = "Searching…";
	searchHasResults = false;
	try {
		const outcome = await searchOmdb(omdbApiKey, title.trim(), searchYear.trim() || undefined);
		if (outcome.kind === "match") {
			searchStatus = "";
			await selectCandidate(outcome.candidate);
		} else if (outcome.kind === "candidates") {
			searchStatus = "";
			showSearchResults(outcome.candidates);
		} else {
			searchStatus = "OMDb had no match for that search.";
		}
	} catch (error) {
		searchStatus = "";
		formError = error instanceof Error ? error.message : "Failed to search OMDb.";
	}
}

// biome-ignore lint/correctness/noUnusedVariables: bound in the template below, which Biome does not parse for .svelte files
function goNext() {
	if (!title.trim()) return;
	step = 2;
}

// biome-ignore lint/correctness/noUnusedVariables: bound in the template below, which Biome does not parse for .svelte files
function goBack() {
	// #603 acceptance criteria: nothing already typed in step two is lost
	// going back — step alone gates which screen renders, date/medium/
	// venue stay exactly as they were.
	step = 1;
}

// #49: same post-log disambiguation picker LogViewingForm.svelte offers
// — only reachable here when no candidate was picked in step one (a
// picked candidate skips the automatic best-guess lookup entirely, per
// logManualViewing's own preselectedOmdb branch). Closes the wizard once
// the visitor resolves it, pick or dismiss, rather than leaving a modal
// open with nothing left to do.
let lastLoggedUid = "";

function showOmdbPicker(candidates: OmdbCandidate[]) {
	if (!pickerArea || !credentials) return;
	const activeCredentials = credentials;
	pickerArea.replaceChildren(
		buildOmdbPicker(
			candidates,
			async (candidate) => {
				formError = "";
				try {
					const metadata = await lookupByImdbId(
						activeCredentials.omdbApiKey ?? "",
						candidate.imdbId,
					);
					if (metadata) {
						const tmdbFields = await enrichWithTmdb(activeCredentials.tmdbApiKey, metadata.imdbId);
						await updateViewing(caldavConfig(), lastLoggedUid, { ...metadata, ...tmdbFields });
					}
				} catch (error) {
					formError =
						error instanceof Error ? error.message : "Failed to attach the selected match.";
				} finally {
					dialogEl?.close();
				}
			},
			() => dialogEl?.close(),
		),
	);
}

// biome-ignore lint/correctness/noUnusedVariables: bound in the template below, which Biome does not parse for .svelte files
async function handleSubmit() {
	if (!credentials || !date) return;
	const loggedMedium = medium;
	const loggedVenue = venue || undefined;
	const venueEntry = selectedVenueEntry;
	formError = "";
	try {
		const result = await logManualViewing(
			credentials,
			{
				title,
				start: toIsoDateTime(date, startTime || undefined),
				end: toIsoDateTime(date, endTime || startTime || undefined),
				medium,
				venue: loggedVenue,
				geo: venueEntry?.geo,
				city: venueEntry?.city,
				country: venueEntry?.country,
				streetAddress: venueEntry?.streetAddress,
				postalCode: venueEntry?.postalCode,
			},
			selectedOmdbMatch,
		);
		await learnFromViewing(loggedMedium, loggedVenue);
		if (result.omdbCandidates?.length) {
			lastLoggedUid = result.viewing.uid;
			showOmdbPicker(result.omdbCandidates);
		} else {
			dialogEl?.close();
		}
	} catch (error) {
		formError = error instanceof Error ? error.message : "Failed to log viewing.";
	}
}

// #603: this island is mounted once, globally, in SiteHeader.astro — on
// every page, not just /log — so its own markup renders whether or not
// a visitor has ever opened it. Gating the dialog's actual content on
// this (rather than rendering it unconditionally from mount) keeps a
// closed-but-never-opened wizard from planting a real, focusable
// `<input type="text">` (and everything else) into every other page's
// DOM — several existing specs (attribute pages, medium.spec.ts,
// venue.spec.ts) assert zero text inputs on a filter-free page, which a
// dialog's own closed (`display: none`) state doesn't help with: an
// element inside a closed <dialog> is still present in the DOM, just
// not visible, and `locator(...).toHaveCount()` doesn't check
// visibility. Only the empty <dialog> itself always exists, so
// showModal() below has something to open.
// biome-ignore lint/correctness/noUnusedVariables: read in the template below, which Biome does not parse for .svelte files
let everOpened = $state(false);

async function openWizard() {
	if (!credentials) return;
	everOpened = true;
	resetWizard();
	// Best-effort, same as LogViewingForm.svelte's own init() — neither
	// medium nor venue is selectable beyond MediumPicker's own always-
	// available "Cinema" until the next successful load.
	try {
		picklists = await getPicklists(caldavConfig());
	} catch {
		// See above.
	}
	// #646: same reasoning as LogViewingForm.svelte's own init() — this
	// wizard step is always an editing context once opened, so the Venue
	// select's own "Already in your history" group is loaded eagerly
	// rather than gated behind opening "Add venue" first.
	await loadMissingVenues();
	dialogEl?.showModal();
}
window.addEventListener(OPEN_LOG_VIEWING_WIZARD_EVENT, () => void openWizard());
</script>

<dialog
  bind:this={dialogEl}
  aria-label="Log a viewing"
  class="max-w-sm rounded-lg border border-slate-200 bg-white p-4 text-slate-900 shadow-lg backdrop:bg-slate-900/40 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
  onclick={(event) => {
    if (event.target === dialogEl) dialogEl?.close();
  }}
  onclose={resetWizard}
>
  {#if everOpened}
  <div class="flex flex-col gap-4">
    {#if step === 1}
      <div class="flex flex-col gap-3">
        <h2 class="text-base font-semibold text-slate-900 dark:text-slate-100">Find the movie</h2>
        <div class="flex items-end gap-2">
          <div class={FIELD_WRAPPER}>
            <label class={LABEL} for="wizard-title">Title, or an IMDb ID/URL</label>
            <input
              class={INPUT}
              id="wizard-title"
              type="text"
              required
              bind:value={title}
              oninput={onTitleInput}
              onkeydown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  runSearch();
                }
              }}
            />
          </div>
          <div class={FIELD_WRAPPER}>
            <label class={LABEL} for="wizard-search-year">Year</label>
            <input
              class={`${INPUT} w-20`}
              id="wizard-search-year"
              type="text"
              inputmode="numeric"
              pattern="[0-9]{4}"
              maxlength="4"
              bind:value={searchYear}
              onkeydown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  runSearch();
                }
              }}
            />
          </div>
        </div>
        {#if omdbActive}
          <button type="button" class={`${BUTTON_SECONDARY} self-start`} onclick={runSearch}>
            Search OMDb
          </button>
        {/if}
        {#if searchStatus}
          <p class={STATUS_TEXT}>{searchStatus}</p>
        {/if}
        <div bind:this={searchPickerArea}></div>
        {#if selectedOmdbMatch}
          <div class="flex items-center gap-3">
            {#if selectedOmdbMatch.posterUrl}
              <img
                src={selectedOmdbMatch.posterUrl}
                alt={`${title} poster`}
                class="h-20 w-14 rounded object-cover"
              />
            {/if}
            <p class={STATUS_TEXT}>Matched: {title}</p>
          </div>
        {/if}
        {#if !searchHasResults}
          <div class="flex gap-2">
            <button
              type="button"
              class={BUTTON_PRIMARY}
              disabled={!title.trim()}
              onclick={goNext}
            >
              Next
            </button>
            <button type="button" class={BUTTON_SECONDARY} onclick={() => dialogEl?.close()}>
              Cancel
            </button>
          </div>
        {/if}
      </div>
    {:else}
      <div class="flex flex-col gap-3">
        <h2 class="text-base font-semibold text-slate-900 dark:text-slate-100">
          Log the viewing
        </h2>
        <p class={STATUS_TEXT}>{title}</p>
        <div class={FIELD_WRAPPER}>
          <label class={LABEL} for="wizard-date">Date</label>
          <input class={INPUT} id="wizard-date" type="date" required bind:value={date} />
        </div>
        <div class={FIELD_WRAPPER}>
          <label class={LABEL} for="wizard-start-time">Start time (optional)</label>
          <input class={INPUT} id="wizard-start-time" type="time" bind:value={startTime} />
        </div>
        <div class={FIELD_WRAPPER}>
          <label class={LABEL} for="wizard-end-time">End time (optional)</label>
          <input class={INPUT} id="wizard-end-time" type="time" bind:value={endTime} />
        </div>
        <MediumPicker idPrefix="wizard" {picklists} bind:value={medium} onAddMedium={handleAddMedium} />
        <VenuePicker
          idPrefix="wizard"
          {picklists}
          bind:value={venue}
          onAddVenue={handleAddVenue}
          onEditVenue={handleEditVenue}
          {missingVenues}
          onLoadMissingVenues={loadMissingVenues}
          onBulkAddVenues={handleBulkAddVenues}
        />
        {#if venue && selectedVenueEntry?.geo}
          <p class={STATUS_TEXT}>Using {venue}'s known location.</p>
        {/if}
        <div class="flex gap-2">
          <button type="button" class={BUTTON_SECONDARY} onclick={goBack}>Back</button>
          <button type="button" class={BUTTON_PRIMARY} disabled={!date} onclick={handleSubmit}>
            Log viewing
          </button>
        </div>
      </div>
    {/if}
    {#if formError}
      <ErrorToast message={formError} onDismiss={() => (formError = "")} />
    {/if}
    <div bind:this={pickerArea}></div>
  </div>
  {/if}
</dialog>
