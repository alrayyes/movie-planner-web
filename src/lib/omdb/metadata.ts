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
// Requires imdbId *and* at least one of the fields only a real OMDb
// lookup (t=/i=, never the DESCRIPTION fallback) sets — imdbId alone
// isn't enough (the bug above), and director/actors/genre/year/
// posterUrl alone isn't enough either: the movie-editing spec's own
// "Stale metadata refreshed" scenario is a viewing with a stale
// director but no imdbId yet, which must still be treated as
// unmatched so a refresh corrects it.
export function hasOmdbMetadata(
  viewing: Pick<LoggedViewing, "imdbId" | "director" | "actors" | "genre" | "year" | "posterUrl">,
): boolean {
  return Boolean(
    viewing.imdbId &&
      (viewing.director || viewing.actors || viewing.genre || viewing.year || viewing.posterUrl),
  );
}
