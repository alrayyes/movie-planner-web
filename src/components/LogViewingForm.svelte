<script lang="ts">
import { getPicklists, listViewings, updatePicklists, updateViewing } from "../lib/caldav/client";
import type { CaldavConfig, LoggedViewing, Picklists, VenueEntry } from "../lib/caldav/types";
import { getCredentialsStore } from "../lib/credentials/store";
import type { Credentials } from "../lib/credentials/types";
import { logManualViewing, logPatheBooking } from "../lib/movie-log/log-viewing";
import { type PatheBooking, parsePatheEmail } from "../lib/movie-log/pathe-email";
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
	DD,
	DL,
	DT,
	FIELD_WRAPPER,
	FORM,
	INPUT,
	LABEL,
	SECTION_HEADING,
	STATUS_TEXT,
} from "../lib/ui/classes";
// biome-ignore lint/correctness/noUnusedImports: used in the template below, which Biome does not parse for .svelte files
import { formatDateTime } from "../lib/ui/datetime";
import { type MissingVenue, venuesMissingFromPicklist } from "../lib/venue/backfill";
import { findVenueEntry } from "../lib/venue/lookup";
// biome-ignore lint/correctness/noUnusedImports: used in the template below, which Biome does not parse for .svelte files
import ErrorToast from "./ErrorToast.svelte";
// biome-ignore lint/correctness/noUnusedImports: used in the template below, which Biome does not parse for .svelte files
import MediumPicker from "./MediumPicker.svelte";
// biome-ignore lint/correctness/noUnusedImports: used in the template below, which Biome does not parse for .svelte files
import VenuePicker from "./VenuePicker.svelte";

// movie-log spec: logging a viewing, via the manual form or by parsing a
// Pathé booking email, with best-effort OMDb enrichment. See
// log-viewing.ts for the shared write path both entry points use.
//
// #600 (structured-medium-picklist) and #452 (structured-venue-picklist):
// both medium and venue are a native <select> populated only from the
// picklist's own known entries, never free text, each with its own
// "Add" dialog (MediumPicker.svelte/VenuePicker.svelte, shared with
// MovieDetails.svelte's edit form) for a genuinely new one. A venue's
// own city/country/geo/address live directly on its picklist entry —
// the canonical source, read straight off the selected entry below —
// rather than this form scanning `allViewings` for a matching prior
// entry (the now-superseded findKnownGeo/#339 model, alongside the
// address-search lookup that used to run inline here for whatever
// venue name was currently typed; that lookup now lives inside
// VenuePicker's own "Add venue" dialog instead). The Pathé flow keeps
// its own automatic-reuse behaviour, now reading the same picklist
// entries by name instead of scanning viewings — its confirm step
// stays a fixed read-only summary, not an editable form.

let credentials: Credentials | null = null;

// biome-ignore lint/correctness/noUnusedVariables: read in the template below, which Biome does not parse for .svelte files
let status = $state("");
// #442: a genuine log/parse/attach failure gets the distinct
// error-toast treatment instead of blending into status's own quiet
// line.
// biome-ignore lint/correctness/noUnusedVariables: read in the template below, which Biome does not parse for .svelte files
let formError = $state("");
let picklists = $state<Picklists>({ media: [], venues: [] });
let pickerArea = $state<HTMLDivElement>();
// #636: venue names seen in viewing history but not yet in the
// picklist — computed lazily (see loadMissingVenues below), not on
// mount, so opening this form doesn't pay for a full-history
// listViewings() call unless a visitor actually opens "Add venue".
// biome-ignore lint/correctness/noUnusedVariables: read in the template below, which Biome does not parse for .svelte files
let missingVenues = $state<MissingVenue[]>([]);
let cachedViewingsForBackfill: LoggedViewing[] | undefined;

// #593: gates the manual form's own "Search OMDb" button, same condition
// MovieDetails.svelte's omdbActive uses — no point offering a search
// with nothing to search with, or while a visitor has deliberately
// paused lookups to stay under OMDb's daily quota. Copied out of
// `credentials` into their own $state (mirroring MovieDetails.svelte's
// own omdbApiKey/omdbPaused) rather than derived from `credentials`
// directly — `credentials` itself is a plain `let`, set once by init()
// below, not reactive.
let omdbApiKey = $state<string | undefined>();
let omdbPaused = $state(false);
// biome-ignore lint/correctness/noUnusedVariables: read in the template below, which Biome does not parse for .svelte files
const omdbActive = $derived(Boolean(omdbApiKey) && !omdbPaused);

function caldavConfig(): CaldavConfig {
	if (!credentials) throw new Error("<LogViewingForm> requires stored credentials");
	return {
		baseUrl: credentials.caldavUrl,
		username: credentials.caldavUsername,
		password: credentials.caldavPassword,
	};
}

async function init() {
	credentials = await getCredentialsStore().get();
	if (!credentials) return;
	omdbApiKey = credentials.omdbApiKey;
	omdbPaused = credentials.omdbPaused ?? false;
	// Best-effort — a fetch failure here shouldn't block logging, same
	// spirit as OMDb enrichment failing soft elsewhere in this form.
	try {
		picklists = await getPicklists(caldavConfig());
	} catch {
		// Neither medium nor venue is selectable beyond MediumPicker's own
		// always-available "Cinema" until the next successful load.
	}
	// #646: this form is always an editing context (there's no plain
	// view-only mode to protect the way MovieDetails.svelte's own
	// startEdit gating does) — loaded eagerly so the Venue select's own
	// "Already in your history" group has something to show without a
	// visitor having to open "Add venue" first.
	await loadMissingVenues();
}
init();

// #600/#452: medium and venue can no longer be freely typed into this
// form — MediumPicker's own "Add medium" dialog and VenuePicker's own
// "Add venue" dialog are what add a genuinely new one, via
// handleAddMedium/handleAddVenue below. The Pathé flow still calls this
// with its own parsed cinema name and hardcoded "cinema" medium, which
// aren't selected from either picker and so still need auto-learning.
async function learnFromViewing(medium: string, venue: string | undefined) {
	let changed = false;
	let next = picklists;
	if (medium && !next.media.includes(medium)) {
		next = { ...next, media: [...next.media, medium] };
		changed = true;
	}
	if (venue && !next.venues.some((entry) => entry.name === venue)) {
		next = { ...next, venues: [...next.venues, { name: venue }] };
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

// #600: MediumPicker's own "Add medium" submission — persisted here (not
// inside MediumPicker itself), same reasoning as handleAddVenue below.
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

// #452: VenuePicker's own "Add venue" submission — persisted here (not
// inside VenuePicker itself) since the write path differs slightly by
// caller (this form's caldavConfig() vs. MovieDetails.svelte's own
// `config` state), same as learnFromViewing above.
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

// #519: VenuePicker's own "Edit venue" submission — replaces the
// matching entry by name, in place, rather than appending. Past
// viewings already keep their own copy of city/country/geo/address
// from whenever they were logged (see the city/country/geo lines
// below), so this never rewrites them retroactively.
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
// window, same range /venues itself uses) — run once eagerly on this
// form's own init (this form is always an editing context, unlike
// MovieDetails.svelte's view/edit split) and again from VenuePicker's
// "Add venue" dialog opening, in case the first attempt failed. Cached
// across repeat calls in the same session; recomputed against the
// current picklist each time so an already-added name drops off the
// list without a second network round trip.
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

// #636: one updatePicklists write for every name picked from the
// "Already in your history" checklist, as plain name-only entries — the
// same shape learnFromViewing's own auto-learn already writes.
// biome-ignore lint/correctness/noUnusedVariables: bound in the template below, which Biome does not parse for .svelte files
async function handleBulkAddVenues(names: string[]) {
	const next = {
		...picklists,
		venues: [...picklists.venues, ...names.map((name) => ({ name }))],
	};
	picklists = next;
	try {
		await updatePicklists(caldavConfig(), picklists);
	} catch {
		// The next attempt just re-adds them; not worth failing the log on.
	}
	missingVenues = venuesMissingFromPicklist(cachedViewingsForBackfill ?? [], picklists.venues);
}

// #49: shown after logging (either flow) finds no confident OMDb match
// but OMDb's search has candidates — selecting one fetches its full
// details and attaches them to the just-created/updated viewing, same
// as a Refresh would; dismissing leaves it without metadata, same as if
// there'd been no candidates at all.
function showOmdbPicker(viewing: LoggedViewing, candidates: OmdbCandidate[]) {
	if (!pickerArea) return;
	pickerArea.replaceChildren(
		buildOmdbPicker(
			candidates,
			async (candidate) => {
				if (!credentials?.omdbApiKey || !pickerArea) return;
				formError = "";
				try {
					const metadata = await lookupByImdbId(credentials.omdbApiKey, candidate.imdbId);
					if (metadata) {
						// #360/#400: TMDb only ever runs off an IMDb ID OMDb has
						// already resolved — here, the picker selection itself.
						const tmdbFields = await enrichWithTmdb(credentials.tmdbApiKey, metadata.imdbId);
						await updateViewing(caldavConfig(), viewing.uid, {
							...viewing,
							...metadata,
							...tmdbFields,
						});
					}
					status = "Logged and matched.";
				} catch (error) {
					formError =
						error instanceof Error ? error.message : "Failed to attach the selected match.";
				} finally {
					pickerArea?.replaceChildren();
				}
			},
			() => pickerArea?.replaceChildren(),
		),
	);
}

// ---- Manual form ----

let title = $state("");
let date = $state("");
let startTime = $state("");
let endTime = $state("");
// #600: "Cinema" is always a selectable option (MediumPicker.svelte),
// so it's the sensible default rather than an empty string that would
// match no <option> at all.
let medium = $state("Cinema");
let venue = $state("");

// #593: set once a visitor searches OMDb and picks a candidate (below);
// cleared on any further hand-typed edit to the title so a stale match
// never silently attaches to a title that's since changed.
let selectedOmdbMatch = $state<MovieMetadata | undefined>();
let omdbSearchQuery = $state("");
// #627: narrows OMDb's own search (y=) rather than sorting/paging
// through everything it has for a title — optional, left blank leaves
// the search unscoped exactly as before.
let omdbSearchYear = $state("");
let searchDialogEl = $state<HTMLDialogElement>();
let searchPickerArea = $state<HTMLDivElement>();
// biome-ignore lint/correctness/noUnusedVariables: read in the template below, which Biome does not parse for .svelte files
let searchStatus = $state("");
// #596: the results picker (buildOmdbPicker) already has its own
// dismiss button — this hides the dialog's own standalone Cancel while
// results are showing, so there's only ever one way back, not two.
// biome-ignore lint/correctness/noUnusedVariables: read in the template below, which Biome does not parse for .svelte files
let searchHasResults = $state(false);

// #452: the selected venue's own picklist entry is the canonical
// source for its city/country/geo/address — attached automatically
// below, not searched or reused from prior viewings.
const selectedVenueEntry = $derived(venue ? findVenueEntry(venue, picklists.venues) : undefined);

// biome-ignore lint/correctness/noUnusedVariables: bound in the template below, which Biome does not parse for .svelte files
function startOmdbSearch() {
	omdbSearchQuery = title;
	searchStatus = "";
	searchDialogEl?.showModal();
}

// #596: fires on every close, however it happens — Cancel, Esc,
// clicking outside, or the programmatic close() after a pick below —
// so there's one place that resets the dialog for its next open,
// rather than repeating this at each of those call sites.
// biome-ignore lint/correctness/noUnusedVariables: bound in the template below, which Biome does not parse for .svelte files
function resetSearchDialog() {
	omdbSearchQuery = "";
	omdbSearchYear = "";
	searchStatus = "";
	searchHasResults = false;
	searchPickerArea?.replaceChildren();
}

// #593: mirrors MovieDetails.svelte's own startOmdbSearch/submitOmdbSearch
// — same searchMovies → buildOmdbPicker chain, "Cancel" as the picker's
// dismiss label (its own "search" origin). The difference is what
// picking a candidate does: nothing's been logged yet, so there's no
// viewing to updateViewing — just the exact match this form's own
// submit will attach.
async function selectOmdbCandidate(candidate: OmdbCandidate) {
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
		searchDialogEl?.close();
	}
}

function showOmdbSearchPicker(candidates: OmdbCandidate[]) {
	if (!searchPickerArea) return;
	searchHasResults = true;
	searchPickerArea.replaceChildren(
		buildOmdbPicker(candidates, selectOmdbCandidate, () => searchDialogEl?.close(), "Cancel"),
	);
}

// biome-ignore lint/correctness/noUnusedVariables: bound in the template below, which Biome does not parse for .svelte files
async function submitOmdbSearch() {
	if (!omdbApiKey || !omdbSearchQuery.trim()) return;
	formError = "";
	searchStatus = "Searching…";
	searchHasResults = false;
	try {
		const outcome = await searchOmdb(
			omdbApiKey,
			omdbSearchQuery.trim(),
			omdbSearchYear.trim() || undefined,
		);
		if (outcome.kind === "match") {
			searchStatus = "";
			await selectOmdbCandidate(outcome.candidate);
		} else if (outcome.kind === "candidates") {
			searchStatus = "";
			showOmdbSearchPicker(outcome.candidates);
		} else {
			searchStatus = "OMDb had no match for that search.";
		}
	} catch (error) {
		searchStatus = "";
		formError = error instanceof Error ? error.message : "Failed to search OMDb.";
	}
}

// biome-ignore lint/correctness/noUnusedVariables: bound in the template below, which Biome does not parse for .svelte files
async function handleManualSubmit(event: SubmitEvent) {
	event.preventDefault();
	if (!credentials) return;
	const loggedMedium = medium;
	const loggedVenue = venue || undefined;
	const venueEntry = selectedVenueEntry;
	formError = "";
	try {
		const result = await logManualViewing(
			credentials,
			{
				title,
				// A missing time defaults to midnight; a missing end time
				// defaults to the start time — same as the CSV/JSON importer
				// (run-import.ts) for a row that only gives a date.
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
		status = "Logged.";
		title = "";
		date = "";
		startTime = "";
		endTime = "";
		medium = "Cinema";
		venue = "";
		selectedOmdbMatch = undefined;
		await learnFromViewing(loggedMedium, loggedVenue);
		if (result.omdbCandidates?.length) showOmdbPicker(result.viewing, result.omdbCandidates);
	} catch (error) {
		formError = error instanceof Error ? error.message : "Failed to log viewing.";
	}
}

// ---- Pathé email parsing ----

let patheEmailText = $state("");
let patheFileInput = $state<HTMLInputElement>();
let parsedBooking = $state<PatheBooking | undefined>();
// biome-ignore lint/correctness/noUnusedVariables: read in the template below, which Biome does not parse for .svelte files
let confirmVisible = $state(false);

const patheKnownGeo = $derived(
	parsedBooking ? findVenueEntry(parsedBooking.cinema, picklists.venues)?.geo : undefined,
);

// biome-ignore lint/correctness/noUnusedVariables: bound in the template below, which Biome does not parse for .svelte files
async function handlePatheFileChange() {
	const file = patheFileInput?.files?.[0];
	if (file) patheEmailText = await file.text();
}

// biome-ignore lint/correctness/noUnusedVariables: bound in the template below, which Biome does not parse for .svelte files
async function handleParse() {
	formError = "";
	try {
		parsedBooking = await parsePatheEmail(patheEmailText);
		confirmVisible = true;
		status = "";
	} catch (error) {
		confirmVisible = false;
		formError = error instanceof Error ? error.message : "Could not parse this email.";
	}
}

// biome-ignore lint/correctness/noUnusedVariables: bound in the template below, which Biome does not parse for .svelte files
async function handleConfirm() {
	if (!parsedBooking || !credentials) return;
	const booking = parsedBooking;
	formError = "";
	try {
		const result = await logPatheBooking(credentials, booking, patheKnownGeo);
		status = result.wasUpdate ? "Updated the existing entry." : "Logged.";
		confirmVisible = false;
		await learnFromViewing("cinema", booking.cinema);
		patheEmailText = "";
		parsedBooking = undefined;
		if (result.omdbCandidates?.length) showOmdbPicker(result.viewing, result.omdbCandidates);
	} catch (error) {
		formError = error instanceof Error ? error.message : "Failed to log viewing.";
	}
}
</script>

<div class="flex flex-col gap-8">
  <section class="flex flex-col gap-4">
    <h2 class={SECTION_HEADING}>Log manually</h2>
    <form class={FORM} aria-label="Log a viewing manually" onsubmit={handleManualSubmit}>
      <div class={FIELD_WRAPPER}>
        <label class={LABEL} for="log-title">Title</label>
        <input
          class={INPUT}
          id="log-title"
          name="log-title"
          type="text"
          required
          bind:value={title}
          oninput={() => (selectedOmdbMatch = undefined)}
        />
        {#if omdbActive}
          <button
            type="button"
            class={`${BUTTON_SECONDARY} self-start`}
            onclick={startOmdbSearch}
          >
            Search OMDb
          </button>
        {/if}
      </div>

      <div class={FIELD_WRAPPER}>
        <label class={LABEL} for="log-date">Date</label>
        <input class={INPUT} id="log-date" name="log-date" type="date" required bind:value={date} />
      </div>
      <div class={FIELD_WRAPPER}>
        <label class={LABEL} for="log-start-time">Start time (optional)</label>
        <input
          class={INPUT}
          id="log-start-time"
          name="log-start-time"
          type="time"
          bind:value={startTime}
        />
      </div>
      <div class={FIELD_WRAPPER}>
        <label class={LABEL} for="log-end-time">End time (optional)</label>
        <input class={INPUT} id="log-end-time" name="log-end-time" type="time" bind:value={endTime} />
      </div>
      <MediumPicker idPrefix="log" {picklists} bind:value={medium} onAddMedium={handleAddMedium} />
      <VenuePicker
        idPrefix="log"
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

      <button type="submit" class={`${BUTTON_PRIMARY} self-start`}>Log viewing</button>
    </form>
  </section>

  <section
    class="flex flex-col gap-4 border-t border-slate-200 pt-6 dark:border-slate-700"
    aria-label="Log from a Pathé booking email"
  >
    <h2 class={SECTION_HEADING}>Log from a Pathé booking email</h2>
    <label class={LABEL} for="pathe-email-text">
      Paste the booking confirmation email, or upload the .eml file
    </label>
    <textarea id="pathe-email-text" class={`${INPUT} min-h-32`} bind:value={patheEmailText}
    ></textarea>
    <input
      type="file"
      class="text-base text-slate-600 dark:text-slate-400"
      accept=".eml,message/rfc822"
      aria-label="Upload a Pathé booking confirmation .eml file"
      bind:this={patheFileInput}
      onchange={handlePatheFileChange}
    />
    <button type="button" class={`${BUTTON_SECONDARY} self-start`} onclick={handleParse}>
      Parse
    </button>

    {#if confirmVisible && parsedBooking}
      <div class="flex flex-col gap-3 rounded-lg bg-slate-50 p-4 dark:bg-slate-900/40">
        <dl class={DL}>
          <dt class={DT}>Title</dt>
          <dd class={DD}>{parsedBooking.title}</dd>
          {#if parsedBooking.start === parsedBooking.end}
            <!-- #359: same rule as MovieDetails.svelte's own Start/End
            collapse — a real Pathé booking always parses a distinct end
            time, but this stays consistent with every other place this
            app shows Start/End rather than assuming that's guaranteed. -->
            <dt class={DT}>Date</dt>
            <dd class={DD}>{formatDateTime(parsedBooking.start)}</dd>
          {:else}
            <dt class={DT}>Start</dt>
            <dd class={DD}>{formatDateTime(parsedBooking.start)}</dd>
            <dt class={DT}>End</dt>
            <dd class={DD}>{formatDateTime(parsedBooking.end)}</dd>
          {/if}
          <dt class={DT}>Cinema</dt>
          <dd class={DD}>{parsedBooking.cinema}</dd>
          <dt class={DT}>Booking number</dt>
          <dd class={DD}>{parsedBooking.bookingRef}</dd>
        </dl>
        <button type="button" class={`${BUTTON_PRIMARY} self-start`} onclick={handleConfirm}>
          Confirm and log
        </button>
      </div>
    {/if}
  </section>

  <p class={STATUS_TEXT} role="status">{status}</p>
  {#if formError}
    <ErrorToast message={formError} onDismiss={() => (formError = "")} />
  {/if}
  <div bind:this={pickerArea}></div>

  <!-- #596: same native <dialog> pattern as ViewingHeatmap.svelte's day
  popup and keyboard-nav.ts's help overlay — showModal()'s own default
  (viewport-centered, fixed) needs nothing extra here. -->
  <dialog
    bind:this={searchDialogEl}
    aria-label="Search OMDb"
    class="max-w-sm rounded-lg border border-slate-200 bg-white p-4 text-slate-900 shadow-lg backdrop:bg-slate-900/40 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
    onclick={(event) => {
      if (event.target === searchDialogEl) searchDialogEl?.close();
    }}
    onclose={resetSearchDialog}
  >
    <div class="flex flex-col gap-3">
      <h2 class="text-base font-semibold text-slate-900 dark:text-slate-100">Search OMDb</h2>
      <div class="flex items-end gap-2">
        <label class={FIELD_WRAPPER} for="omdb-search-query">
          <span class={LABEL}>Title, or an IMDb ID/URL</span>
          <input
            class={INPUT}
            type="text"
            id="omdb-search-query"
            bind:value={omdbSearchQuery}
            onkeydown={(event) => event.key === "Enter" && submitOmdbSearch()}
          />
        </label>
        <label class={FIELD_WRAPPER} for="omdb-search-year">
          <span class={LABEL}>Year</span>
          <input
            class={`${INPUT} w-20`}
            type="text"
            inputmode="numeric"
            pattern="[0-9]{4}"
            maxlength="4"
            id="omdb-search-year"
            bind:value={omdbSearchYear}
            onkeydown={(event) => event.key === "Enter" && submitOmdbSearch()}
          />
        </label>
        <button type="button" class={BUTTON_PRIMARY} onclick={submitOmdbSearch}>Search</button>
      </div>
      {#if searchStatus}
        <p class={STATUS_TEXT}>{searchStatus}</p>
      {/if}
      <div bind:this={searchPickerArea}></div>
      {#if !searchHasResults}
        <button
          type="button"
          class={`${BUTTON_SECONDARY} self-start`}
          onclick={() => searchDialogEl?.close()}
        >
          Cancel
        </button>
      {/if}
    </div>
  </dialog>
</div>
