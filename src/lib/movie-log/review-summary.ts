export interface ReviewCounts {
  newRows: number;
  updates: number;
  skipped: number;
  failed: number;
}

// #935: the sentence the import page shows above the review table. Skipped rows
// are expected leftovers (an IMDb export's series, say), not faults, so a file
// of nothing but those reads "nothing to import" rather than "ready to review".
export function reviewSummary({ newRows, updates, skipped, failed }: ReviewCounts): string {
  const parts = [`${newRows} new row(s)`];
  if (updates > 0) parts.push(`${updates} existing entry update(s)`);
  if (skipped > 0) parts.push(`${skipped} skipped (not films)`);
  if (failed > 0) parts.push(`${failed} failed to parse`);
  const nothingToImport = skipped > 0 && newRows === 0 && updates === 0;
  return `${parts.join(", ")}${nothingToImport ? "; nothing to import." : " ready to review."}`;
}
