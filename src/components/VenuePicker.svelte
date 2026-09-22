<script lang="ts">
import type { Picklists, VenueEntry } from "../lib/caldav/types";
import { type GeoCandidate, searchAddress } from "../lib/geo/nominatim";
// biome-ignore lint/correctness/noUnusedImports: used in the template below, which Biome does not parse for .svelte files
import {
	BUTTON_PRIMARY,
	BUTTON_SECONDARY,
	FIELD_WRAPPER,
	INPUT,
	LABEL,
	STATUS_TEXT,
} from "../lib/ui/classes";
import { debounce } from "../lib/ui/debounce";
import type { MissingVenue } from "../lib/venue/backfill";
// biome-ignore lint/correctness/noUnusedImports: used in the template below, which Biome does not parse for .svelte files
import { venueDisplay } from "../lib/venue/display";

// #452: shared by the log form and the edit form — a native <select>
// populated from the picklist's own known venues (never free text), plus
// a reachable "Add venue" dialog for a genuinely new one. Structured-venue-
// picklist's own design: a visitor can only ever pick an already-known
// venue here; a new one is captured with its own separate name/address/
// postal code/city/country fields (plus an optional Nominatim address-
// search lookup for coordinates, the same one the log form used to run
// inline for whatever venue name was currently typed) and becomes
// selectable the moment it's added. Selecting a venue's own city/
// country/geo/address is read directly off its picklist entry by the
// caller (LogViewingForm.svelte/MovieDetails.svelte) — this component
// only owns the picking and the adding, not what happens with the
// selection afterward.
//
// #601: the add/edit form is a native <dialog> (showModal()) — the same
// pattern MediumPicker.svelte (#600) and the Search OMDb dialog
// (#596/#597) already established, replacing what used to be an inline
// panel expanding in place. One dialog shared by both modes (its own
// title/fields swap on `editingVenue`), not two.
interface Props {
	idPrefix: string;
	picklists: Picklists;
	value: string;
	onAddVenue: (entry: VenueEntry) => void | Promise<void>;
	onEditVenue: (entry: VenueEntry) => void | Promise<void>;
	// #636: venue names already seen in the visitor's own viewing history
	// but not yet in the picklist — computed lazily by the caller (a
	// listViewings() call, so it only runs when "Add venue" is actually
	// opened) rather than eagerly on every mount.
	missingVenues?: MissingVenue[];
	onLoadMissingVenues?: () => void | Promise<void>;
	// #657: entries, not bare names — missingVenues (above) already
	// carries whatever city/country/address/geo a matching viewing has,
	// and that's the only place this data is available at promotion
	// time; passing names back up would lose it.
	onBulkAddVenues?: (entries: VenueEntry[]) => void | Promise<void>;
}

let {
	// biome-ignore lint/correctness/noUnusedVariables: read in the template below, which Biome does not parse for .svelte files
	idPrefix,
	picklists,
	value = $bindable(),
	onAddVenue,
	onEditVenue,
	missingVenues = [],
	onLoadMissingVenues,
	onBulkAddVenues,
}: Props = $props();

let editingVenue = $state(false);
let selectedMissingVenues = $state<Set<string>>(new Set());
let venueDialogEl = $state<HTMLDialogElement>();
let newName = $state("");
let newStreet = $state("");
let newPostal = $state("");
let newCity = $state("");
let newCountry = $state("");
let geoQuery = $state("");
// biome-ignore lint/correctness/noUnusedVariables: read in the template below, which Biome does not parse for .svelte files
let geoCandidates = $state<GeoCandidate[]>([]);
// biome-ignore lint/correctness/noUnusedVariables: read in the template below, which Biome does not parse for .svelte files
let geoSearching = $state(false);
let chosenGeo = $state<{ lat: number; lon: number } | undefined>();
// biome-ignore lint/correctness/noUnusedVariables: read in the template below, which Biome does not parse for .svelte files
let chosenGeoLabel = $state("");

// #519: the venue currently selected in the <select>, if it matches a
// known picklist entry — "Edit venue" only makes sense once one is
// picked, and pre-fills the form from exactly this entry's own fields.
const selectedEntry = $derived(picklists.venues.find((entry) => entry.name === value));

// #601: computed here rather than as a template {@const} — a <dialog>
// isn't one of the block constructs {@const} is allowed as an
// immediate child of.
// biome-ignore lint/correctness/noUnusedVariables: read in the template below, which Biome does not parse for .svelte files
const formPrefix = $derived(editingVenue ? "edit-venue" : "add-venue");

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
	geoCandidates = [];
	geoQuery = "";
}

// #601: fires on every dialog close, however it happens — Cancel, Esc,
// clicking outside, or the programmatic close() after a save below —
// same one-place-resets-it pattern as MediumPicker's own
// resetAddMediumDialog and the Search OMDb dialog's resetSearchDialog.
// biome-ignore lint/correctness/noUnusedVariables: bound in the template below, which Biome does not parse for .svelte files
function resetForm() {
	editingVenue = false;
	newName = "";
	newStreet = "";
	newPostal = "";
	newCity = "";
	newCountry = "";
	geoQuery = "";
	geoCandidates = [];
	chosenGeo = undefined;
	chosenGeoLabel = "";
	selectedMissingVenues = new Set();
}

// biome-ignore lint/correctness/noUnusedVariables: bound in the template below, which Biome does not parse for .svelte files
function startAddVenue() {
	editingVenue = false;
	newName = "";
	newStreet = "";
	newPostal = "";
	newCity = "";
	newCountry = "";
	geoQuery = "";
	geoCandidates = [];
	chosenGeo = undefined;
	chosenGeoLabel = "";
	selectedMissingVenues = new Set();
	// #636: fetched lazily, only on actually opening this dialog — never
	// on a normal log/edit dialog open.
	onLoadMissingVenues?.();
	venueDialogEl?.showModal();
}

// biome-ignore lint/correctness/noUnusedVariables: bound in the template below, which Biome does not parse for .svelte files
async function handleAddVenue() {
	const name = newName.trim();
	if (!name) return;
	const entry: VenueEntry = { name };
	if (newStreet.trim()) entry.streetAddress = newStreet.trim();
	if (newPostal.trim()) entry.postalCode = newPostal.trim();
	if (newCity.trim()) entry.city = newCity.trim();
	if (newCountry.trim()) entry.country = newCountry.trim();
	if (chosenGeo) entry.geo = chosenGeo;
	await onAddVenue(entry);
	value = entry.name;
	venueDialogEl?.close();
}

// biome-ignore lint/correctness/noUnusedVariables: bound in the template below, which Biome does not parse for .svelte files
function toggleMissingVenue(name: string) {
	const next = new Set(selectedMissingVenues);
	if (next.has(name)) {
		next.delete(name);
	} else {
		next.add(name);
	}
	selectedMissingVenues = next;
}

// #657: a missing venue already carries whatever city/country/address/
// geo a matching viewing has (venuesMissingFromPicklist's own backfill)
// — seeded into the new picklist entry here, once, at promotion time,
// rather than leaving it a bare name a visitor has to re-enter by hand
// via "Edit venue".
function missingVenueToEntry(missing: MissingVenue): VenueEntry {
	const entry: VenueEntry = { name: missing.name };
	if (missing.streetAddress) entry.streetAddress = missing.streetAddress;
	if (missing.postalCode) entry.postalCode = missing.postalCode;
	if (missing.city) entry.city = missing.city;
	if (missing.country) entry.country = missing.country;
	if (missing.geo) entry.geo = missing.geo;
	return entry;
}

// #636: one write for every selected name, not one per entry — the
// picklist gains a VenueEntry per selection, seeded with whatever #657's
// own backfill already knows about it; a visitor can still "Edit venue"
// afterward to fill in or correct anything missing.
// biome-ignore lint/correctness/noUnusedVariables: bound in the template below, which Biome does not parse for .svelte files
async function handleBulkAddVenues() {
	if (selectedMissingVenues.size === 0 || !onBulkAddVenues) return;
	const names = [...selectedMissingVenues];
	const entries = missingVenues
		.filter((missing) => selectedMissingVenues.has(missing.name))
		.map(missingVenueToEntry);
	await onBulkAddVenues(entries);
	// #636 follow-up: without this, the surrounding form's own Save/Log
	// action submits with no venue at all right after a bulk add — the
	// select was never actually set to anything, unlike the single-name
	// Add flow, which always selects what it just added.
	const [firstAdded] = names;
	if (firstAdded) value = firstAdded;
	venueDialogEl?.close();
}

// #646: picking a name straight from the select's own "Already in your
// history" group — no dialog, no separate confirm step. `bind:value`
// has already updated `value` to the picked name by the time this
// fires; read it directly off the event rather than trusting timing
// between this handler and the binding's own change listener. Persists
// with the same single-write shape handleBulkAddVenues above uses, just
// for one name instead of a checked set.
// biome-ignore lint/correctness/noUnusedVariables: bound in the template below, which Biome does not parse for .svelte files
async function handleSelectHistoryVenue(event: Event) {
	const selected = (event.currentTarget as HTMLSelectElement).value;
	if (!selected || !onBulkAddVenues) return;
	if (picklists.venues.some((entry) => entry.name === selected)) return;
	const missing = missingVenues.find((entry) => entry.name === selected);
	if (!missing) return;
	await onBulkAddVenues([missingVenueToEntry(missing)]);
}

// biome-ignore lint/correctness/noUnusedVariables: bound in the template below, which Biome does not parse for .svelte files
function startEditVenue() {
	const entry = selectedEntry;
	if (!entry) return;
	newName = entry.name;
	newStreet = entry.streetAddress ?? "";
	newPostal = entry.postalCode ?? "";
	newCity = entry.city ?? "";
	newCountry = entry.country ?? "";
	chosenGeo = entry.geo;
	chosenGeoLabel = "";
	editingVenue = true;
	venueDialogEl?.showModal();
}

// biome-ignore lint/correctness/noUnusedVariables: bound in the template below, which Biome does not parse for .svelte files
async function handleEditVenue() {
	// The name stays fixed — it's how past viewings' own `venue` field
	// still matches this entry; renaming isn't part of this form.
	const entry: VenueEntry = { name: newName };
	if (newStreet.trim()) entry.streetAddress = newStreet.trim();
	if (newPostal.trim()) entry.postalCode = newPostal.trim();
	if (newCity.trim()) entry.city = newCity.trim();
	if (newCountry.trim()) entry.country = newCountry.trim();
	if (chosenGeo) entry.geo = chosenGeo;
	await onEditVenue(entry);
	venueDialogEl?.close();
}
</script>

<div class={FIELD_WRAPPER}>
  <label class={LABEL} for={`${idPrefix}-venue`}>Venue</label>
  <select
    class={INPUT}
    id={`${idPrefix}-venue`}
    bind:value
    onchange={handleSelectHistoryVenue}
  >
    <option value="">No venue</option>
    {#each picklists.venues as entry (entry.name)}
      <option value={entry.name}>{venueDisplay(entry.name, entry.city)}</option>
    {/each}
    {#if missingVenues.length > 0}
      <optgroup label="Already in your history">
        {#each missingVenues as missing (missing.name)}
          <option value={missing.name}>{missing.name} ({missing.count})</option>
        {/each}
      </optgroup>
    {/if}
  </select>
</div>

<div class="flex gap-2">
  <button type="button" class={`${BUTTON_SECONDARY} self-start`} onclick={startAddVenue}>
    Add venue
  </button>
  {#if selectedEntry}
    <button type="button" class={`${BUTTON_SECONDARY} self-start`} onclick={startEditVenue}>
      Edit venue
    </button>
  {/if}
</div>

<!-- #601: same native <dialog> pattern as MediumPicker's own "Add
medium" (#600) and ViewingHeatmap.svelte/keyboard-nav.ts's dialogs —
showModal()'s own default (viewport-centered, fixed) needs nothing
extra here. One dialog shared by both Add and Edit, its own
title/fields swapping on editingVenue. -->
<dialog
  bind:this={venueDialogEl}
  aria-label={editingVenue ? "Edit this venue" : "Add a new venue"}
  class="max-w-sm rounded-lg border border-slate-200 bg-white p-4 text-slate-900 shadow-lg backdrop:bg-slate-900/40 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
  onclick={(event) => {
    if (event.target === venueDialogEl) venueDialogEl?.close();
  }}
  onclose={resetForm}
>
  <div class="flex flex-col gap-3">
    <h2 class="text-base font-semibold text-slate-900 dark:text-slate-100">
      {editingVenue ? "Edit this venue" : "Add a new venue"}
    </h2>
    {#if !editingVenue && missingVenues.length > 0}
      <div class="flex flex-col gap-2" aria-label="Already in your history, not yet added">
        <p class={LABEL}>Already in your history, not yet added</p>
        <ul class="flex max-h-48 flex-col gap-1 overflow-y-auto">
          {#each missingVenues as missing (missing.name)}
            <li>
              <label class="flex items-center gap-2 text-slate-700 dark:text-slate-300">
                <input
                  type="checkbox"
                  checked={selectedMissingVenues.has(missing.name)}
                  onchange={() => toggleMissingVenue(missing.name)}
                />
                <span class="text-sm">{missing.name} ({missing.count})</span>
              </label>
            </li>
          {/each}
        </ul>
        <button
          type="button"
          class={`${BUTTON_SECONDARY} self-start`}
          disabled={selectedMissingVenues.size === 0}
          onclick={handleBulkAddVenues}
        >
          Add selected
        </button>
      </div>
    {/if}
    <div class={FIELD_WRAPPER}>
      <label class={LABEL} for={`${idPrefix}-${formPrefix}-name`}>Name</label>
      <!-- Not `required`: this dialog can be a descendant of the
      manual-log <form> (VenuePicker is mounted directly inside it),
      and a `required` field the browser can't focus while the dialog
      is closed (display:none) makes Chromium silently abort the
      *outer* form's own submit instead of reporting anything — see
      MediumPicker.svelte's own identical note (#600, confirmed live).
      The empty check in handleAddVenue below is what actually guards
      this. -->
      <input
        class={INPUT}
        id={`${idPrefix}-${formPrefix}-name`}
        type="text"
        disabled={editingVenue}
        bind:value={newName}
      />
    </div>
    <div class={FIELD_WRAPPER}>
      <label class={LABEL} for={`${idPrefix}-${formPrefix}-street`}>Street address (optional)</label>
      <input class={INPUT} id={`${idPrefix}-${formPrefix}-street`} type="text" bind:value={newStreet} />
    </div>
    <div class={FIELD_WRAPPER}>
      <label class={LABEL} for={`${idPrefix}-${formPrefix}-postal`}>Postal code (optional)</label>
      <input class={INPUT} id={`${idPrefix}-${formPrefix}-postal`} type="text" bind:value={newPostal} />
    </div>
    <div class={FIELD_WRAPPER}>
      <label class={LABEL} for={`${idPrefix}-${formPrefix}-city`}>City (optional)</label>
      <input class={INPUT} id={`${idPrefix}-${formPrefix}-city`} type="text" bind:value={newCity} />
    </div>
    <div class={FIELD_WRAPPER}>
      <label class={LABEL} for={`${idPrefix}-${formPrefix}-country`}>Country (optional)</label>
      <input class={INPUT} id={`${idPrefix}-${formPrefix}-country`} type="text" bind:value={newCountry} />
    </div>
    <div class={FIELD_WRAPPER}>
      <label class={LABEL} for={`${idPrefix}-${formPrefix}-geo-search`}>
        Search for its address (optional)
      </label>
      <input
        class={INPUT}
        id={`${idPrefix}-${formPrefix}-geo-search`}
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
      {#if chosenGeo}
        <p class={STATUS_TEXT}>Location set: {chosenGeoLabel}</p>
      {/if}
    </div>
    <div class="flex gap-2">
      {#if editingVenue}
        <button type="button" class={`${BUTTON_PRIMARY} self-start`} onclick={handleEditVenue}>
          Save venue
        </button>
      {:else}
        <button type="button" class={`${BUTTON_PRIMARY} self-start`} onclick={handleAddVenue}>
          Add
        </button>
      {/if}
      <button
        type="button"
        class={`${BUTTON_SECONDARY} self-start`}
        onclick={() => venueDialogEl?.close()}
      >
        Cancel
      </button>
    </div>
  </div>
</dialog>
