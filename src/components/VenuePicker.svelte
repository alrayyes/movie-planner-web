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
// biome-ignore lint/correctness/noUnusedImports: used in the template below, which Biome does not parse for .svelte files
import { venueDisplay } from "../lib/venue/display";

// #452: shared by the log form and the edit form — a native <select>
// populated from the picklist's own known venues (never free text), plus
// a reachable "Add venue" form for a genuinely new one. Structured-venue-
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
interface Props {
	idPrefix: string;
	picklists: Picklists;
	value: string;
	onAddVenue: (entry: VenueEntry) => void | Promise<void>;
	onEditVenue: (entry: VenueEntry) => void | Promise<void>;
}

// biome-ignore lint/correctness/noUnusedVariables: idPrefix/picklists are read in the template below, which Biome does not parse for .svelte files
let { idPrefix, picklists, value = $bindable(), onAddVenue, onEditVenue }: Props = $props();

// biome-ignore lint/correctness/noUnusedVariables: read in the template below, which Biome does not parse for .svelte files
let addingVenue = $state(false);
// biome-ignore lint/correctness/noUnusedVariables: read in the template below, which Biome does not parse for .svelte files
let editingVenue = $state(false);
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

function resetForm() {
	addingVenue = false;
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
	resetForm();
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
	resetForm();
}
</script>

<div class={FIELD_WRAPPER}>
  <label class={LABEL} for={`${idPrefix}-venue`}>Venue</label>
  <select class={INPUT} id={`${idPrefix}-venue`} bind:value>
    <option value="">No venue</option>
    {#each picklists.venues as entry (entry.name)}
      <option value={entry.name}>{venueDisplay(entry.name, entry.city)}</option>
    {/each}
  </select>
</div>

{#if !addingVenue && !editingVenue}
  <div class="flex gap-2">
    <button
      type="button"
      class={`${BUTTON_SECONDARY} self-start`}
      onclick={() => (addingVenue = true)}
    >
      Add venue
    </button>
    {#if selectedEntry}
      <button
        type="button"
        class={`${BUTTON_SECONDARY} self-start`}
        onclick={startEditVenue}
      >
        Edit venue
      </button>
    {/if}
  </div>
{:else}
  {@const formPrefix = editingVenue ? "edit-venue" : "add-venue"}
  <div
    class="flex flex-col gap-3 rounded-lg bg-slate-50 p-3 dark:bg-slate-900/40"
    role="group"
    aria-label={editingVenue ? "Edit this venue" : "Add a new venue"}
  >
    <div class={FIELD_WRAPPER}>
      <label class={LABEL} for={`${idPrefix}-${formPrefix}-name`}>Name</label>
      <input
        class={INPUT}
        id={`${idPrefix}-${formPrefix}-name`}
        type="text"
        required
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
      <button type="button" class={`${BUTTON_SECONDARY} self-start`} onclick={resetForm}>
        Cancel
      </button>
    </div>
  </div>
{/if}
