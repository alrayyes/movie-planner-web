<script lang="ts">
// biome-ignore lint/correctness/noUnusedImports: used in the template below, which Biome does not parse for .svelte files
import { openStreetMapUrl } from "../lib/geo/links";
// biome-ignore lint/correctness/noUnusedImports: used in the template below, which Biome does not parse for .svelte files
import { imdbUrl, letterboxdHref, rottenTomatoesSearchUrl } from "../lib/omdb/links";
import { decodeSharedState, type SharedState } from "../lib/share/encode";
// biome-ignore lint/correctness/noUnusedImports: used in the template below, which Biome does not parse for .svelte files
import { STATUS_TEXT, TABLE, TABLE_WRAP, TD, TH, TR_BODY } from "../lib/ui/classes";
// biome-ignore lint/correctness/noUnusedImports: used in the template below, which Biome does not parse for .svelte files
import { formatPeriod } from "../lib/ui/datetime";
// biome-ignore lint/correctness/noUnusedImports: used in the template below, which Biome does not parse for .svelte files
import PosterPlaceholder from "./PosterPlaceholder.svelte";

// #335: a frozen, read-only rendering of whatever another visitor
// shared a link to. Deliberately its own small component rather than a
// read-only mode threaded through CalendarOverview.svelte — this page
// never touches CalDAV/OMDb at all (no credentials exist to touch them
// with), so there's no write path here to hide in the first place, only
// a much smaller subset of the overview's own display concerns to
// reproduce.
// biome-ignore lint/correctness/noUnusedVariables: read in the template below, which Biome does not parse for .svelte files
let state = $state<SharedState | null>(null);
// biome-ignore lint/correctness/noUnusedVariables: read in the template below, which Biome does not parse for .svelte files
let error = $state<string | null>(null);

$effect(() => {
	const raw = new URLSearchParams(location.search).get("state");
	if (!raw) {
		error = "This link is missing its shared data.";
		return;
	}
	decodeSharedState(raw)
		.then((decoded) => {
			state = decoded;
		})
		.catch(() => {
			error = "This link's shared data couldn't be read — it may be corrupted or truncated.";
		});
});

// biome-ignore lint/correctness/noUnusedVariables: used in the template below, which Biome does not parse for .svelte files
function formatSharedAt(iso: string): string {
	return new Date(iso).toLocaleString(undefined, {
		dateStyle: "medium",
		timeStyle: "short",
	});
}
</script>

{#if error}
	<p class={STATUS_TEXT} role="alert">{error}</p>
{:else if !state}
	<p class={STATUS_TEXT} role="status">Loading shared viewings…</p>
{:else}
	<div
		class="mb-4 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100"
		role="note"
	>
		Read-only, frozen as of {formatSharedAt(state.sharedAt)} — not live, and
		nothing here can be edited.
	</div>
	<p class={STATUS_TEXT} role="status">
		{state.viewings.length} viewing{state.viewings.length === 1 ? "" : "s"}
	</p>
	<div class={`mt-4 ${TABLE_WRAP}`}>
		<table class={TABLE}>
			<thead>
				<tr>
					<th class={TH} scope="col">Poster</th>
					<th class={TH} scope="col">Title</th>
					<th class={TH} scope="col">When</th>
					<th class={TH} scope="col">Venue</th>
				</tr>
			</thead>
			<tbody class="divide-y divide-slate-200 dark:divide-slate-700">
				{#each state.viewings as viewing (viewing.uid)}
					{@const links = [
						viewing.imdbId
							? { label: 'IMDb', href: imdbUrl(viewing.imdbId) }
							: null,
						{ label: 'RT', href: rottenTomatoesSearchUrl(viewing.title) },
						{ label: 'Letterboxd', href: letterboxdHref(viewing) },
					].filter((l) => l !== null)}
					<tr class={TR_BODY}>
						<td class={TD}>
							{#if viewing.posterUrl}
								<img
									src={viewing.posterUrl}
									alt={`${viewing.title} poster`}
									class="h-24 w-16 max-w-none rounded object-cover shadow-sm sm:h-40 sm:w-24"
									loading="lazy"
								/>
							{:else}
								<PosterPlaceholder class="h-24 w-16 rounded shadow-sm sm:h-40 sm:w-24" />
							{/if}
						</td>
						<td class={TD}>
							<span class="font-medium text-slate-900 dark:text-slate-100">
								{viewing.year ? `${viewing.title} (${viewing.year})` : viewing.title}
							</span>
							{#if links.length > 0}
								<div class="mt-1 flex gap-2 text-xs">
									{#each links as link (link.label)}
										<a
											href={link.href}
											target="_blank"
											rel="noopener noreferrer"
											class="text-indigo-600 hover:underline dark:text-indigo-400"
										>
											{link.label}
										</a>
									{/each}
								</div>
							{/if}
						</td>
						<td class={TD}>{formatPeriod(viewing.start, viewing.end)}</td>
						<td class={TD}>
							{viewing.venue ?? ""}
							{#if viewing.geo}
								<a
									href={openStreetMapUrl(viewing.geo)}
									target="_blank"
									rel="noopener noreferrer"
									class="ml-1 text-indigo-600 underline dark:text-indigo-400"
								>
									map
								</a>
							{/if}
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
{/if}
