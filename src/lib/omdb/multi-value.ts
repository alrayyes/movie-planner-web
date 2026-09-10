// #163: actors and genre are stored as one OMDb-sourced comma-separated
// string, unlike venue/medium which are genuinely single-valued — this
// is the one place that splits them into individual values, shared by
// the details page's clickable chips and the overview's per-value
// filter match, so a filter click always matches exactly what a chip
// showed.
export function splitMultiValue(value: string | undefined): string[] {
  if (!value) return [];
  // #528: OMDb data can genuinely repeat a value (a co-production
  // crediting the same country twice, say) — a chip list keyed by its
  // own value (ChipList.svelte) throws Svelte's each_key_duplicate on a
  // repeat, so this is deduped once here rather than by every caller.
  return [
    ...new Set(
      value
        .split(",")
        .map((part) => part.trim())
        .filter(Boolean),
    ),
  ];
}
