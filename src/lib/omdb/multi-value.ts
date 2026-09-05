// #163: actors and genre are stored as one OMDb-sourced comma-separated
// string, unlike venue/medium which are genuinely single-valued — this
// is the one place that splits them into individual values, shared by
// the details page's clickable chips and the overview's per-value
// filter match, so a filter click always matches exactly what a chip
// showed.
export function splitMultiValue(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}
