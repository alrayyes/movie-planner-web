import { createViewing } from "../caldav/client";
import type { CaldavConfig, LoggedViewing, NewViewing } from "../caldav/types";
import type { Credentials } from "../credentials/types";
import {
  lookupMovie,
  type MovieMetadata,
  type OmdbCandidate,
  OmdbUnavailableError,
  searchMovies,
} from "../omdb/client";
import { enrichWithTmdb } from "../tmdb/client";

// #603: log-viewing-button.ts dispatches this on `window` when clicked;
// LogViewingWizard.svelte (mounted once, globally, in SiteHeader.astro)
// listens for it and opens its own <dialog> — the same
// dispatch-a-named-event decoupling CREDENTIALS_CONNECTED_EVENT already
// uses between a vanilla Web Component and whatever needs to react,
// since the trigger (a plain custom element) and the wizard (a Svelte
// island) have no direct reference to each other.
export const OPEN_LOG_VIEWING_WIZARD_EVENT = "movie-planner-web:open-log-viewing-wizard";

// The wizard lives in the header, apart from whatever page is open behind it, so
// it announces a saved viewing on `window` for a list on that page to re-read.
export const VIEWING_SAVED_EVENT = "movie-planner-web:viewing-saved";

// #49: the outcome of a logged/refreshed OMDb lookup — either a confident
// match (attached automatically) or, when there's none, the candidates a
// visitor can pick from (empty/absent when OMDb's search itself found
// nothing, in which case the entry is silently left without metadata,
// same as before this feature existed).
interface OmdbEnrichment {
  fields: Partial<NewViewing>;
  candidates?: OmdbCandidate[];
  // #893: set when OMDb refused or couldn't be reached, so the viewing was
  // logged without metadata for a reason the visitor can be told.
  skippedBecause?: string;
}

export interface LogResult {
  viewing: LoggedViewing;
  omdbCandidates?: OmdbCandidate[];
  omdbSkippedBecause?: string;
}

// OMDb enrichment for a new viewing, kept in one place so the form and the
// wizard can't drift.
async function enrichWithOmdb(
  credentials: Credentials,
  title: string,
  watchedAt: string,
): Promise<OmdbEnrichment> {
  // #80: a visitor can pause OMDb lookups without clearing the stored
  // key, to stay under OMDb's 1,000-request/day free-tier limit while
  // logging or importing a batch — treated identically to no key set.
  if (!credentials.omdbApiKey || credentials.omdbPaused) return { fields: {} };
  try {
    const year = new Date(watchedAt).getFullYear().toString();
    const metadata = await lookupMovie(credentials.omdbApiKey, title, year);
    if (metadata) {
      // #360/#400: TMDb only ever runs off an IMDb ID OMDb has already
      // resolved — never a title/year search of its own.
      const tmdbFields = await enrichWithTmdb(credentials.tmdbApiKey, metadata.imdbId);
      return { fields: { ...metadata, ...tmdbFields } };
    }
    const candidates = await searchMovies(credentials.omdbApiKey, title);
    return candidates.length > 0 ? { fields: {}, candidates } : { fields: {} };
  } catch (error) {
    // Logging never depends on OMDb. A refusal is reported, anything else (TMDb,
    // an odd answer) is left as the silent skip it always was.
    return error instanceof OmdbUnavailableError
      ? { fields: {}, skippedBecause: error.message }
      : { fields: {} };
  }
}

// #593: a visitor who already searched OMDb and picked the exact title
// (LogViewingForm.svelte's own "Search OMDb" button) skips the automatic
// best-guess t= lookup entirely — their choice is what gets attached,
// fetching only the TMDb half (#360/#400: always keyed off an IMDb ID
// OMDb has already resolved, never its own title/year search).
export async function logManualViewing(
  credentials: Credentials,
  viewing: NewViewing,
  preselectedOmdb?: MovieMetadata,
): Promise<LogResult> {
  const config: CaldavConfig = {
    baseUrl: credentials.caldavUrl,
    username: credentials.caldavUsername,
    password: credentials.caldavPassword,
  };
  const enrichment: OmdbEnrichment = preselectedOmdb
    ? {
        fields: {
          ...preselectedOmdb,
          ...(await enrichWithTmdb(credentials.tmdbApiKey, preselectedOmdb.imdbId)),
        },
      }
    : await enrichWithOmdb(credentials, viewing.title, viewing.start);
  const created = await createViewing(config, { ...viewing, ...enrichment.fields });
  return {
    viewing: created,
    omdbCandidates: enrichment.candidates,
    omdbSkippedBecause: enrichment.skippedBecause,
  };
}
