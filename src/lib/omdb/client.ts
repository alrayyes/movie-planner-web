// Ported from movie-planner's own src/movie_planner/omdb.py: `?t=<title>`
// is OMDb's title-search endpoint, and OMDb itself already picks the
// single best match server-side — that's the entire "best-effort, no
// disambiguation" behaviour the movie-log spec asks for. There's no local
// candidate-ranking logic to port because there isn't any upstream either.
export interface MovieMetadata {
  ratingImdb?: string;
  ratingRottenTomatoes?: string;
  ratingMetacritic?: string;
  director?: string;
  actors?: string;
  genre?: string;
  year?: string;
  posterUrl?: string;
  imdbId?: string;
  synopsis?: string;
}

// #49: a disambiguation candidate — the shape OMDb's search endpoint
// (`s=`) returns, distinct from MovieMetadata (which needs a full `i=`/
// `t=` lookup to populate ratings/genre/director/actors, none of which
// the search endpoint carries).
export interface OmdbCandidate {
  title: string;
  year?: string;
  imdbId: string;
  posterUrl?: string;
}

interface OmdbRating {
  Source?: string;
  Value?: string;
}

interface OmdbResponse {
  Response: "True" | "False";
  Director?: string;
  Actors?: string;
  Ratings?: OmdbRating[];
  Genre?: string;
  Year?: string;
  Poster?: string;
  imdbID?: string;
  Plot?: string;
}

interface OmdbSearchResult {
  Title?: string;
  Year?: string;
  imdbID?: string;
  Poster?: string;
}

interface OmdbSearchResponse {
  Response: "True" | "False";
  Search?: OmdbSearchResult[];
}

function rating(ratings: OmdbRating[] | undefined, source: string): string | undefined {
  return ratings?.find((r) => r.Source === source)?.Value;
}

// OMDb reports a field it genuinely has nothing for as the literal
// string "N/A" rather than omitting it — same as Director/Actors
// already had to handle.
function field(value: string | undefined): string | undefined {
  return value && value !== "N/A" ? value : undefined;
}

function toMetadata(data: OmdbResponse): MovieMetadata {
  return {
    ratingImdb: rating(data.Ratings, "Internet Movie Database"),
    ratingRottenTomatoes: rating(data.Ratings, "Rotten Tomatoes"),
    ratingMetacritic: rating(data.Ratings, "Metacritic"),
    director: field(data.Director),
    actors: field(data.Actors),
    genre: field(data.Genre),
    year: field(data.Year),
    posterUrl: field(data.Poster),
    imdbId: field(data.imdbID),
    synopsis: field(data.Plot),
  };
}

async function search(apiKey: string, title: string, year: string | undefined) {
  const url = new URL("https://www.omdbapi.com/");
  url.searchParams.set("apikey", apiKey);
  url.searchParams.set("t", title);
  if (year) url.searchParams.set("y", year);
  // Full plot, not OMDb's default truncated one-liner — a synopsis
  // worth showing on the details page.
  url.searchParams.set("plot", "full");

  const response = await fetch(url);
  if (!response.ok) return null;
  const data = (await response.json()) as OmdbResponse;
  return data.Response === "True" ? data : null;
}

// `year`, not part of the CLI's own omdb.py, is the year the entry was
// watched (movie-log/movie-editing's own `start` field) — a fuzzy hint
// for a title OMDb otherwise has to guess between several releases of,
// not an exact release-year filter: OMDb's own `y` parameter matches
// strictly, and a watched-year that doesn't equal the actual release
// year (any re-watch of an older film) would turn a real match into
// "not found" if there were nothing to fall back to. Trying the
// year-scoped search first and falling back to a plain title search on
// no match means this can only ever do as well as, never worse than,
// omitting the year entirely.
export async function lookupMovie(
  apiKey: string,
  title: string,
  year?: string,
): Promise<MovieMetadata | null> {
  const scoped = year ? await search(apiKey, title, year) : null;
  const data = scoped ?? (await search(apiKey, title, undefined));
  return data ? toMetadata(data) : null;
}

// #49: when `lookupMovie` finds no single confident match, this is what
// backs the disambiguation picker — OMDb's `s=` search endpoint, which
// (unlike `t=`) returns a list of candidates rather than OMDb's own
// best guess. A candidate with no imdbID is dropped rather than shown
// unselectable, since imdbID is what `lookupByImdbId` needs to fetch
// its full details.
export async function searchMovies(apiKey: string, title: string): Promise<OmdbCandidate[]> {
  const url = new URL("https://www.omdbapi.com/");
  url.searchParams.set("apikey", apiKey);
  url.searchParams.set("s", title);

  const response = await fetch(url);
  if (!response.ok) return [];
  const data = (await response.json()) as OmdbSearchResponse;
  if (data.Response !== "True" || !data.Search) return [];

  return data.Search.filter((r) => r.imdbID).map((r) => ({
    title: r.Title ?? "",
    year: field(r.Year),
    imdbId: r.imdbID as string,
    posterUrl: field(r.Poster),
  }));
}

// #49: fetches a chosen disambiguation candidate's full details by its
// imdbID — OMDb's `i=` parameter, the same full-detail response shape
// as `t=`/`y=`, just addressed by ID instead of title.
export async function lookupByImdbId(
  apiKey: string,
  imdbId: string,
): Promise<MovieMetadata | null> {
  const url = new URL("https://www.omdbapi.com/");
  url.searchParams.set("apikey", apiKey);
  url.searchParams.set("i", imdbId);
  url.searchParams.set("plot", "full");

  const response = await fetch(url);
  if (!response.ok) return null;
  const data = (await response.json()) as OmdbResponse;
  return data.Response === "True" ? toMetadata(data) : null;
}
