<script lang="ts">
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { openStreetMapUrl } from "../lib/geo/links";

// #8/#203: a map that never makes a live third-party network call —
// design.md's own zero-network-privacy decision. Leaflet supplies the
// pan/zoom/marker interaction; the map "surface" is a bundled local
// SVG (public/world-outline.svg, a deliberately abstract, low-detail
// outline — not real coastline data, so there's no dataset license to
// track) via L.imageOverlay, never L.tileLayer pointed at a live tile
// provider. Real precision is a click away instead, via each pin's own
// "Open in Maps" link — every pin's popup carries one (venue-map spec's
// own "each pin" wording), regardless of how many pins are on the map;
// the movie-details page additionally repeats it as a plain link
// outside the map for its own single pin, more discoverable there
// without needing a click first.

// Leaflet's default marker icon computes its image URLs relative to
// wherever its own CSS/JS was loaded from, which breaks under a
// bundler (Vite hashes and moves the actual asset elsewhere) — the
// marker rendered as a broken image before this, confirmed visually
// against a real page. Pointing it at these bundled-in-public copies
// (same directory Leaflet itself ships them in) fixes it without
// depending on Leaflet's own runtime path-guessing.
L.Icon.Default.mergeOptions({
	iconUrl: "/leaflet/marker-icon.png",
	iconRetinaUrl: "/leaflet/marker-icon-2x.png",
	shadowUrl: "/leaflet/marker-shadow.png",
});

export interface MapPin {
	lat: number;
	lon: number;
	label: string;
	// #8/#203: the global /map page links a pin back to that viewing's
	// own details page; the per-venue map on that same details page has
	// nowhere further to link to, so this stays optional.
	href?: string;
}

let { pins }: { pins: MapPin[] } = $props();

let mapEl = $state<HTMLDivElement>();
let map: L.Map | undefined;
let markers: L.Marker[] = [];

function mount(el: HTMLDivElement) {
	if (map) return;
	map = L.map(el, {
		minZoom: 1,
		maxZoom: 5,
		maxBounds: [
			[-90, -180],
			[90, 180],
		],
		maxBoundsViscosity: 1,
		worldCopyJump: false,
	}).setView([20, 10], 1);

	L.imageOverlay("/world-outline.svg", [
		[-90, -180],
		[90, 180],
	]).addTo(map);
}

function popupContent(pin: MapPin): HTMLElement {
	const wrap = document.createElement("div");
	wrap.className = "flex flex-col gap-1";

	if (pin.href) {
		const a = document.createElement("a");
		a.href = pin.href;
		a.textContent = pin.label;
		a.className = "text-indigo-600 hover:underline dark:text-indigo-400";
		wrap.appendChild(a);
	} else {
		const span = document.createElement("span");
		span.textContent = pin.label;
		wrap.appendChild(span);
	}

	const openInMaps = document.createElement("a");
	openInMaps.href = openStreetMapUrl({ lat: pin.lat, lon: pin.lon });
	openInMaps.target = "_blank";
	openInMaps.rel = "noopener noreferrer";
	openInMaps.textContent = "Open in Maps";
	openInMaps.className = "text-sm text-indigo-600 hover:underline dark:text-indigo-400";
	wrap.appendChild(openInMaps);

	return wrap;
}

$effect(() => {
	if (mapEl) mount(mapEl);
});

// #8/#203: re-synced whenever `pins` changes, not set up once at
// mount — the global /map page's own pins arrive asynchronously
// (after its own CalDAV fetch resolves), later than this component
// itself mounts.
$effect(() => {
	if (!map) return;
	for (const marker of markers) marker.remove();
	markers = pins.map((pin) =>
		L.marker([pin.lat, pin.lon])
			.addTo(map as L.Map)
			.bindPopup(popupContent(pin)),
	);
});
</script>

<!-- #8/#203: role="region", not role="img" — Leaflet fills this div
with real interactive controls (zoom buttons, pin markers/popups), so
a role claiming it's a single non-interactive image would put those in
conflict with their own container's own ARIA role. A labeled region
lets them stay focusable/operable while the whole widget still has a
discoverable name. -->
<div
  bind:this={mapEl}
  class="h-80 w-full rounded-lg border border-slate-200 dark:border-slate-700"
  role="region"
  aria-label={pins.length > 0
    ? `Map showing ${pins.length} location${pins.length === 1 ? "" : "s"}`
    : "Map with no locations to show yet"}
></div>
