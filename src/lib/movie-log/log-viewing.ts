import { createViewing } from "../caldav/client";
import type { CaldavConfig, LoggedViewing, NewViewing } from "../caldav/types";
import type { Credentials } from "../credentials/types";
import { CINEMA } from "../medium/display";
import { lookupMovie, type MovieMetadata, type OmdbCandidate, searchMovies } from "../omdb/client";
import { enrichWithTmdb } from "../tmdb/client";

// #603: log-viewing-button.ts dispatches this on `window` when clicked;
// LogViewingWizard.svelte (mounted once, globally, in SiteHeader.astro)
// listens for it and opens its own <dialog> — the same
// dispatch-a-named-event decoupling CREDENTIALS_CONNECTED_EVENT already
// uses between a vanilla Web Component and whatever needs to react,
// since the trigger (a plain custom element) and the wizard (a Svelte
// island) have no direct reference to each other.
export const OPEN_LOG_VIEWING_WIZARD_EVENT = "movie-planner-web:open-log-viewing-wizard";

// #49: the outcome of a logged/refreshed OMDb lookup — either a confident
// match (attached automatically) or, when there's none, the candidates a
// visitor can pick from (empty/absent when OMDb's search itself found
// nothing, in which case the entry is silently left without metadata,
// same as before this feature existed).
interface OmdbEnrichment {
  fields: Partial<NewViewing>;
  candidates?: OmdbCandidate[];
}

export interface LogResult {
  viewing: LoggedViewing;
  omdbCandidates?: OmdbCandidate[];
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
  } catch {
    return { fields: {} };
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
  const enrichment = preselectedOmdb
    ? {
        fields: {
          ...preselectedOmdb,
          ...(await enrichWithTmdb(credentials.tmdbApiKey, preselectedOmdb.imdbId)),
        },
      }
    : await enrichWithOmdb(credentials, viewing.title, viewing.start);
  const created = await createViewing(config, { ...viewing, ...enrichment.fields });
  return { viewing: created, omdbCandidates: enrichment.candidates };
}
