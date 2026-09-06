// The visitor's own CalDAV server + credentials — held only in the
// visitor's own browser storage and used to call their CalDAV server
// directly, per the caldav-client capability spec. Never sent to, or held
// by, any server this project runs.
export interface CaldavConfig {
  baseUrl: string;
  username: string;
  password: string;
}

// A single logged viewing, mapped to one VEVENT. Field mapping (all custom
// X-properties are plain iCalendar RFC 5545 extensions, not a server-specific
// feature, per design.md's "stay standard CalDAV" decision):
//   SUMMARY        -> title
//   DTSTART/DTEND  -> start/end
//   LOCATION       -> venue
//   X-MEDIUM       -> medium
//   X-DIRECTOR, X-ACTORS, X-RATING-IMDB, X-RATING-ROTTEN-TOMATOES,
//   X-RATING-METACRITIC, X-GENRE, X-YEAR, X-POSTER-URL, X-IMDB-ID,
//   X-SYNOPSIS -> OMDb-enriched metadata, all optional
//   X-BOOKING-REF -> the Pathé booking number, when logged from an email —
//     what a re-submission is matched against, per the movie-log spec's
//     "Re-submitted booking confirmation" scenario
//   X-ROW, X-SEAT -> a Pathé booking's seat assignment, when known
//     (alrayyes/movie-planner#218) — absent for anything else, since
//     most media aren't a seated cinema booking at all
export interface LoggedViewing {
  uid: string;
  title: string;
  start: string; // ISO 8601
  end: string; // ISO 8601
  medium: string;
  venue?: string;
  director?: string;
  actors?: string;
  ratingImdb?: string;
  ratingRottenTomatoes?: string;
  ratingMetacritic?: string;
  genre?: string;
  year?: string;
  posterUrl?: string;
  imdbId?: string;
  synopsis?: string;
  bookingRef?: string;
  row?: string;
  seat?: string;
  // #79: OMDb has no Letterboxd data at all — this app never sets these
  // itself. They only ever arrive via ical.ts's DESCRIPTION fallback,
  // reading what the CLI already wrote (a real Letterboxd link, not the
  // constructed search this app falls back to without one).
  letterboxdUrl?: string;
  letterboxdRating?: string;
  // #105: personal context (who it was watched with, a reaction) — the
  // CLI's own field, never touched by OMDb. Round-trips through this
  // app's own X-NOTES once written here; arrives via ical.ts's
  // DESCRIPTION fallback for a viewing the CLI logged first.
  notes?: string;
  // #8/#203: the venue's own location, when known — round-trips through
  // the VEVENT's native GEO property (RFC 5545 §3.8.1.6, `lat;lon`), not
  // an X-* extension; movie-planner's own GEO-coordinate support
  // (movie-planner#170) is what a CLI-logged viewing's geo arrives
  // through. Absent, not a sentinel value, when the venue has no known
  // coordinates.
  geo?: { lat: number; lon: number };
  // #310: the rest of OMDb's own response fields (alrayyes/movie-planner#237),
  // verbatim, no normalization — X-RATED/X-RUNTIME/X-MOVIE-LANGUAGE/
  // X-MOVIE-COUNTRY/X-METASCORE/X-IMDB-VOTES/X-DVD/X-BOX-OFFICE/
  // X-PRODUCTION/X-WEBSITE on a CLI-logged viewing. movieLanguage/
  // movieCountry, not language/country — the movie's own country/
  // language of origin, a different thing from the venue's own
  // city/country above.
  rated?: string;
  runtime?: string;
  movieLanguage?: string;
  movieCountry?: string;
  metascore?: string;
  imdbVotes?: string;
  dvd?: string;
  boxOffice?: string;
  production?: string;
  website?: string;
  // #310: longer-form OMDb text the CLI writes to DESCRIPTION rather
  // than an X-* property (`Released`/`Awards` lines, alongside the
  // existing `Plot` line this app already reads into `synopsis` above).
  // Round-trip through this app's own X-RELEASED/X-AWARDS once written
  // here, same "app's own X-* wins over DESCRIPTION" rule as
  // letterboxdUrl/notes.
  released?: string;
  awards?: string;
  // #310: a YouTube link to the movie's official trailer
  // (alrayyes/movie-planner#236), from TMDb rather than OMDb — only
  // ever present when the CLI has a `tmdb.api_key` configured, TMDb
  // found a match, and it has an official YouTube trailer among its
  // videos. Same "omit, never guess" rule as everything else here.
  trailerUrl?: string;
}

export type NewViewing = Omit<LoggedViewing, "uid">;

export interface DateRange {
  from: string; // ISO 8601
  to: string; // ISO 8601
}

// The location-management capability's picklists, held in one sidecar
// VJOURNAL rather than per-field CalDAV resources.
export interface Picklists {
  media: string[];
  venues: string[];
}
