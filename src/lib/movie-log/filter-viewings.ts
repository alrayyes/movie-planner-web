import type { LoggedViewing } from "../caldav/types";
import { splitMultiValue } from "../omdb/multi-value";
import { parseReleasedDate } from "../omdb/released-date";

// Extracted from CalendarOverview.svelte's own `currentlyDisplayed` filter
// predicate (#667) so the WebMCP `search_viewings`/`export_viewings` tools
// filter the exact same way a visitor's own overview does, rather than a
// second, drifting implementation. Each field is normalized here
// (trim/lowercase) rather than by the caller, so every caller gets the same
// "empty string means unset" and case-insensitivity behaviour for free.
export interface ViewingFilters {
  title?: string;
  medium?: string;
  venue?: string;
  director?: string;
  actor?: string;
  genre?: string;
  city?: string;
  movieCountry?: string;
  movieLanguage?: string;
  rated?: string;
  releasedYear?: string;
  releasedMonth?: string;
}

export function filterViewings(
  viewings: LoggedViewing[],
  filters: ViewingFilters,
): LoggedViewing[] {
  const titleFilter = (filters.title ?? "").trim().toLowerCase();
  const mediumFilter = (filters.medium ?? "").trim().toLowerCase();
  const venueFilter = (filters.venue ?? "").trim().toLowerCase();
  const directorFilter = (filters.director ?? "").trim().toLowerCase();
  const actorFilter = (filters.actor ?? "").trim().toLowerCase();
  const genreFilter = (filters.genre ?? "").trim().toLowerCase();
  const cityFilter = (filters.city ?? "").trim().toLowerCase();
  const movieCountryFilter = (filters.movieCountry ?? "").trim().toLowerCase();
  const movieLanguageFilter = (filters.movieLanguage ?? "").trim().toLowerCase();
  const ratedFilter = (filters.rated ?? "").trim().toLowerCase();
  const releasedYearFilter = (filters.releasedYear ?? "").trim();
  const releasedMonthFilter = (filters.releasedMonth ?? "").trim();

  return viewings.filter((v) => {
    if (titleFilter && !v.title.toLowerCase().includes(titleFilter)) return false;
    if (mediumFilter && v.medium.toLowerCase() !== mediumFilter) return false;
    if (venueFilter && (v.venue ?? "").toLowerCase() !== venueFilter) return false;
    if (
      directorFilter &&
      !splitMultiValue(v.director).some((director) => director.toLowerCase() === directorFilter)
    )
      return false;
    if (
      actorFilter &&
      !splitMultiValue(v.actors).some((actor) => actor.toLowerCase() === actorFilter)
    )
      return false;
    if (
      genreFilter &&
      !splitMultiValue(v.genre).some((genre) => genre.toLowerCase() === genreFilter)
    )
      return false;
    if (cityFilter && (v.city ?? "").toLowerCase() !== cityFilter) return false;
    if (
      movieCountryFilter &&
      !splitMultiValue(v.movieCountry).some(
        (country) => country.toLowerCase() === movieCountryFilter,
      )
    )
      return false;
    if (
      movieLanguageFilter &&
      !splitMultiValue(v.movieLanguage).some(
        (language) => language.toLowerCase() === movieLanguageFilter,
      )
    )
      return false;
    if (ratedFilter && (v.rated ?? "").toLowerCase() !== ratedFilter) return false;
    if (releasedYearFilter || releasedMonthFilter) {
      const released = v.released ? parseReleasedDate(v.released) : null;
      if (!released) return false;
      if (releasedYearFilter && released.year !== releasedYearFilter) return false;
      if (releasedMonthFilter && released.month !== releasedMonthFilter) return false;
    }
    return true;
  });
}
