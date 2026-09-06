<script lang="ts">
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { openStreetMapUrl } from "../lib/geo/links";

// #262: real OpenStreetMap tiles, not the original bundled abstract
// outline (#8/#203's own zero-network-privacy decision) — reversed
// after a real device screenshot showed the hand-drawn outline reading
// as "barebones and useless" in practice (176 real pins over an
// unrecognizable gray blob, no way to tell where anything actually
// was). Confirmed directly with the user: real, recognizable geography
// wins over the no-live-network-call guarantee. See the privacy page
// for the resulting disclosure — this is now a real, automatic
// third-party network call whenever a map with pins renders.
//
// Each pin's popup also carries an "Open in Maps" link (venue-map
// spec's own "each pin" wording) for the cases real tiles still can't
// give — street-level detail, satellite view, turn-by-turn — and the
// movie-details page additionally repeats it as a plain link outside
// the map for its own single pin, more discoverable there without
// needing a click first.

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
	// A viewing with no OMDb match (or OMDb lookups paused/no key set)
	// has no poster — the popup just omits the image in that case,
	// same as everywhere else this app shows an optional poster.
	posterUrl?: string;
}

let { pins }: { pins: MapPin[] } = $props();

let mapEl = $state<HTMLDivElement>();
let map: L.Map | undefined;
let markers: L.Marker[] = [];

// The standard OSM tile server's own documented limits (§ Standard tile
// layer, operations.osmfoundation.org/policies/tiles/): maxZoom 19,
// and no request beyond ±85.0511° latitude, the real Web Mercator
// projection limit tiles are ever rendered for — matches maxBounds
// below rather than the flat ±90° that made sense for a plain image.
function mount(el: HTMLDivElement) {
	if (map) return;
	map = L.map(el, {
		minZoom: 2,
		maxZoom: 19,
		maxBounds: [
			[-85.0511, -180],
			[85.0511, 180],
		],
		maxBoundsViscosity: 1,
	}).setView([20, 10], 2);

	L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
		attribution:
			'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
		maxZoom: 19,
	}).addTo(map);
}

function popupContent(pin: MapPin): HTMLElement {
	const wrap = document.createElement("div");
	wrap.className = "flex flex-col gap-1";

	if (pin.posterUrl) {
		const img = document.createElement("img");
		img.src = pin.posterUrl;
		img.alt = "";
		img.className = "mb-1 h-24 w-16 rounded object-cover shadow-sm";
		wrap.appendChild(img);
	}

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
	markers = pins.map((pin) => {
		const marker = L.marker([pin.lat, pin.lon])
			.addTo(map as L.Map)
			.bindPopup(popupContent(pin));
		// bindPopup wires its own click handler to *toggle* the popup —
		// closed again on a second click of the same marker. That fights
		// hovering: a click right after a hover-triggered openPopup() sees
		// the popup already open and closes it instead. Replacing it with
		// a plain open (never a toggle) keeps hover and click consistent;
		// clicking elsewhere on the map still closes it, same as before.
		marker.off("click");
		marker.on("click", () => marker.openPopup());
		marker.on("mouseover", () => marker.openPopup());
		marker.on("mouseout", () => marker.closePopup());
		return marker;
	});
	// #262: zooms/pans to fit the visitor's own pins instead of staying
	// on the initial whole-world view — with real tiles there's a real
	// useful zoom level to jump to, unlike the old bundled outline
	// (always the same flat image regardless of zoom). maxZoom caps how
	// far a single pin (or a very tight cluster) would otherwise zoom,
	// since fitBounds on a zero-area box zooms in as far as it's
	// allowed to.
	if (pins.length > 0) {
		map.fitBounds(
			pins.map((pin) => [pin.lat, pin.lon]),
			{ padding: [24, 24], maxZoom: 15 },
		);
	}
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
