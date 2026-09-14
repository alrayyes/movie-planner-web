<script lang="ts">
import type { Picklists } from "../lib/caldav/types";
// biome-ignore lint/correctness/noUnusedImports: used in the template below, which Biome does not parse for .svelte files
import { BUTTON_PRIMARY, BUTTON_SECONDARY, FIELD_WRAPPER, INPUT, LABEL } from "../lib/ui/classes";

// #600: same native <select>-plus-"Add"-dialog shape VenuePicker.svelte
// already established for venue (#452), minus the address/geo fields —
// a medium (cinema/Netflix/Blu-ray/…) is just a name, nothing else to
// capture, and nothing to edit once added (same reasoning venue's own
// "no rename" already applies, just with no other fields to edit
// either). Built dialog-native from the start (#596/#597's Search OMDb
// dialog is the established pattern), not an inline reveal — #601
// brings VenuePicker's own existing inline "Add venue" panel in line
// with this rather than the other way around.
//
// "Cinema" is always offered, whether or not it's literally in
// `picklists.media` yet: the CLI never writes a medium property to
// CalDAV at all, so a CLI-logged viewing's own medium is genuinely
// blank, and there's no such thing as a viewing with no medium in
// practice (see mediumDisplay) — a fresh account with an empty
// picklist still needs a first sensible option to log anything at
// all, and this is it.
interface Props {
	idPrefix: string;
	picklists: Picklists;
	value: string;
	onAddMedium: (name: string) => void | Promise<void>;
}

// biome-ignore lint/correctness/noUnusedVariables: idPrefix/picklists are read in the template below, which Biome does not parse for .svelte files
let { idPrefix, picklists, value = $bindable(), onAddMedium }: Props = $props();

// biome-ignore lint/correctness/noUnusedVariables: read in the template below, which Biome does not parse for .svelte files
const options = $derived([
	"Cinema",
	...picklists.media.filter((medium) => medium.toLowerCase() !== "cinema"),
]);

let addMediumDialogEl = $state<HTMLDialogElement>();
let newMediumName = $state("");

// biome-ignore lint/correctness/noUnusedVariables: bound in the template below, which Biome does not parse for .svelte files
function startAddMedium() {
	newMediumName = "";
	addMediumDialogEl?.showModal();
}

// #600: fires on every close (Cancel, Esc, clicking outside, or the
// programmatic close() after adding below), same one-place-resets-it
// pattern as the Search OMDb dialog's own onclose.
// biome-ignore lint/correctness/noUnusedVariables: bound in the template below, which Biome does not parse for .svelte files
function resetAddMediumDialog() {
	newMediumName = "";
}

// biome-ignore lint/correctness/noUnusedVariables: bound in the template below, which Biome does not parse for .svelte files
async function handleAddMedium() {
	const name = newMediumName.trim();
	if (!name) return;
	await onAddMedium(name);
	value = name;
	addMediumDialogEl?.close();
}
</script>

<div class={FIELD_WRAPPER}>
  <label class={LABEL} for={`${idPrefix}-medium`}>Medium</label>
  <select class={INPUT} id={`${idPrefix}-medium`} required bind:value>
    {#each options as option (option)}
      <option value={option}>{option}</option>
    {/each}
  </select>
</div>

<button type="button" class={`${BUTTON_SECONDARY} self-start`} onclick={startAddMedium}>
  Add medium
</button>

<dialog
  bind:this={addMediumDialogEl}
  aria-label="Add a new medium"
  class="max-w-sm rounded-lg border border-slate-200 bg-white p-4 text-slate-900 shadow-lg backdrop:bg-slate-900/40 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
  onclick={(event) => {
    if (event.target === addMediumDialogEl) addMediumDialogEl?.close();
  }}
  onclose={resetAddMediumDialog}
>
  <div class="flex flex-col gap-3">
    <h2 class="text-base font-semibold text-slate-900 dark:text-slate-100">Add a new medium</h2>
    <div class={FIELD_WRAPPER}>
      <label class={LABEL} for={`${idPrefix}-add-medium-name`}>Name</label>
      <!-- Not `required`: this dialog can be a descendant of the outer
      "Log a viewing manually" <form> (MediumPicker is mounted directly
      inside it), and a `required` field the browser can't focus while
      the dialog is closed (display:none) makes Chromium silently abort
      the *outer* form's own submit instead of reporting anything —
      confirmed live: "An invalid form control with name='' is not
      focusable." in the console, no error, no submission. The empty
      check in handleAddMedium below is what actually guards this. -->
      <input
        class={INPUT}
        id={`${idPrefix}-add-medium-name`}
        type="text"
        bind:value={newMediumName}
        onkeydown={(event) => event.key === "Enter" && handleAddMedium()}
      />
    </div>
    <div class="flex gap-2">
      <button type="button" class={`${BUTTON_PRIMARY} self-start`} onclick={handleAddMedium}>
        Add
      </button>
      <button
        type="button"
        class={`${BUTTON_SECONDARY} self-start`}
        onclick={() => addMediumDialogEl?.close()}
      >
        Cancel
      </button>
    </div>
  </div>
</dialog>
