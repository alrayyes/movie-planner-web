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
}

function rating(ratings: OmdbRating[] | undefined, source: string): string | undefined {
  return ratings?.find((r) => r.Source === source)?.Value;
}

export async function lookupMovie(apiKey: string, title: string): Promise<MovieMetadata | null> {
  const url = new URL("https://www.omdbapi.com/");
  url.searchParams.set("apikey", apiKey);
  url.searchParams.set("t", title);

  const response = await fetch(url);
  if (!response.ok) return null;

  const data = (await response.json()) as OmdbResponse;
  if (data.Response === "False") return null;

  return {
    ratingImdb: rating(data.Ratings, "Internet Movie Database"),
    ratingRottenTomatoes: rating(data.Ratings, "Rotten Tomatoes"),
    ratingMetacritic: rating(data.Ratings, "Metacritic"),
    director: data.Director && data.Director !== "N/A" ? data.Director : undefined,
    actors: data.Actors && data.Actors !== "N/A" ? data.Actors : undefined,
  };
}
