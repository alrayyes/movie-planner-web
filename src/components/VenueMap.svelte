<script lang="ts">
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// #8/#203: a map that never makes a live third-party network call —
// design.md's own zero-network-privacy decision. Leaflet supplies the
// pan/zoom/marker interaction; the map "surface" is a bundled local
// SVG (public/world-outline.svg, a deliberately abstract, low-detail
// outline — not real coastline data, so there's no dataset license to
// track) via L.imageOverlay, never L.tileLayer pointed at a live tile
// provider. Real precision is a click away instead, via each pin's own
// "Open in Maps" link (rendered by the caller, not this component —
// design.md's own plain-link decision, not a Leaflet popup action).

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
}

let { pins }: { pins: MapPin[] } = $props();

let mapEl = $state<HTMLDivElement>();
let mounted = false;

function mount(el: HTMLDivElement) {
	if (mounted) return;
	mounted = true;
	const map = L.map(el, {
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

	for (const pin of pins) {
		const label = document.createElement("span");
		label.textContent = pin.label;
		L.marker([pin.lat, pin.lon]).addTo(map).bindPopup(label);
	}
}

$effect(() => {
	if (mapEl) mount(mapEl);
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
