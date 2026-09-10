<script lang="ts">
import { type ActivityLogEntry, getActivityLogStore } from "../lib/activity-log/store";
// biome-ignore lint/correctness/noUnusedImports: used in the template below, which Biome does not parse for .svelte files
import { movieHref } from "../lib/movie-log/movie-link";
// biome-ignore lint/correctness/noUnusedImports: used in the template below, which Biome does not parse for .svelte files
import { STATUS_TEXT, TABLE, TABLE_WRAP, TD, TH, TR_BODY } from "../lib/ui/classes";
// biome-ignore lint/correctness/noUnusedImports: used in the template below, which Biome does not parse for .svelte files
import ErrorToast from "./ErrorToast.svelte";

// #349: a local, per-browser reference for "what did this app just do" —
// not a shared audit trail with the CLI, and not synced across devices.
// biome-ignore lint/correctness/noUnusedVariables: read in the template below, which Biome does not parse for .svelte files
let entries = $state<ActivityLogEntry[]>([]);
// biome-ignore lint/correctness/noUnusedVariables: read in the template below, which Biome does not parse for .svelte files
let loaded = $state(false);
// #442: this store read had no failure path at all before — a rejected
// promise (IndexedDB unavailable, a full quota) just left `loaded`
// false forever with nothing shown, which is worse than blending an
// error into routine status text. Genuine failures now surface with
// the same distinct error-toast treatment every other component uses.
// biome-ignore lint/correctness/noUnusedVariables: read in the template below, which Biome does not parse for .svelte files
let loadError = $state("");

$effect(() => {
	getActivityLogStore()
		.list()
		.then((list) => {
			entries = list;
			loaded = true;
		})
		.catch((error: unknown) => {
			loadError = error instanceof Error ? error.message : "Failed to load the activity log.";
		});
});

// biome-ignore lint/correctness/noUnusedVariables: used in the template below, which Biome does not parse for .svelte files
function formatWhen(iso: string): string {
	return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "medium" });
}

// biome-ignore lint/correctness/noUnusedVariables: read in the template below, which Biome does not parse for .svelte files
const ACTION_LABEL: Record<ActivityLogEntry["action"], string> = {
	created: "Created",
	updated: "Updated",
	deleted: "Deleted",
};

// #432: an entry logged before this shipped has no `actor` at all —
// shown as "This app", the only thing it could have been at the time.
const ACTOR_LABEL: Record<string, string> = {
	web: "This app",
	cli: "CLI",
	unknown: "Unknown",
};

// biome-ignore lint/correctness/noUnusedVariables: read in the template below, which Biome does not parse for .svelte files
function actorLabel(entry: ActivityLogEntry): string {
	return ACTOR_LABEL[entry.actor ?? "web"] ?? entry.actor ?? "This app";
}
</script>

{#if loadError}
	<ErrorToast message={loadError} onDismiss={() => (loadError = "")} />
{:else if loaded && entries.length === 0}
	<p class={STATUS_TEXT} role="status">
		Nothing recorded yet — every create, edit, delete, refresh, or OMDb match this app makes
		shows up here.
	</p>
{:else if loaded}
	<p class={STATUS_TEXT} role="status">
		{entries.length} entr{entries.length === 1 ? 'y' : 'ies'}
	</p>
	<div class={`mt-4 ${TABLE_WRAP}`}>
		<table class={TABLE}>
			<thead>
				<tr>
					<th class={TH} scope="col">When</th>
					<th class={TH} scope="col">Action</th>
					<th class={TH} scope="col">Actor</th>
					<th class={TH} scope="col">Title</th>
					<th class={TH} scope="col">Changes</th>
				</tr>
			</thead>
			<tbody class="divide-y divide-slate-200 dark:divide-slate-700">
				{#each entries as entry (entry.id)}
					<tr class={TR_BODY}>
						<td class={TD}>{formatWhen(entry.at)}</td>
						<td class={TD}>{ACTION_LABEL[entry.action]}</td>
						<td class={TD}>{actorLabel(entry)}</td>
						<td class={TD}>
							<a
								href={movieHref(entry.uid, { from: location.pathname + location.search })}
								class="text-indigo-600 hover:underline dark:text-indigo-400"
							>
								{entry.title ?? entry.uid}
							</a>
						</td>
						<td class={TD}>
							{#if entry.changes && entry.changes.length > 0}
								<ul class="flex flex-col gap-1">
									{#each entry.changes as change (change.field)}
										<li>
											<span class="font-medium">{change.field}</span>:
											{change.before ?? '(none)'} → {change.after ?? '(none)'}
										</li>
									{/each}
								</ul>
							{/if}
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
{/if}
