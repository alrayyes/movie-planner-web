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
  // #336: the rest of OMDb's own response fields movie-planner's data
  // model already tracks (alrayyes/movie-planner#237) — this app's own
  // X-* properties and DESCRIPTION fallback (ical.ts) already know how
  // to read/write these; a web-triggered refresh just never populated
  // them, so a viewing logged and refreshed entirely through this app
  // was silently missing fields a CLI-refreshed one already had.
  rated?: string;
  released?: string;
  runtime?: string;
  movieLanguage?: string;
  movieCountry?: string;
  awards?: string;
  metascore?: string;
  imdbVotes?: string;
  dvd?: string;
  boxOffice?: string;
  production?: string;
  website?: string;
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
  Title?: string;
  Director?: string;
  Actors?: string;
  Ratings?: OmdbRating[];
  Genre?: string;
  Year?: string;
  Poster?: string;
  imdbID?: string;
  Plot?: string;
  Rated?: string;
  Released?: string;
  Runtime?: string;
  Language?: string;
  Country?: string;
  Awards?: string;
  Metascore?: string;
  imdbVotes?: string;
  DVD?: string;
  BoxOffice?: string;
  Production?: string;
  Website?: string;
  Error?: string;
}

interface OmdbSearchResult {
  Title?: string;
  Year?: string;
  imdbID?: string;
  Poster?: string;
}

interface OmdbSearchResponse {
  Response: "True" | "False";
  Error?: string;
  Search?: OmdbSearchResult[];
  totalResults?: string;
}

// #622: OMDb's s= search paginates at 10 results per page. A franchise
// with many entries (films, games, series, spin-offs) can crowd a new or
// less prominent title outside page 1, where it never reached the
// disambiguation picker at all. Following totalResults to fetch a few
// more pages fixes that without unconditionally following it to the end,
// which could burn a lot of the free-tier daily request budget on one
// broad query.
const MAX_SEARCH_PAGES = 5;

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
    rated: field(data.Rated),
    released: field(data.Released),
    runtime: field(data.Runtime),
    movieLanguage: field(data.Language),
    movieCountry: field(data.Country),
    awards: field(data.Awards),
    metascore: field(data.Metascore),
    imdbVotes: field(data.imdbVotes),
    dvd: field(data.DVD),
    boxOffice: field(data.BoxOffice),
    production: field(data.Production),
    website: field(data.Website),
  };
}

// #888: OMDb refusing a request (401 for a bad key, 429 or a "Request limit
// reached!" body for the daily quota), being down or unreachable is not "no
// match". It throws, so a caller can say the lookup failed instead of treating a
// quota error as a title that doesn't exist. OMDb's own "Movie not found!" and
// the like stay ordinary no-match answers.
export class OmdbUnavailableError extends Error {
  constructor(
    readonly status?: number,
    refusal?: string,
  ) {
    super(
      refusal
        ? `OMDb refused the request: ${refusal}`
        : status
          ? `OMDb isn't answering (HTTP ${status}). Try again in a moment.`
          : "OMDb isn't answering. Try again in a moment.",
    );
    this.name = "OmdbUnavailableError";
  }
}

// The 200-with-an-error answers that mean "not now", not "not found".
const REFUSAL = /api key|limit/i;

async function getJson<T extends { Response?: string; Error?: string }>(url: URL): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url);
  } catch {
    throw new OmdbUnavailableError();
  }
  if (!response.ok) throw new OmdbUnavailableError(response.status);
  let data: T;
  try {
    data = (await response.json()) as T;
  } catch {
    throw new OmdbUnavailableError();
  }
  if (data.Error && REFUSAL.test(data.Error)) {
    throw new OmdbUnavailableError(undefined, data.Error);
  }
  return data;
}

async function search(apiKey: string, title: string, year: string | undefined) {
  const url = new URL("https://www.omdbapi.com/");
  url.searchParams.set("apikey", apiKey);
  url.searchParams.set("t", title);
  if (year) url.searchParams.set("y", year);
  // Full plot, not OMDb's default truncated one-liner — a synopsis
  // worth showing on the details page.
  url.searchParams.set("plot", "full");

  const data = await getJson<OmdbResponse>(url);
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

async function searchPage(
  apiKey: string,
  title: string,
  page: number,
  year?: string,
): Promise<OmdbSearchResponse> {
  const url = new URL("https://www.omdbapi.com/");
  url.searchParams.set("apikey", apiKey);
  url.searchParams.set("s", title);
  if (year) url.searchParams.set("y", year);
  if (page > 1) url.searchParams.set("page", String(page));

  return getJson<OmdbSearchResponse>(url);
}

// #49: when `lookupMovie` finds no single confident match, this is what
// backs the disambiguation picker — OMDb's `s=` search endpoint, which
// (unlike `t=`) returns a list of candidates rather than OMDb's own
// best guess. A candidate with no imdbID is dropped rather than shown
// unselectable, since imdbID is what `lookupByImdbId` needs to fetch
// its full details.
// #627: `year`, unlike `lookupMovie`'s fuzzy watched-year hint, is a real
// OMDb `y=` filter here — narrowing the search server-side instead of
// scanning more pages of everything OMDb has for that title.
export async function searchMovies(
  apiKey: string,
  title: string,
  year?: string,
): Promise<OmdbCandidate[]> {
  const first = await searchPage(apiKey, title, 1, year);
  if (first.Response !== "True" || !first.Search) return [];

  const results = [...first.Search];
  const totalResults = Number(first.totalResults ?? results.length);
  const pagesAvailable = Math.min(MAX_SEARCH_PAGES, Math.ceil(totalResults / 10));

  for (let page = 2; page <= pagesAvailable; page++) {
    // A later page that fails (the quota running out mid-search) keeps what the
    // first pages already found, rather than throwing it away. getJson only ever
    // throws OmdbUnavailableError.
    const data = await searchPage(apiKey, title, page, year).catch(() => undefined);
    if (!data || data.Response !== "True" || !data.Search) break;
    results.push(...data.Search);
  }

  return results
    .filter((r) => r.imdbID)
    .map((r) => ({
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

  const data = await getJson<OmdbResponse>(url);
  return data.Response === "True" ? toMetadata(data) : null;
}

// #626: an IMDb ID is unambiguous, so a query that's actually a pasted ID
// or a pasted IMDb URL shouldn't depend on OMDb's title-ranked s= search
// finding it at all — matches "tt" + 7-10 digits wherever it appears in
// the query, which covers both a bare ID and a full imdb.com/title/ URL.
const IMDB_ID_PATTERN = /tt\d{7,10}/i;

export function extractImdbId(query: string): string | null {
  const match = query.match(IMDB_ID_PATTERN);
  return match ? match[0].toLowerCase() : null;
}

// A lighter-weight sibling of lookupByImdbId: just enough (title, year,
// poster) to render as an OmdbCandidate, for searchOmdb's direct-ID path
// below — the full MovieMetadata lookup still happens afterward, once a
// caller applies this candidate, same as picking one from the picker.
async function lookupCandidateByImdbId(
  apiKey: string,
  imdbId: string,
): Promise<OmdbCandidate | null> {
  const url = new URL("https://www.omdbapi.com/");
  url.searchParams.set("apikey", apiKey);
  url.searchParams.set("i", imdbId);

  const data = await getJson<OmdbResponse>(url);
  if (data.Response !== "True" || !data.imdbID) return null;

  return {
    title: field(data.Title) ?? "",
    year: field(data.Year),
    imdbId: data.imdbID,
    posterUrl: field(data.Poster),
  };
}

export type OmdbSearchOutcome =
  | { kind: "match"; candidate: OmdbCandidate }
  | { kind: "candidates"; candidates: OmdbCandidate[] }
  | { kind: "none" };

// #626: the single entry point every free-text OMDb search box in this
// app should call — resolves a pasted IMDb ID/URL directly via `i=`
// (skipping `s=` entirely), otherwise falls through to the existing
// title search.
export async function searchOmdb(
  apiKey: string,
  query: string,
  year?: string,
): Promise<OmdbSearchOutcome> {
  const imdbId = extractImdbId(query);
  if (imdbId) {
    // An IMDb ID is already unambiguous — a year filter has nothing left
    // to narrow.
    const candidate = await lookupCandidateByImdbId(apiKey, imdbId);
    return candidate ? { kind: "match", candidate } : { kind: "none" };
  }

  const candidates = await searchMovies(apiKey, query, year);
  return candidates.length > 0 ? { kind: "candidates", candidates } : { kind: "none" };
}
