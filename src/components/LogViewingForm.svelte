<script lang="ts">
import { getPicklists, updatePicklists, updateViewing } from "../lib/caldav/client";
import type { CaldavConfig, LoggedViewing, Picklists, VenueEntry } from "../lib/caldav/types";
import { getCredentialsStore } from "../lib/credentials/store";
import type { Credentials } from "../lib/credentials/types";
import { logManualViewing, logPatheBooking } from "../lib/movie-log/log-viewing";
import { type PatheBooking, parsePatheEmail } from "../lib/movie-log/pathe-email";
import { toIsoDateTime } from "../lib/movie-log/run-import";
import { lookupByImdbId, type OmdbCandidate } from "../lib/omdb/client";
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
import { findVenueEntry } from "../lib/venue/lookup";
// biome-ignore lint/correctness/noUnusedImports: used in the template below, which Biome does not parse for .svelte files
import ErrorToast from "./ErrorToast.svelte";
// biome-ignore lint/correctness/noUnusedImports: used in the template below, which Biome does not parse for .svelte files
import VenuePicker from "./VenuePicker.svelte";

// movie-log spec: logging a viewing, via the manual form or by parsing a
// Pathé booking email, with best-effort OMDb enrichment. See
// log-viewing.ts for the shared write path both entry points use.
//
// location-management spec: the medium picklist (a sidecar CalDAV
// object) is offered as a <datalist> suggestion rather than a closed
// dropdown, so logging with a new medium still works — it's just not
// offered as a choice until this same form's own submission adds it.
//
// #452 (structured-venue-picklist): venue is different — a native
// <select> populated only from the picklist's own known venues, never
// free text, with a separate "Add venue" form (VenuePicker.svelte,
// shared with MovieDetails.svelte's edit form) for a genuinely new one.
// A venue's own city/country/geo/address now live directly on its
// picklist entry — the canonical source, read straight off the
// selected entry below — rather than this form scanning `allViewings`
// for a matching prior entry (the now-superseded findKnownGeo/#339
// model, alongside the address-search lookup that used to run inline
// here for whatever venue name was currently typed; that lookup now
// lives inside VenuePicker's own "Add venue" form instead). The Pathé
// flow keeps its own automatic-reuse behaviour, now reading the same
// picklist entries by name instead of scanning viewings — its confirm
// step stays a fixed read-only summary, not an editable form.

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
	// Best-effort — a fetch failure here shouldn't block logging, same
	// spirit as OMDb enrichment failing soft elsewhere in this form.
	try {
		picklists = await getPicklists(caldavConfig());
	} catch {
		// Suggestions just stay empty; medium free-text entry still works,
		// and no venue is selectable until the next successful load.
	}
}
init();

// location-management spec, "First venue added" (medium only, now —
// venue can no longer be freely typed into this form; #452's own "Add
// venue" form is what adds a new venue, via handleAddVenue below). The
// Pathé flow still calls this with its own parsed cinema name, which
// isn't selected from the picklist and so still needs auto-learning.
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
let medium = $state("");
let venue = $state("");

// #452: the selected venue's own picklist entry is the canonical
// source for its city/country/geo/address — attached automatically
// below, not searched or reused from prior viewings.
const selectedVenueEntry = $derived(venue ? findVenueEntry(venue, picklists.venues) : undefined);

// biome-ignore lint/correctness/noUnusedVariables: bound in the template below, which Biome does not parse for .svelte files
async function handleManualSubmit(event: SubmitEvent) {
	event.preventDefault();
	if (!credentials) return;
	const loggedMedium = medium;
	const loggedVenue = venue || undefined;
	const venueEntry = selectedVenueEntry;
	formError = "";
	try {
		const result = await logManualViewing(credentials, {
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
		});
		status = "Logged.";
		title = "";
		date = "";
		startTime = "";
		endTime = "";
		medium = "";
		venue = "";
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
        <input class={INPUT} id="log-title" name="log-title" type="text" required bind:value={title} />
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
      <div class={FIELD_WRAPPER}>
        <label class={LABEL} for="log-medium">Medium</label>
        <input
          class={INPUT}
          id="log-medium"
          name="log-medium"
          type="text"
          required
          list="log-medium-choices"
          bind:value={medium}
        />
      </div>
      <VenuePicker idPrefix="log" {picklists} bind:value={venue} onAddVenue={handleAddVenue} />

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
      class="text-sm text-slate-600 dark:text-slate-400"
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

  <datalist id="log-medium-choices">
    {#each picklists.media as option (option)}
      <option value={option}>{option}</option>
    {/each}
  </datalist>

  <p class={STATUS_TEXT} role="status">{status}</p>
  {#if formError}
    <ErrorToast message={formError} onDismiss={() => (formError = "")} />
  {/if}
  <div bind:this={pickerArea}></div>
</div>
