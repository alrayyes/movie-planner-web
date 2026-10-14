import { getViewing, updateViewing } from "../caldav/client";
import type { CaldavConfig, LoggedViewing } from "../caldav/types";
import { enrichWithTmdb } from "../tmdb/client";
import {
  lookupByImdbId,
  lookupMovie,
  type OmdbCandidate,
  OmdbUnavailableError,
  searchMovies,
} from "./client";
import { isOmdbComplete } from "./metadata";

// #575: the per-row/bulk refresh and disambiguation-picker logic, shared
// between CalendarOverview.svelte and the missing-data overview
// (design.md's "Extract the refresh/picker/bulk-refresh logic into a
// shared module" decision) rather than duplicated a second time. Every
// scenario here mirrors the movie-editing capability spec's own
// requirements verbatim — this module, not either component, is now the
// one place those scenarios are implemented.

// #881: OMDb and TMDb leave out what they don't have, and a spread copies an
// explicit `undefined` over the value already on the entry. Only what a lookup
// actually returned is laid over it.
function definedFields<T extends object>(fields: T | undefined): Partial<T> {
  return Object.fromEntries(
    Object.entries(fields ?? {}).filter(([, value]) => value !== undefined),
  ) as Partial<T>;
}

// #881: an entry that already has an IMDb ID is asked about by that ID. Looking
// its title up again could swap a match the visitor chose for another film.
function lookupFor(omdbApiKey: string, viewing: LoggedViewing) {
  return viewing.imdbId
    ? lookupByImdbId(omdbApiKey, viewing.imdbId)
    : lookupMovie(omdbApiKey, viewing.title, new Date(viewing.start).getFullYear().toString());
}

// #881: for an entry that has an IMDb ID the dead end is the ID, not the title,
// and the picker that used to offer a way out never opens, so say where it is.
export function noMatchMessage({ imdbId }: { imdbId?: string }): string {
  return imdbId
    ? `OMDb has nothing for IMDb ID ${imdbId}. Use Search OMDb to pick another match.`
    : "OMDb had no match for this title.";
}

export type RefreshResult =
  | { kind: "already-up-to-date" }
  | { kind: "refreshed"; viewing: LoggedViewing }
  | { kind: "no-match"; imdbId?: string }
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
  if (isOmdbComplete(current)) {
    return { kind: "already-up-to-date" };
  }

  const metadata = await lookupFor(omdbApiKey, current);
  if (metadata) {
    const tmdbFields = await enrichWithTmdb(tmdbApiKey, metadata.imdbId);
    const updated = await updateViewing(config, current.uid, {
      ...current,
      ...definedFields(metadata),
      ...definedFields(tmdbFields),
    });
    return { kind: "refreshed", viewing: updated };
  }

  // An entry with its own ID has no better match to offer: OMDb has nothing for it.
  if (current.imdbId) return { kind: "no-match", imdbId: current.imdbId };

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
    ...definedFields(metadata),
    ...definedFields(tmdbFields),
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
export async function refreshAllMetadata(params: RefreshAllParams): Promise<{
  refreshed: number;
  misses: number;
  stoppedBecause?: string;
  stillIncomplete: string[];
}> {
  const { config, omdbApiKey, tmdbApiKey, targets, onProgress } = params;
  let refreshed = 0;
  let misses = 0;
  // #898: titles OMDb answered for that are still incomplete afterwards, so the
  // caller can stop sending them on every press.
  const stillIncomplete: string[] = [];
  for (const viewing of targets) {
    try {
      const metadata = await lookupFor(omdbApiKey, viewing);
      if (metadata) {
        const tmdbFields = await enrichWithTmdb(tmdbApiKey, metadata.imdbId);
        const updated = {
          ...viewing,
          ...definedFields(metadata),
          ...definedFields(tmdbFields),
        };
        await updateViewing(config, viewing.uid, updated);
        refreshed++;
        if (!isOmdbComplete(updated)) stillIncomplete.push(viewing.uid);
      } else {
        misses++;
      }
    } catch (error) {
      // #888: OMDb refusing a request (the daily quota, a bad key) would be
      // refused again for every title after it, so the run stops there and says
      // why instead of counting the rest as titles with no match.
      if (error instanceof OmdbUnavailableError) {
        return { refreshed, misses, stoppedBecause: error.message, stillIncomplete };
      }
      misses++;
    }
    onProgress(refreshed, misses, targets.length);
  }
  return { refreshed, misses, stillIncomplete };
}

// #898: which of the incomplete titles a bulk refresh should send. One OMDb already
// answered without completing is left out until the retry window passes; a
// refresh of that title on its own always asks.
export function planBulkRefresh<T extends { uid: string }>(
  incomplete: readonly T[],
  wasTried: (uid: string) => boolean,
): { targets: T[]; skipped: number } {
  const targets = incomplete.filter((entry) => !wasTried(entry.uid));
  return { targets, skipped: incomplete.length - targets.length };
}

export function skippedNote(skipped: number): string {
  if (skipped === 0) return "";
  return skipped === 1
    ? " 1 title was left out: OMDb already answered without completing it. Refresh it on its own to ask again."
    : ` ${skipped} titles were left out: OMDb already answered without completing them. Refresh them on their own to ask again.`;
}

// What the page says when a bulk refresh is over, shared by the overview and the
// missing-data page. A run OMDb stopped (#888) says how far it got and why.
export function bulkRefreshMessage(
  result: { refreshed: number; misses: number; stoppedBecause?: string },
  total: number,
  skipped = 0,
): string {
  const { refreshed, misses, stoppedBecause } = result;
  if (total === 0 && skipped > 0) return `Nothing sent to OMDb.${skippedNote(skipped)}`;
  if (stoppedBecause) {
    return `Stopped after ${refreshed + misses} of ${total} (${refreshed} refreshed): ${stoppedBecause}${skippedNote(skipped)}`;
  }
  return (
    (misses > 0
      ? `Refreshed ${refreshed} of ${total} (${misses} had no OMDb match or failed).`
      : `Refreshed ${refreshed} of ${total}.`) + skippedNote(skipped)
  );
}
