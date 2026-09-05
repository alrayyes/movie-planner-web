import { createViewing, listViewings, updateViewing } from "../caldav/client";
import type { CaldavConfig, LoggedViewing, NewViewing } from "../caldav/types";
import type { Credentials } from "../credentials/types";
import { lookupMovie, type OmdbCandidate, searchMovies } from "../omdb/client";
import type { PatheBooking } from "./pathe-email";

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

// Shared write path for both the manual form and the Pathé-email confirm
// step — OMDb enrichment and (for a Pathé booking) re-submission dedup
// both happen here, so neither entry point can forget either one.
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
    if (metadata) return { fields: metadata };
    const candidates = await searchMovies(credentials.omdbApiKey, title);
    return candidates.length > 0 ? { fields: {}, candidates } : { fields: {} };
  } catch {
    return { fields: {} };
  }
}

export async function logManualViewing(
  credentials: Credentials,
  viewing: NewViewing,
): Promise<LogResult> {
  const config: CaldavConfig = {
    baseUrl: credentials.caldavUrl,
    username: credentials.caldavUsername,
    password: credentials.caldavPassword,
  };
  const enrichment = await enrichWithOmdb(credentials, viewing.title, viewing.start);
  const created = await createViewing(config, { ...viewing, ...enrichment.fields });
  return { viewing: created, omdbCandidates: enrichment.candidates };
}

// movie-log spec, "Re-submitted booking confirmation": a booking number
// already logged updates that entry instead of creating a duplicate.
// Detected by listing the booking's own day and matching on bookingRef —
// no dedicated CalDAV query needed, since the fixed operation set has no
// "find by custom property" operation and doesn't need one for this.
export async function logPatheBooking(
  credentials: Credentials,
  booking: PatheBooking,
): Promise<LogResult & { wasUpdate: boolean }> {
  const config: CaldavConfig = {
    baseUrl: credentials.caldavUrl,
    username: credentials.caldavUsername,
    password: credentials.caldavPassword,
  };

  const dayStart = new Date(booking.start);
  dayStart.setUTCHours(0, 0, 0, 0);
  const dayEnd = new Date(dayStart);
  dayEnd.setUTCDate(dayEnd.getUTCDate() + 1);

  const existing = await listViewings(config, {
    from: dayStart.toISOString(),
    to: dayEnd.toISOString(),
  });
  const duplicate = existing.find((v) => v.bookingRef === booking.bookingRef);

  const viewing: NewViewing = {
    title: booking.title,
    start: booking.start,
    end: booking.end,
    medium: "cinema",
    venue: booking.cinema,
    bookingRef: booking.bookingRef,
  };
  const enrichment = await enrichWithOmdb(credentials, booking.title, booking.start);
  const merged = { ...viewing, ...enrichment.fields };

  if (duplicate) {
    const updated = await updateViewing(config, duplicate.uid, merged);
    return { viewing: updated, omdbCandidates: enrichment.candidates, wasUpdate: true };
  }
  const created = await createViewing(config, merged);
  return { viewing: created, omdbCandidates: enrichment.candidates, wasUpdate: false };
}
