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
