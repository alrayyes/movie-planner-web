// The visitor's own CalDAV server + credentials, sent per-request — see the
// caldav-proxy capability spec's "Stateless per-request relay" requirement.
// Never persisted server-side beyond handling one request.
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
//   X-RATING-METACRITIC -> OMDb-enriched metadata, all optional
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
