import type { LoggedViewing } from "../caldav/types";

// #89: imdbId is the one field OMDb sets only on an actual confident
// match (t=/y= or i=, never a bare candidate from s=) — its presence is
// what "the calendar entry already has metadata" means here, so a bulk
// refresh can skip it without a second, separately-tracked record of
// what's already been matched. A stale director/rating field lingering
// with no imdbId still counts as unmatched — that's what the single
// per-row Refresh control's own "correct a stale match" job is for.
export function hasOmdbMetadata(viewing: Pick<LoggedViewing, "imdbId">): boolean {
  return Boolean(viewing.imdbId);
}
