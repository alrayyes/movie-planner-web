// #360/#400 (design.md): TMDb only ever runs off an IMDb ID already
// resolved by OMDb — never a title/year search of its own. Modeled after
// movie-planner's own CLI client (src/movie_planner/tmdb.py, confirmed
// via the movie-planner-cli session): find/{imdb_id} resolves TMDb's
// numeric id, then one movie/{tmdb_id}?append_to_response=... call
// fetches everything else in a single round trip.
export interface TmdbMetadata {
  trailerUrl?: string;
  collection?: string;
  certification?: string;
  keywords?: string;
  budget?: string;
  popularity?: string;
  actors?: string;
  website?: string;
}

interface TmdbFindResponse {
  movie_results?: { id: number }[];
}

interface TmdbVideo {
  key: string;
  site: string;
  type: string;
  official?: boolean;
}

interface TmdbCastMember {
  name: string;
  order: number;
}

interface TmdbReleaseDateEntry {
  certification?: string;
}

interface TmdbReleaseDatesResult {
  iso_3166_1: string;
  release_dates: TmdbReleaseDateEntry[];
}

interface TmdbKeyword {
  name: string;
}

interface TmdbMovieResponse {
  budget?: number;
  popularity?: number;
  homepage?: string;
  belongs_to_collection?: { name: string } | null;
  credits?: { cast?: TmdbCastMember[] };
  videos?: { results?: TmdbVideo[] };
  release_dates?: { results?: TmdbReleaseDatesResult[] };
  keywords?: { keywords?: TmdbKeyword[] };
}

const BASE_URL = "https://api.themoviedb.org/3";

async function findTmdbId(apiKey: string, imdbId: string): Promise<number | null> {
  const url = new URL(`${BASE_URL}/find/${imdbId}`);
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("external_source", "imdb_id");

  const response = await fetch(url);
  if (!response.ok) return null;
  const data = (await response.json()) as TmdbFindResponse;
  return data.movie_results?.[0]?.id ?? null;
}

// #350: an official trailer only — the embedded-trailer feature this
// whole client exists for has nothing useful to show for a fan-made
// upload or a promo hosted somewhere this app has no player for.
function extractTrailerUrl(videos: TmdbVideo[] | undefined): string | undefined {
  const trailer = videos?.find((v) => v.type === "Trailer" && v.site === "YouTube" && v.official);
  return trailer ? `https://www.youtube.com/watch?v=${trailer.key}` : undefined;
}

// TMDb's release_dates is per-country, each carrying its own list of
// release-date entries (theatrical, digital, ...) that may or may not
// themselves carry a certification — this app only ever wants the US
// board's rating, same as the CLI.
function extractCertification(results: TmdbReleaseDatesResult[] | undefined): string | undefined {
  const us = results?.find((r) => r.iso_3166_1 === "US");
  return us?.release_dates.find((d) => d.certification)?.certification || undefined;
}

function extractKeywords(keywords: TmdbKeyword[] | undefined): string | undefined {
  if (!keywords || keywords.length === 0) return undefined;
  return keywords.map((k) => k.name).join(", ");
}

// Top-billed cast only, ordered by TMDb's own `order` field — the same
// "a handful of names, not the whole call sheet" shape OMDb's own
// Actors field already has.
const TOP_BILLED_CAST_LIMIT = 5;

function extractActors(cast: TmdbCastMember[] | undefined): string | undefined {
  if (!cast || cast.length === 0) return undefined;
  const names = [...cast]
    .sort((a, b) => a.order - b.order)
    .slice(0, TOP_BILLED_CAST_LIMIT)
    .map((c) => c.name);
  return names.length > 0 ? names.join(", ") : undefined;
}

// TMDb reports a budget/popularity it genuinely has nothing for as 0,
// not by omitting the field — same "not entered" treatment OMDb's own
// literal "N/A" gets in omdb/client.ts's field().
function numericField(value: number | undefined): string | undefined {
  return value && value > 0 ? String(value) : undefined;
}

function toMetadata(data: TmdbMovieResponse): TmdbMetadata {
  return {
    trailerUrl: extractTrailerUrl(data.videos?.results),
    collection: data.belongs_to_collection?.name || undefined,
    certification: extractCertification(data.release_dates?.results),
    keywords: extractKeywords(data.keywords?.keywords),
    budget: numericField(data.budget),
    popularity: numericField(data.popularity),
    actors: extractActors(data.credits?.cast),
    website: data.homepage || undefined,
  };
}

export async function lookupTmdbByImdbId(
  apiKey: string,
  imdbId: string,
): Promise<TmdbMetadata | null> {
  const tmdbId = await findTmdbId(apiKey, imdbId);
  if (tmdbId === null) return null;

  const url = new URL(`${BASE_URL}/movie/${tmdbId}`);
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("append_to_response", "credits,videos,release_dates,keywords");

  const response = await fetch(url);
  if (!response.ok) return null;
  const data = (await response.json()) as TmdbMovieResponse;
  return toMetadata(data);
}

// design.md: "the shared helper takes a viewing and returns the TMDb
// fields to merge in, or nothing if no key/no imdb_id/no match" — the
// one function every enrichment call site (single refresh, bulk
// refresh, initial log, and both disambiguation pickers) calls, so none
// of them can independently get the "actors/website overwritten only
// when TMDb actually has a value, everything else omit-never-guess"
// merge rule wrong. Only fields TMDb genuinely has come back — a caller
// merging this onto an existing viewing (`{ ...viewing, ...fields }`)
// can never blank a value TMDb didn't return this time.
export async function enrichWithTmdb(
  apiKey: string | undefined,
  imdbId: string | undefined,
): Promise<TmdbMetadata | undefined> {
  if (!apiKey || !imdbId) return undefined;
  try {
    // A network-level failure here (as opposed to a plain non-ok
    // response, already handled inside lookupTmdbByImdbId) must never
    // take down a call site's already-successful OMDb match with it —
    // every caller runs this after OMDb has already resolved and
    // written its own fields.
    const metadata = await lookupTmdbByImdbId(apiKey, imdbId);
    if (!metadata) return undefined;

    const fields: TmdbMetadata = {};
    if (metadata.trailerUrl) fields.trailerUrl = metadata.trailerUrl;
    if (metadata.collection) fields.collection = metadata.collection;
    if (metadata.certification) fields.certification = metadata.certification;
    if (metadata.keywords) fields.keywords = metadata.keywords;
    if (metadata.budget) fields.budget = metadata.budget;
    if (metadata.popularity) fields.popularity = metadata.popularity;
    if (metadata.actors) fields.actors = metadata.actors;
    if (metadata.website) fields.website = metadata.website;
    return fields;
  } catch {
    return undefined;
  }
}
