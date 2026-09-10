<script lang="ts">
import {
	type AttributeKind,
	// biome-ignore lint/correctness/noUnusedImports: used in the template below, which Biome does not parse for .svelte files
	attributeHref,
} from "../lib/attribute/attributes";

// #414: a details-page chip list (director/actor/genre, and — #450 —
// movie country/language) — extracted since all five render identical
// markup, and a title with dozens of actors made that list dominate the
// whole page. Caps what's shown until a visitor asks for the rest,
// rather than always rendering every chip.
// #450: each chip now links to its own dedicated, filter-free per-value
// page (attributeHref) instead of the main overview pre-filtered to it.
interface Props {
	items: string[];
	kind: AttributeKind;
	limit?: number;
}
// biome-ignore lint/correctness/noUnusedVariables: kind is used in the template below, which Biome does not parse for .svelte files
const { items, kind, limit = 8 }: Props = $props();

let expanded = $state(false);
// biome-ignore lint/correctness/noUnusedVariables: used in the template below, which Biome does not parse for .svelte files
const visibleItems = $derived(expanded ? items : items.slice(0, limit));
// biome-ignore lint/correctness/noUnusedVariables: used in the template below, which Biome does not parse for .svelte files
const hiddenCount = $derived(items.length - limit);
</script>

<div class="flex flex-wrap items-center gap-1">
  {#each visibleItems as item (item)}
    <a
      href={attributeHref(kind, item)}
      class="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-indigo-600 hover:underline dark:bg-slate-700 dark:text-indigo-400"
    >
      {item}
    </a>
  {/each}
  {#if items.length > limit}
    <button
      type="button"
      class="rounded-full px-2 py-0.5 text-xs font-medium text-indigo-600 hover:underline dark:text-indigo-400"
      aria-expanded={expanded}
      onclick={() => (expanded = !expanded)}
    >
      {expanded ? "Show fewer" : `+${hiddenCount} more`}
    </button>
  {/if}
</div>
