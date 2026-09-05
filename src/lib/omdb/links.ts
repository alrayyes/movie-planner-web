// #37/#38: OMDb doesn't expose a stable per-title ID for Rotten Tomatoes or
// Letterboxd the way it does for IMDb (imdbID) — these are constructed
// search links, not a guarantee the first result is the right one.
// Shared by calendar-overview.ts and movie-details.ts so both render the
// exact same links for the exact same viewing.
export function imdbUrl(imdbId: string): string {
  return `https://www.imdb.com/title/${imdbId}/`;
}

export function rottenTomatoesSearchUrl(title: string): string {
  return `https://www.rottentomatoes.com/search?search=${encodeURIComponent(title)}`;
}

export function letterboxdSearchUrl(title: string): string {
  return `https://letterboxd.com/search/${encodeURIComponent(title)}/`;
}

// #79: prefers a real Letterboxd URL (only ever set via ical.ts's
// DESCRIPTION fallback, reading what the movie-planner CLI already
// wrote) over the constructed search this app falls back to without one.
export function letterboxdHref(viewing: { title: string; letterboxdUrl?: string }): string {
  return viewing.letterboxdUrl ?? letterboxdSearchUrl(viewing.title);
}
