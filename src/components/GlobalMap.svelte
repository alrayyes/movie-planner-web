<script lang="ts">
import { listViewings } from "../lib/caldav/client";
import type { CaldavConfig } from "../lib/caldav/types";
import { getCredentialsStore } from "../lib/credentials/store";
import { importCheckRange } from "../lib/movie-log/run-import";
import { reloadOnBfcacheRestore } from "../lib/ui/bfcache";
// biome-ignore lint/correctness/noUnusedImports: used in the template below, which Biome does not parse for .svelte files
import { STATUS_TEXT } from "../lib/ui/classes";
// biome-ignore lint/correctness/noUnusedImports: VenueMap is used in the template below, which Biome does not parse for .svelte files
import VenueMap, { type MapPin } from "./VenueMap.svelte";

// #8/#203: every logged viewing whose venue has known coordinates, one
// pin each — a viewing with no geo is simply omitted, not an error
// (proposal.md's own acceptance criteria). Same wide default range
// every other whole-history view (Venues, the heatmap) already uses.

// biome-ignore lint/correctness/noUnusedVariables: read in the template below, which Biome does not parse for .svelte files
let status = $state("Loading…");
let pins = $state<MapPin[]>([]);

async function load() {
	const credentials = await getCredentialsStore().get();
	if (!credentials) {
		status = "Connect first to see your map.";
		return;
	}
	const config: CaldavConfig = {
		baseUrl: credentials.caldavUrl,
		username: credentials.caldavUsername,
		password: credentials.caldavPassword,
	};
	try {
		const viewings = await listViewings(config, importCheckRange());
		pins = viewings
			.filter((viewing) => viewing.geo)
			.map((viewing) => ({
				lat: (viewing.geo as { lat: number; lon: number }).lat,
				lon: (viewing.geo as { lat: number; lon: number }).lon,
				label: viewing.year ? `${viewing.title} (${viewing.year})` : viewing.title,
				href: `/movie?uid=${encodeURIComponent(viewing.uid)}`,
				posterUrl: viewing.posterUrl,
			}));
		status =
			pins.length === 0
				? "No located viewings yet."
				: `${pins.length} located viewing${pins.length === 1 ? "" : "s"} of ${viewings.length} logged.`;
	} catch (error) {
		status = error instanceof Error ? error.message : "Failed to load the map.";
	}
}

load();
reloadOnBfcacheRestore(() => void load());
</script>

<div class="flex flex-col gap-4">
  <p class={STATUS_TEXT} role="status">{status}</p>
  <VenueMap {pins} />
</div>
