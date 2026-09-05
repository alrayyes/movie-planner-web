import type { LoggedViewing } from "../caldav/types";

// #113: imdbId alone stopped meaning "OMDb has confirmed a match" once
// the caldav-client capability started parsing it out of a CLI-authored
// DESCRIPTION line too (an "IMDb: ... (https://www.imdb.com/title/ttXX/)"
// line the CLI writes itself, no OMDb call involved). Treating imdbId
// alone as "already matched" made a CLI-logged entry's poster (and
// director/actors/genre/year — every field DESCRIPTION parsing never
// sets) permanently unreachable: every refresh click re-fetched the
// same bare-imdbId entry and reported "already up to date" without
// ever calling OMDb.
//
// #149: requires imdbId *and* a poster specifically — not just any one
// of director/actors/genre/year/posterUrl. A title matched with
// director/actors/genre/year but no poster (OMDb had none yet, or the
// match was made before this field existed) used to read as fully
// "matched" and could never pick one up: refresh always no-opped with
// "already up to date" rather than trying OMDb again. Requiring the
// poster specifically also keeps the earlier fix intact — imdbId alone
// isn't enough, and the movie-editing spec's own "Stale metadata
// refreshed" scenario (a stale director with no imdbId yet) still
// reads as unmatched, since imdbId is required either way.
export function hasOmdbMetadata(viewing: Pick<LoggedViewing, "imdbId" | "posterUrl">): boolean {
  return Boolean(viewing.imdbId && viewing.posterUrl);
}
