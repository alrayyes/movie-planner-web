<script lang="ts">
import { getPicklists, listViewings, updatePicklists, updateViewing } from "../lib/caldav/client";
import type { CaldavConfig, LoggedViewing, Picklists } from "../lib/caldav/types";
import { getCredentialsStore } from "../lib/credentials/store";
import type { Credentials } from "../lib/credentials/types";
import { type GeoCandidate, searchAddress } from "../lib/geo/nominatim";
import { findKnownGeo } from "../lib/geo/reuse";
import { logManualViewing, logPatheBooking } from "../lib/movie-log/log-viewing";
import { type PatheBooking, parsePatheEmail } from "../lib/movie-log/pathe-email";
import { importCheckRange, toIsoDateTime } from "../lib/movie-log/run-import";
import { lookupByImdbId, type OmdbCandidate } from "../lib/omdb/client";
import { buildOmdbPicker } from "../lib/omdb/picker";
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
import { debounce } from "../lib/ui/debounce";

// movie-log spec: logging a viewing, via the manual form or by parsing a
// Pathé booking email, with best-effort OMDb enrichment. See
// log-viewing.ts for the shared write path both entry points use.
//
// location-management spec: the medium/venue picklists (a sidecar CalDAV
// object) are offered as <datalist> suggestions rather than a closed
// dropdown, so logging with a new medium/venue still works — it's just
// not offered as a choice until this same form's own submission adds it.
//
// #8/#203: a venue with no known coordinates gets an optional,
// skippable Nominatim address-search lookup on the manual form; a venue
// that already has coordinates (from an earlier logged viewing) has
// them attached automatically instead, no field shown. The Pathé flow
// only gets the automatic-reuse half — its confirm step is a fixed
// read-only summary, not an editable form, and a Pathé booking's cinema
// rarely lacks known coordinates in practice (movie-planner's own
// hardcoded venue fixtures cover the actual Pathé locations).

let credentials: Credentials | null = null;

// biome-ignore lint/correctness/noUnusedVariables: read in the template below, which Biome does not parse for .svelte files
let status = $state("");
let picklists = $state<Picklists>({ media: [], venues: [] });
// #8/#203: a lightweight wide-range query (same range Venues/heatmap
// already use) purely to back findKnownGeo's reuse lookup — this form
// had no reason to load any viewings before.
let allViewings = $state<LoggedViewing[]>([]);
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
	// Best-effort — neither fetch failing should block logging, same
	// spirit as OMDb enrichment failing soft elsewhere in this form.
	try {
		picklists = await getPicklists(caldavConfig());
	} catch {
		// Suggestions just stay empty; free-text entry still works.
	}
	try {
		allViewings = await listViewings(caldavConfig(), importCheckRange());
	} catch {
		// The geo reuse lookup just finds nothing; the address-search
		// field still works.
	}
}
init();

// location-management spec, "First venue added": logging with a
// medium/venue not already in the picklist adds it — auto-learned from
// what visitors actually type, no separate management screen needed.
async function learnFromViewing(medium: string, venue: string | undefined) {
	let changed = false;
	let next = picklists;
	if (medium && !next.media.includes(medium)) {
		next = { ...next, media: [...next.media, medium] };
		changed = true;
	}
	if (venue && !next.venues.includes(venue)) {
		next = { ...next, venues: [...next.venues, venue] };
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
				try {
					const metadata = await lookupByImdbId(credentials.omdbApiKey, candidate.imdbId);
					if (metadata) {
						await updateViewing(caldavConfig(), viewing.uid, { ...viewing, ...metadata });
					}
					status = "Logged and matched.";
				} catch (error) {
					status = error instanceof Error ? error.message : "Failed to attach the selected match.";
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

let geoQuery = $state("");
// biome-ignore lint/correctness/noUnusedVariables: read in the template below, which Biome does not parse for .svelte files
let geoCandidates = $state<GeoCandidate[]>([]);
// biome-ignore lint/correctness/noUnusedVariables: read in the template below, which Biome does not parse for .svelte files
let geoSearching = $state(false);
let chosenGeo = $state<{ lat: number; lon: number } | undefined>();
// biome-ignore lint/correctness/noUnusedVariables: read in the template below, which Biome does not parse for .svelte files
let chosenGeoLabel = $state("");
let chosenGeoFor = $state("");

const knownGeo = $derived(venue ? findKnownGeo(venue, allViewings) : undefined);
const manualGeo = $derived(knownGeo ?? (chosenGeoFor === venue ? chosenGeo : undefined));

const runGeoSearch = debounce(async (query: string) => {
	if (!query.trim()) {
		geoCandidates = [];
		geoSearching = false;
		return;
	}
	geoSearching = true;
	geoCandidates = await searchAddress(query);
	geoSearching = false;
}, 400);

// biome-ignore lint/correctness/noUnusedVariables: bound in the template below, which Biome does not parse for .svelte files
function onGeoQueryInput() {
	runGeoSearch(geoQuery);
}

// biome-ignore lint/correctness/noUnusedVariables: bound in the template below, which Biome does not parse for .svelte files
function chooseGeo(candidate: GeoCandidate) {
	chosenGeo = { lat: candidate.lat, lon: candidate.lon };
	chosenGeoLabel = candidate.label;
	chosenGeoFor = venue;
	geoCandidates = [];
	geoQuery = "";
}

// biome-ignore lint/correctness/noUnusedVariables: bound in the template below, which Biome does not parse for .svelte files
async function handleManualSubmit(event: SubmitEvent) {
	event.preventDefault();
	if (!credentials) return;
	const loggedMedium = medium;
	const loggedVenue = venue || undefined;
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
			geo: manualGeo,
		});
		status = "Logged.";
		allViewings = [...allViewings, result.viewing];
		title = "";
		date = "";
		startTime = "";
		endTime = "";
		medium = "";
		venue = "";
		chosenGeo = undefined;
		chosenGeoFor = "";
		geoQuery = "";
		geoCandidates = [];
		await learnFromViewing(loggedMedium, loggedVenue);
		if (result.omdbCandidates?.length) showOmdbPicker(result.viewing, result.omdbCandidates);
	} catch (error) {
		status = error instanceof Error ? error.message : "Failed to log viewing.";
	}
}

// ---- Pathé email parsing ----

let patheEmailText = $state("");
let patheFileInput = $state<HTMLInputElement>();
let parsedBooking = $state<PatheBooking | undefined>();
// biome-ignore lint/correctness/noUnusedVariables: read in the template below, which Biome does not parse for .svelte files
let confirmVisible = $state(false);

const patheKnownGeo = $derived(
	parsedBooking ? findKnownGeo(parsedBooking.cinema, allViewings) : undefined,
);

// biome-ignore lint/correctness/noUnusedVariables: bound in the template below, which Biome does not parse for .svelte files
async function handlePatheFileChange() {
	const file = patheFileInput?.files?.[0];
	if (file) patheEmailText = await file.text();
}

// biome-ignore lint/correctness/noUnusedVariables: bound in the template below, which Biome does not parse for .svelte files
async function handleParse() {
	try {
		parsedBooking = await parsePatheEmail(patheEmailText);
		confirmVisible = true;
		status = "";
	} catch (error) {
		confirmVisible = false;
		status = error instanceof Error ? error.message : "Could not parse this email.";
	}
}

// biome-ignore lint/correctness/noUnusedVariables: bound in the template below, which Biome does not parse for .svelte files
async function handleConfirm() {
	if (!parsedBooking || !credentials) return;
	const booking = parsedBooking;
	try {
		const result = await logPatheBooking(credentials, booking, patheKnownGeo);
		status = result.wasUpdate ? "Updated the existing entry." : "Logged.";
		confirmVisible = false;
		allViewings = [...allViewings, result.viewing];
		await learnFromViewing("cinema", booking.cinema);
		patheEmailText = "";
		parsedBooking = undefined;
		if (result.omdbCandidates?.length) showOmdbPicker(result.viewing, result.omdbCandidates);
	} catch (error) {
		status = error instanceof Error ? error.message : "Failed to log viewing.";
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
      <div class={FIELD_WRAPPER}>
        <label class={LABEL} for="log-venue">Venue</label>
        <input
          class={INPUT}
          id="log-venue"
          name="log-venue"
          type="text"
          list="log-venue-choices"
          bind:value={venue}
        />
      </div>

      {#if venue && knownGeo}
        <p class={STATUS_TEXT}>Using {venue}'s known location.</p>
      {:else if venue}
        <div class="flex flex-col gap-2 rounded-lg bg-slate-50 p-3 dark:bg-slate-900/40">
          <label class={LABEL} for="log-geo-search">
            Search for "{venue}"'s address (optional)
          </label>
          <input
            class={INPUT}
            id="log-geo-search"
            type="text"
            placeholder="Address or venue name"
            bind:value={geoQuery}
            oninput={onGeoQueryInput}
          />
          {#if geoSearching}
            <p class={STATUS_TEXT}>Searching…</p>
          {/if}
          {#if geoCandidates.length > 0}
            <ul class="flex flex-col gap-1">
              {#each geoCandidates as candidate (candidate.label)}
                <li>
                  <button
                    type="button"
                    class="text-left text-sm text-indigo-600 hover:underline dark:text-indigo-400"
                    onclick={() => chooseGeo(candidate)}
                  >
                    {candidate.label}
                  </button>
                </li>
              {/each}
            </ul>
          {/if}
          {#if chosenGeoFor === venue && chosenGeo}
            <p class={STATUS_TEXT}>Location set: {chosenGeoLabel}</p>
          {/if}
        </div>
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
          <dt class={DT}>Start</dt>
          <dd class={DD}>{formatDateTime(parsedBooking.start)}</dd>
          <dt class={DT}>End</dt>
          <dd class={DD}>{formatDateTime(parsedBooking.end)}</dd>
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
  <datalist id="log-venue-choices">
    {#each picklists.venues as option (option)}
      <option value={option}>{option}</option>
    {/each}
  </datalist>

  <p class={STATUS_TEXT} role="status">{status}</p>
  <div bind:this={pickerArea}></div>
</div>
