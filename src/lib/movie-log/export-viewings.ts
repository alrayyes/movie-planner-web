import type { LoggedViewing } from "../caldav/types";
import { imdbUrl } from "../omdb/links";

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

// The visitor's own browser-local date/time, not UTC — same convention
// the minimal import format's date/start_time/end_time already uses
// (LogViewingForm.svelte, run-import.ts's toIsoDateTime), so a plain
// date/time reader sees the same wall-clock time a visitor logged.
function localDateAndTime(iso: string): { date: string; time: string } {
  const d = new Date(iso);
  return {
    date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
  };
}

// #69: the round-trip counterpart to import-rows.ts's row parsing —
// every LoggedViewing field, using the CLI's own canonical snake_case
// field names (confirmed directly with a peer session working on
// movie-planner) so a file this app exports needs no translation layer
// to read on the other side, once movie-planner's own `import` grows
// the capability to accept these directly. `start`/`end` (full ISO
// instants) ride alongside date/start_time/end_time rather than
// instead of them — a consumer that only understands the minimal
// format's date/time split still gets a fully usable file; this app's
// own re-import prefers the ISO pair for exact fidelity regardless of
// which timezone the importing browser is in. See
// public/schemas/movie-viewings.schema.json for the full shape.
export function exportViewingsToJson(viewings: LoggedViewing[]): string {
  const rows = viewings.map((v) => {
    const { date, time: startTime } = localDateAndTime(v.start);
    const { time: endTime } = localDateAndTime(v.end);
    return {
      uid: v.uid,
      title: v.title,
      date,
      start_time: startTime,
      end_time: endTime,
      start: v.start,
      end: v.end,
      medium: v.medium,
      venue: v.venue,
      director: v.director,
      actors: v.actors,
      genre: v.genre,
      release_year: v.year,
      poster_url: v.posterUrl,
      imdb_rating: v.ratingImdb,
      rotten_tomatoes_rating: v.ratingRottenTomatoes,
      metacritic_rating: v.ratingMetacritic,
      imdb_url: v.imdbId ? imdbUrl(v.imdbId) : undefined,
      booking_ref: v.bookingRef,
      letterboxd_url: v.letterboxdUrl,
      letterboxd_rating: v.letterboxdRating,
      notes: v.notes,
    };
  });
  return JSON.stringify(rows, null, 2);
}

// A visitor's own local date, not UTC — the same reasoning as the
// filename a browser's own "Save as" dialog would suggest, so two
// exports made on the same calendar day (their day, not an arbitrary
// UTC one) don't silently overwrite each other with a stale-looking
// name for hours around midnight.
export function exportFilename(now: Date): string {
  return `movie-planner-export-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}.json`;
}
