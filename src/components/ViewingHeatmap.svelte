<script lang="ts">
import { listViewings } from "../lib/caldav/client";
import type { CaldavConfig, LoggedViewing } from "../lib/caldav/types";
import { getCredentialsStore } from "../lib/credentials/store";
import { importCheckRange } from "../lib/movie-log/run-import";
import { reloadOnBfcacheRestore } from "../lib/ui/bfcache";
// biome-ignore lint/correctness/noUnusedImports: used in the template below, which Biome does not parse for .svelte files
import { BUTTON_SECONDARY, STATUS_TEXT } from "../lib/ui/classes";
// biome-ignore lint/correctness/noUnusedImports: formatTime is used in the template below, which Biome does not parse for .svelte files
import { formatTime, toDateInputValue } from "../lib/ui/datetime";
import { groupViewingsByLocalDay } from "../lib/ui/heatmap";
// biome-ignore lint/correctness/noUnusedImports: used in the template below, which Biome does not parse for .svelte files
import PosterPlaceholder from "./PosterPlaceholder.svelte";

// #198/#204: a GitHub-contribution-style heatmap of viewing density
// across the visitor's whole logged history — a different
// visualization of the same data the calendar overview already shows
// as a table, on its own page (same reasoning as the Venues page:
// avoids reconciling the overview's own filter state with this view).
// No range scrubber — a visitor wanting a narrower view already has
// the overview's own From/To fields.
//
// A day cell opens a popover listing that day's own viewings (title,
// medium, venue), each linking straight to its own details page —
// deliberately not a navigation to the filtered overview, so glancing
// at a day doesn't leave the heatmap itself.

// biome-ignore lint/correctness/noUnusedVariables: read in the template below, which Biome does not parse for .svelte files
let status = $state("Loading…");
let viewingsByDay = $state<Map<string, LoggedViewing[]>>(new Map());
let dialogEl = $state<HTMLDialogElement>();
let selectedDay = $state<string | undefined>();
// "pinned" (opened by click/Enter, a real showModal()) stays open until
// explicitly closed; "hover" (opened by mouseenter/focus, a plain
// show()) closes on mouseleave/blur, after a short delay so moving the
// pointer from the cell into the popup itself doesn't lose it.
let dialogMode = $state<"closed" | "hover" | "pinned">("closed");
let hoverCloseTimer: ReturnType<typeof setTimeout> | undefined;

// biome-ignore lint/correctness/noUnusedVariables: read in the template below, which Biome does not parse for .svelte files
const selectedViewings = $derived(selectedDay ? (viewingsByDay.get(selectedDay) ?? []) : []);

// The full contiguous day range to render — from the earliest to the
// latest local day with a logged viewing, inclusive, so the grid shows
// exactly the ground the visitor's own history actually covers.
// #241: a genuinely empty account (nothing logged at all) renders no
// grid at all — not a 12-month wall of empty cells with nothing under
// it (the old #199 fallback range). A real device screenshot showed
// how noisy that read: "No logged viewings yet." followed by six-plus
// months of uniform grey boxes.
const days = $derived.by(() => {
	if (viewingsByDay.size === 0) return [];
	const keys = [...viewingsByDay.keys()].sort();
	const first = keys[0] as string;
	const last = keys[keys.length - 1] as string;
	const [fy, fm, fd] = first.split("-").map(Number) as [number, number, number];
	const [ly, lm, ld] = last.split("-").map(Number) as [number, number, number];
	const start = new Date(fy, fm - 1, fd);
	const end = new Date(ly, lm - 1, ld);
	const result: string[] = [];
	for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
		result.push(toDateInputValue(d.toISOString()));
	}
	return result;
});

// A visible month/year label per group of cells — a visitor could
// already get an exact date from a cell's own accessible name/title,
// but that means hovering or navigating to each one in turn; a heading
// every time the month changes gives a reference point at a glance
// instead, the same role GitHub's own heatmap gives its month labels.
interface MonthGroup {
	key: string;
	label: string;
	days: string[];
	// #259: a month with zero logged viewings across every one of its
	// days renders as a single compact line instead of a full ~30-cell
	// empty grid — a real device screenshot showed how much dead space
	// several such months in a row add up to for a genuinely sparse but
	// real history (a visitor a few viewings apart doesn't mean this
	// app has nothing for that whole stretch). A month with at least
	// one active day still renders its full grid, empty days and all —
	// that's real, useful density information, not noise.
	hasActivity: boolean;
}

// biome-ignore lint/correctness/noUnusedVariables: read in the template below, which Biome does not parse for .svelte files
const monthGroups = $derived.by(() => {
	const groups: MonthGroup[] = [];
	let current: MonthGroup | undefined;
	for (const day of days) {
		const [y, m] = day.split("-") as [string, string];
		const key = `${y}-${m}`;
		if (!current || current.key !== key) {
			const label = new Date(Number(y), Number(m) - 1, 1).toLocaleDateString("en-US", {
				month: "long",
				year: "numeric",
			});
			current = { key, label, days: [], hasActivity: false };
			groups.push(current);
		}
		current.days.push(day);
		if (viewingsByDay.has(day)) current.hasActivity = true;
	}
	return groups;
});

// A small fixed set of buckets, not a continuous gradient — easier to
// keep distinguishable in both light and dark mode (design.md).
// #230: an empty cell's own dark shade must never equal Layout.astro's
// card background (dark:bg-slate-800) — it did, making every empty
// cell on the page (the whole grid, on a fresh account with nothing
// logged yet) genuinely invisible rather than just unshaded.
// biome-ignore lint/correctness/noUnusedVariables: read in the template below, which Biome does not parse for .svelte files
function shadeClass(count: number): string {
	if (count === 0) return "bg-slate-100 dark:bg-slate-700";
	if (count === 1) return "bg-indigo-200 dark:bg-indigo-900";
	if (count <= 3) return "bg-indigo-400 dark:bg-indigo-600";
	return "bg-indigo-600 dark:bg-indigo-400";
}

// biome-ignore lint/correctness/noUnusedVariables: read in the template below, which Biome does not parse for .svelte files
function cellLabel(day: string, count: number): string {
	return `${day}: ${count} viewing${count === 1 ? "" : "s"}`;
}

// Positions the dialog next to the cell the visitor actually clicked,
// not the browser's default centered placement — a popup appearing far
// from what was clicked reads as unrelated to it. Measured and clamped
// after showModal() so the dialog's own real rendered size (which
// depends on how many viewings it lists) is what's used, not a guess.
function positionNear(trigger: HTMLElement) {
	if (!dialogEl) return;
	const triggerRect = trigger.getBoundingClientRect();
	const dialogRect = dialogEl.getBoundingClientRect();
	const margin = 8;
	let top = triggerRect.bottom + margin;
	if (top + dialogRect.height > window.innerHeight - margin) {
		top = triggerRect.top - dialogRect.height - margin;
	}
	top = Math.min(
		Math.max(margin, top),
		Math.max(margin, window.innerHeight - dialogRect.height - margin),
	);
	let left = triggerRect.left;
	left = Math.min(
		Math.max(margin, left),
		Math.max(margin, window.innerWidth - dialogRect.width - margin),
	);
	dialogEl.style.margin = "0";
	dialogEl.style.top = `${top}px`;
	dialogEl.style.left = `${left}px`;
}

// Closing (or re-showing) a <dialog> synchronously restores keyboard
// focus to whatever triggered it (the day cell button) — which fires
// that button's own onfocus handler right back, reopening the popup
// we just meant to close. This guard makes openDayOnHover ignore a
// focus event caused by our own close()/show() calls, not a real
// keyboard Tab onto the cell.
let suppressFocusReopen = false;

function closeDialogEl() {
	if (!dialogEl?.open) return;
	suppressFocusReopen = true;
	dialogEl.close();
	suppressFocusReopen = false;
}

// biome-ignore lint/correctness/noUnusedVariables: bound in the template below, which Biome does not parse for .svelte files
function openDay(day: string, event: MouseEvent) {
	clearTimeout(hoverCloseTimer);
	selectedDay = day;
	closeDialogEl();
	dialogEl?.showModal();
	dialogMode = "pinned";
	positionNear(event.currentTarget as HTMLElement);
}

// biome-ignore lint/correctness/noUnusedVariables: bound in the template below, which Biome does not parse for .svelte files
function openDayOnHover(day: string, event: FocusEvent | MouseEvent) {
	if (dialogMode === "pinned" || suppressFocusReopen) return;
	clearTimeout(hoverCloseTimer);
	selectedDay = day;
	closeDialogEl();
	dialogEl?.show();
	dialogMode = "hover";
	positionNear(event.currentTarget as HTMLElement);
}

// biome-ignore lint/correctness/noUnusedVariables: bound in the template below, which Biome does not parse for .svelte files
function scheduleHoverClose() {
	if (dialogMode !== "hover") return;
	clearTimeout(hoverCloseTimer);
	hoverCloseTimer = setTimeout(() => {
		if (dialogMode === "hover") {
			closeDialogEl();
			dialogMode = "closed";
		}
	}, 150);
}

// biome-ignore lint/correctness/noUnusedVariables: bound in the template below, which Biome does not parse for .svelte files
function cancelHoverClose() {
	clearTimeout(hoverCloseTimer);
}

// biome-ignore lint/correctness/noUnusedVariables: bound in the template below, which Biome does not parse for .svelte files
function closeDialog() {
	clearTimeout(hoverCloseTimer);
	closeDialogEl();
	dialogMode = "closed";
}

async function load() {
	const credentials = await getCredentialsStore().get();
	if (!credentials) {
		status = "Connect first to see your viewing heatmap.";
		return;
	}
	const config: CaldavConfig = {
		baseUrl: credentials.caldavUrl,
		username: credentials.caldavUsername,
		password: credentials.caldavPassword,
	};
	try {
		const viewings = await listViewings(config, importCheckRange());
		viewingsByDay = groupViewingsByLocalDay(viewings);
		status =
			viewings.length === 0
				? "No logged viewings yet."
				: `${viewings.length} logged viewing${viewings.length === 1 ? "" : "s"}.`;
	} catch (error) {
		status = error instanceof Error ? error.message : "Failed to load the heatmap.";
	}
}

load();
// #223: see CalendarOverview.svelte's own reloadOnBfcacheRestore call.
reloadOnBfcacheRestore(() => void load());
</script>

<div class="flex flex-col gap-6">
  <p class={STATUS_TEXT} role="status">{status}</p>
  {#each monthGroups as group (group.key)}
    <div class="flex flex-col gap-2">
      <h2 class="text-sm font-semibold text-slate-700 dark:text-slate-300">{group.label}</h2>
      {#if group.hasActivity}
        <div
          class="grid gap-1"
          style="grid-template-columns: repeat(auto-fill, minmax(0.85rem, 1fr));"
        >
          {#each group.days as day (day)}
            {@const count = viewingsByDay.get(day)?.length ?? 0}
            {#if count > 0}
              <button
                type="button"
                class={`aspect-square rounded-sm ${shadeClass(count)} hover:ring-2 hover:ring-indigo-500`}
                aria-label={cellLabel(day, count)}
                title={cellLabel(day, count)}
                onclick={(event) => openDay(day, event)}
                onmouseenter={(event) => openDayOnHover(day, event)}
                onmouseleave={scheduleHoverClose}
                onfocus={(event) => openDayOnHover(day, event)}
                onblur={scheduleHoverClose}
              ></button>
            {:else}
              <span
                role="img"
                class={`aspect-square rounded-sm ${shadeClass(count)}`}
                aria-label={cellLabel(day, count)}
                title={cellLabel(day, count)}
              ></span>
            {/if}
          {/each}
        </div>
      {:else}
        <p class="text-sm text-slate-500 dark:text-slate-400">No viewings.</p>
      {/if}
    </div>
  {/each}
</div>

<!-- Same native <dialog> pattern as <keyboard-nav>'s own help overlay —
closable by clicking outside its content, since the padding belongs to
the dialog element itself, not the inner content div. -->
<dialog
  bind:this={dialogEl}
  aria-label={selectedDay ? `Viewings on ${selectedDay}` : "Viewings"}
  class="max-w-sm rounded-lg border border-slate-200 bg-white p-4 text-slate-900 shadow-lg backdrop:bg-slate-900/40 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
  onclick={(event) => {
    if (event.target === dialogEl) closeDialog();
  }}
  onmouseenter={cancelHoverClose}
  onmouseleave={scheduleHoverClose}
>
  <div class="flex flex-col gap-3">
    <h2 class="text-base font-semibold text-slate-900 dark:text-slate-100">{selectedDay}</h2>
    <ul class="flex flex-col gap-2">
      {#each selectedViewings as viewing (viewing.uid)}
        <li class="flex gap-3">
          {#if viewing.posterUrl}
            <img
              src={viewing.posterUrl}
              alt=""
              class="h-16 w-11 flex-none rounded object-cover shadow-sm"
            />
          {:else}
            <!-- #236: same slot/size a real poster would occupy. -->
            <PosterPlaceholder class="h-16 w-11 flex-none rounded shadow-sm" />
          {/if}
          <div class="flex flex-col gap-0.5">
            <a
              href={`/movie?uid=${encodeURIComponent(viewing.uid)}`}
              class="font-medium text-indigo-600 hover:underline dark:text-indigo-400"
            >
              {viewing.year ? `${viewing.title} (${viewing.year})` : viewing.title}
            </a>
            <p class="text-sm text-slate-600 dark:text-slate-400">
              {formatTime(viewing.start)}–{formatTime(viewing.end)} · {viewing.medium}{viewing.venue
                ? ` · ${viewing.venue}`
                : ""}
            </p>
            {#if viewing.director || viewing.genre}
              <p class="text-xs text-slate-500 dark:text-slate-400">
                {[viewing.director, viewing.genre].filter(Boolean).join(" · ")}
              </p>
            {/if}
            {#if viewing.ratingImdb}
              <p class="text-xs text-slate-500 dark:text-slate-400">IMDb {viewing.ratingImdb}</p>
            {/if}
          </div>
        </li>
      {/each}
    </ul>
    <button type="button" class={BUTTON_SECONDARY} onclick={closeDialog}>Close</button>
  </div>
</dialog>
