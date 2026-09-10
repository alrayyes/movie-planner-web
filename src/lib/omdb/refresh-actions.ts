import { getViewing, updateViewing } from "../caldav/client";
import type { CaldavConfig, LoggedViewing } from "../caldav/types";
import { enrichWithTmdb } from "../tmdb/client";
import { lookupByImdbId, lookupMovie, type OmdbCandidate, searchMovies } from "./client";
import { hasOmdbMetadata } from "./metadata";

// #575: the per-row/bulk refresh and disambiguation-picker logic, shared
// between CalendarOverview.svelte and the missing-data overview
// (design.md's "Extract the refresh/picker/bulk-refresh logic into a
// shared module" decision) rather than duplicated a second time. Every
// scenario here mirrors the movie-editing capability spec's own
// requirements verbatim — this module, not either component, is now the
// one place those scenarios are implemented.

export type RefreshResult =
  | { kind: "already-up-to-date" }
  | { kind: "refreshed"; viewing: LoggedViewing }
  | { kind: "no-match" }
  | { kind: "needs-picker"; candidates: OmdbCandidate[]; current: LoggedViewing };

interface RefreshMetadataParams {
  config: CaldavConfig;
  omdbApiKey: string;
  tmdbApiKey?: string;
  viewing: LoggedViewing;
}

// movie-editing spec: "Refresh OMDb metadata" and its scenarios.
export async function refreshMetadata(params: RefreshMetadataParams): Promise<RefreshResult> {
  const { config, omdbApiKey, tmdbApiKey, viewing } = params;

  // "Calendar entry re-checked before calling OMDb": every subsequent
  // read/write in this function happens against this freshly-fetched
  // copy, not the possibly-stale `viewing` argument.
  const current = (await getViewing(config, viewing.uid)) ?? viewing;
  // "Already matched elsewhere since the list loaded"
  if (hasOmdbMetadata(current)) {
    return { kind: "already-up-to-date" };
  }

  const metadata = await lookupMovie(
    omdbApiKey,
    current.title,
    new Date(current.start).getFullYear().toString(),
  );
  if (metadata) {
    const tmdbFields = await enrichWithTmdb(tmdbApiKey, metadata.imdbId);
    const updated = await updateViewing(config, current.uid, {
      ...current,
      ...metadata,
      ...tmdbFields,
    });
    return { kind: "refreshed", viewing: updated };
  }

  // "No confident match on refresh": a picker when OMDb's search has
  // candidates, otherwise a plain no-match report.
  const candidates = await searchMovies(omdbApiKey, current.title);
  if (candidates.length > 0) {
    return { kind: "needs-picker", candidates, current };
  }
  return { kind: "no-match" };
}

interface ApplyCandidateParams {
  config: CaldavConfig;
  omdbApiKey: string;
  tmdbApiKey?: string;
  current: LoggedViewing;
  candidate: OmdbCandidate;
}

// The disambiguation picker's own onSelect action — fetches the chosen
// candidate's full details and attaches them, same as a confident match.
export async function applyOmdbCandidate(
  params: ApplyCandidateParams,
): Promise<{ kind: "refreshed"; viewing: LoggedViewing } | { kind: "no-match" }> {
  const { config, omdbApiKey, tmdbApiKey, current, candidate } = params;
  const metadata = await lookupByImdbId(omdbApiKey, candidate.imdbId);
  if (!metadata) return { kind: "no-match" };
  const tmdbFields = await enrichWithTmdb(tmdbApiKey, metadata.imdbId);
  const updated = await updateViewing(config, current.uid, {
    ...current,
    ...metadata,
    ...tmdbFields,
  });
  return { kind: "refreshed", viewing: updated };
}

interface RefreshAllParams {
  config: CaldavConfig;
  omdbApiKey: string;
  tmdbApiKey?: string;
  // The caller decides which viewings are in scope (a filtered page, a
  // filtered missing-data set) — this function just runs the same
  // per-viewing refresh sequentially across all of them, respecting
  // OMDb's own rate limits the same way a single refresh does.
  targets: LoggedViewing[];
  onProgress: (refreshed: number, misses: number, total: number) => void;
}

// movie-editing spec: "Refresh all metadata on screen" and its scenarios.
// Unlike refreshMetadata, this doesn't re-fetch each entry or offer a
// picker on an unconfident match — an ambiguous title is counted as a
// miss, same as today's bulk refresh, since a picker mid-batch has
// nobody to answer it.
export async function refreshAllMetadata(
  params: RefreshAllParams,
): Promise<{ refreshed: number; misses: number }> {
  const { config, omdbApiKey, tmdbApiKey, targets, onProgress } = params;
  let refreshed = 0;
  let misses = 0;
  for (const viewing of targets) {
    try {
      const metadata = await lookupMovie(
        omdbApiKey,
        viewing.title,
        new Date(viewing.start).getFullYear().toString(),
      );
      if (metadata) {
        const tmdbFields = await enrichWithTmdb(tmdbApiKey, metadata.imdbId);
        await updateViewing(config, viewing.uid, { ...viewing, ...metadata, ...tmdbFields });
        refreshed++;
      } else {
        misses++;
      }
    } catch {
      misses++;
    }
    onProgress(refreshed, misses, targets.length);
  }
  return { refreshed, misses };
}
