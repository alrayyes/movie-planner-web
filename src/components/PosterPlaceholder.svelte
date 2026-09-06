<script lang="ts">
// #236: stands in for a poster wherever OMDb had none (no match, no
// poster on the matched record, or enrichment skipped entirely) — same
// slot/size a real poster occupies, so the layout doesn't leave a gap.
// Reuses the heatmap's own #230-fixed empty-cell shade (bg-slate-100
// dark:bg-slate-700) rather than picking a new pair, since that one's
// already confirmed visible against Layout.astro's card background in
// both themes.
// biome-ignore lint/correctness/noUnusedVariables: used in the template below, which Biome does not parse for .svelte files
let { class: className = "" }: { class?: string } = $props();
</script>

<div
  class={`flex items-center justify-center bg-slate-100 text-slate-400 dark:bg-slate-700 dark:text-slate-500 ${className}`}
  role="img"
  aria-label="No poster available"
>
  <svg
    viewBox="0 0 24 24"
    fill="currentColor"
    class="h-1/2 w-1/2"
    aria-hidden="true"
  >
    <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.5" />
    <circle cx="12" cy="12" r="2.1" />
    <circle cx="12" cy="5.3" r="1.2" />
    <circle cx="12" cy="18.7" r="1.2" />
    <circle cx="5.3" cy="12" r="1.2" />
    <circle cx="18.7" cy="12" r="1.2" />
    <circle cx="7.3" cy="7.3" r="1.2" />
    <circle cx="16.7" cy="7.3" r="1.2" />
    <circle cx="7.3" cy="16.7" r="1.2" />
    <circle cx="16.7" cy="16.7" r="1.2" />
  </svg>
</div>
