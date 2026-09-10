// #580: every listing page (the overview, an attribute detail page, a
// venue, activity, missing-data, the heatmap) links straight to a
// specific viewing via ?uid= — none of them told the movie page which
// one sent the visitor there, so its own "Back to overview" link was
// hardcoded to "/" regardless. Carrying the referring page as an
// explicit `from` param — mirroring MovieDetails.svelte's own #298
// ?edit=1 — puts that in the URL, not in document.referrer, which a
// Referrer-Policy can blank.
export function movieHref(uid: string, options?: { edit?: boolean; from?: string }): string {
  let href = `/movie?uid=${encodeURIComponent(uid)}`;
  if (options?.edit) href += "&edit=1";
  if (options?.from) href += `&from=${encodeURIComponent(options.from)}`;
  return href;
}

// Only a same-origin relative path is ever reflected back into the
// "Back to overview" href — a missing/absolute/protocol-relative value
// falls back to "/" rather than letting a crafted link send a visitor
// somewhere else.
export function resolveBackHref(from: string | null): string {
  if (from?.startsWith("/") && !from.startsWith("//")) return from;
  return "/";
}
