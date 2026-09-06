// #8/#203: a plain link to OpenStreetMap's own web viewer, not a native
// app deep-link scheme — works identically across desktop and mobile
// browsers without platform detection, same as this app's existing
// IMDb/Rotten Tomatoes/Letterboxd links (omdb/links.ts). Zoomed in
// close (18) since the point is showing the precise location a
// deliberately coarse bundled-outline map can't.
export function openStreetMapUrl(geo: { lat: number; lon: number }): string {
  return `https://www.openstreetmap.org/?mlat=${geo.lat}&mlon=${geo.lon}#map=18/${geo.lat}/${geo.lon}`;
}
