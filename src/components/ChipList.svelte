<script lang="ts">
// #414: a details-page chip list (director/actor/genre) — extracted since
// all three rendered the identical markup, and a title with dozens of
// actors made that list dominate the whole page. Caps what's shown until
// a visitor asks for the rest, rather than always rendering every chip.
interface Props {
	items: string[];
	paramName: string;
	limit?: number;
}
// biome-ignore lint/correctness/noUnusedVariables: paramName is used in the template below, which Biome does not parse for .svelte files
const { items, paramName, limit = 8 }: Props = $props();

let expanded = $state(false);
// biome-ignore lint/correctness/noUnusedVariables: used in the template below, which Biome does not parse for .svelte files
const visibleItems = $derived(expanded ? items : items.slice(0, limit));
// biome-ignore lint/correctness/noUnusedVariables: used in the template below, which Biome does not parse for .svelte files
const hiddenCount = $derived(items.length - limit);
</script>

<div class="flex flex-wrap items-center gap-1">
  {#each visibleItems as item (item)}
    <a
      href={`/?${paramName}=${encodeURIComponent(item)}`}
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
