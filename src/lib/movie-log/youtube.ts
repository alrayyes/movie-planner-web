// #350: trailerUrl (a plain YouTube watch/share link, TMDb-sourced via
// the CLI) has to become an embeddable player URL — recognizes every
// shape a real YouTube link takes and extracts the video ID; returns
// null for anything else, so a caller can fall back to a plain link
// rather than trying to embed something that isn't a YouTube URL at all.
const YOUTUBE_ID_RE =
  /^(?:https?:\/\/)?(?:www\.|m\.)?(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{11})/;

export function youtubeVideoId(url: string): string | null {
  return YOUTUBE_ID_RE.exec(url)?.[1] ?? null;
}

// youtube-nocookie.com — YouTube's own privacy-enhanced embed domain,
// which doesn't set cookies or start pulling in third-party tracking
// until a visitor actually presses play, matching this app's existing
// preference for not making an automatic third-party call just to show
// a page (VenueMap's own bundled-outline-over-live-tiles decision, for
// the same reason).
export function youtubeEmbedUrl(url: string): string | null {
  const id = youtubeVideoId(url);
  return id ? `https://www.youtube-nocookie.com/embed/${id}` : null;
}
