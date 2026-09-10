// #300/#448: shared by every paginated results table in this app —
// extracted out of CalendarOverview.svelte so the per-venue page
// (#448) can reuse the exact same page-size choices and windowed
// page-number sequence instead of re-deriving them.

// A visitor's own choice of how many rows a page holds — a select with
// fixed options rather than a free-typed number, so there's no
// zero/negative/absurdly-large value to validate against.
export const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

// Google-style windowed page numbers: first, last, and a small run
// around the current page, "…" filling any gap, rather than every page
// number when there are dozens of them.
export function computePageNumbers(currentPage: number, pages: number): (number | "…")[] {
  const current = currentPage + 1;
  const delta = 2;
  const left = Math.max(2, current - delta);
  const right = Math.min(pages - 1, current + delta);
  const result: (number | "…")[] = [1];
  if (left > 2) result.push("…");
  for (let page = left; page <= right; page++) result.push(page);
  if (right < pages - 1) result.push("…");
  if (pages > 1) result.push(pages);
  return result;
}
