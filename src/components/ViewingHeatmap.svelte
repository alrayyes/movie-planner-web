<script lang="ts">
import { listViewings } from "../lib/caldav/client";
import type { CaldavConfig, LoggedViewing } from "../lib/caldav/types";
import { getCredentialsStore } from "../lib/credentials/store";
import { importCheckRange } from "../lib/movie-log/run-import";
import { reloadOnBfcacheRestore } from "../lib/ui/bfcache";
// biome-ignore lint/correctness/noUnusedImports: used in the template below, which Biome does not parse for .svelte files
import { BUTTON_SECONDARY, STATUS_TEXT, TABLE_WRAP } from "../lib/ui/classes";
// biome-ignore lint/correctness/noUnusedImports: used in the template below, which Biome does not parse for .svelte files
import { formatTime } from "../lib/ui/datetime";
import { buildYearGrids, groupViewingsByLocalDay } from "../lib/ui/heatmap";
// biome-ignore lint/correctness/noUnusedImports: used in the template below, which Biome does not parse for .svelte files
import { venueDisplay } from "../lib/venue/display";
// biome-ignore lint/correctness/noUnusedImports: used in the template below, which Biome does not parse for .svelte files
import ErrorToast from "./ErrorToast.svelte";
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
// #442: a genuine load failure gets the distinct error-toast treatment
// instead of blending into status's own quiet line.
// biome-ignore lint/correctness/noUnusedVariables: read in the template below, which Biome does not parse for .svelte files
let loadError = $state("");
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

// #536: redesigned into a GitHub-contribution-graph-style grid — weeks
// as columns, Sunday-to-Saturday as rows, month labels above the
// columns they span — grouped by real calendar-year boundaries. The
// grid-computation itself (padding cells, month-label placement, the
// current-year-stops-at-today rule) lives in heatmap.ts's
// buildYearGrids, unit-tested there; this component just renders it
// and keeps the click-to-navigate/popup behavior.
//
// #241: a genuinely empty account (nothing logged at all) renders no
// grid at all — buildYearGrids already returns [] for empty counts, so
// this still needs no special-casing here.
const dayCounts = $derived.by(() => {
	const counts = new Map<string, number>();
	for (const [day, dayViewings] of viewingsByDay) counts.set(day, dayViewings.length);
	return counts;
});
// biome-ignore lint/correctness/noUnusedVariables: read in the template below, which Biome does not parse for .svelte files
const yearGrids = $derived.by(() => buildYearGrids(dayCounts));

// #275: a year heading and each month label are both clickable —
// unlike a day cell (which opens a popup so glancing at one day
// doesn't leave the heatmap), a month or a whole year is too much to
// preview in a popup, so these navigate to the overview instead,
// filtered to that exact span.
// biome-ignore lint/correctness/noUnusedVariables: read in the template below, which Biome does not parse for .svelte files
function yearHref(year: string): string {
	return `/?from=${year}-01-01&to=${year}-12-31`;
}

// biome-ignore lint/correctness/noUnusedVariables: read in the template below, which Biome does not parse for .svelte files
function monthHref(monthKey: string): string {
	const [y, m] = monthKey.split("-").map(Number) as [number, number];
	const lastDay = String(new Date(y, m, 0).getDate()).padStart(2, "0");
	return `/?from=${monthKey}-01&to=${monthKey}-${lastDay}`;
}

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
	loadError = "";
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
		status = "";
		loadError = error instanceof Error ? error.message : "Failed to load the heatmap.";
	}
}

load();
// #223: see CalendarOverview.svelte's own reloadOnBfcacheRestore call.
reloadOnBfcacheRestore(() => void load());
</script>

<div class="flex flex-col gap-6">
  <p class={STATUS_TEXT} role="status">{status}</p>
  {#if loadError}
    <ErrorToast message={loadError} onDismiss={() => (loadError = "")} />
  {/if}
  {#each yearGrids as yearGrid (yearGrid.year)}
    <div class="flex flex-col gap-2">
      <h2 class="text-base font-semibold text-slate-900 dark:text-slate-100">
        <a href={yearHref(yearGrid.year)} class="hover:underline">{yearGrid.year}</a>
      </h2>
      <!-- #536: one continuous grid per year — weeks as columns
      (`grid-template-columns`, one track per week), Sunday-to-Saturday
      as rows (row 1 reserved for month labels, rows 2-8 for the days),
      each cell placed by explicit grid-column/grid-row rather than
      document order, so month labels and their columns share exactly
      the same track sizing GitHub's own graph relies on. -->
      <div class={TABLE_WRAP}>
        <div
          class="grid w-max auto-rows-min gap-1 p-2"
          style={`grid-template-columns: repeat(${yearGrid.weeks.length}, 0.75rem); grid-template-rows: 1rem repeat(7, 0.75rem);`}
        >
          {#each yearGrid.monthLabels as monthLabel (monthLabel.monthKey)}
            <a
              href={monthHref(monthLabel.monthKey)}
              class="text-xs text-slate-500 hover:underline dark:text-slate-400"
              style={`grid-column: ${monthLabel.weekIndex + 1}; grid-row: 1;`}
            >
              {monthLabel.label}
            </a>
          {/each}
          {#each yearGrid.weeks as week, weekIndex (weekIndex)}
            {#each week.days as day, dayOfWeek (dayOfWeek)}
              {#if day === null}
                <!-- A padding cell outside the year (before its January
                1st, or after its own end date) — decorative filler to
                keep the grid rectangular, not a real day. -->
                <span
                  aria-hidden="true"
                  style={`grid-column: ${weekIndex + 1}; grid-row: ${dayOfWeek + 2};`}
                ></span>
              {:else if day.count > 0}
                <button
                  type="button"
                  class={`h-3 w-3 rounded-sm ${shadeClass(day.count)} hover:ring-2 hover:ring-indigo-500`}
                  style={`grid-column: ${weekIndex + 1}; grid-row: ${dayOfWeek + 2};`}
                  aria-label={cellLabel(day.date, day.count)}
                  title={cellLabel(day.date, day.count)}
                  onclick={(event) => openDay(day.date, event)}
                  onmouseenter={(event) => openDayOnHover(day.date, event)}
                  onmouseleave={scheduleHoverClose}
                  onfocus={(event) => openDayOnHover(day.date, event)}
                  onblur={scheduleHoverClose}
                ></button>
              {:else}
                <span
                  role="img"
                  class={`h-3 w-3 rounded-sm ${shadeClass(day.count)}`}
                  style={`grid-column: ${weekIndex + 1}; grid-row: ${dayOfWeek + 2};`}
                  aria-label={cellLabel(day.date, day.count)}
                  title={cellLabel(day.date, day.count)}
                ></span>
              {/if}
            {/each}
          {/each}
        </div>
      </div>
    </div>
  {/each}
</div>

<!-- Same native <dialog> pattern as <keyboard-nav>'s own help overlay —
closable by clicking outside its content, since the padding belongs to
the dialog element itself, not the inner content div.

#565: `fixed left-0 top-0 m-0` — a non-modal <dialog>'s UA-default position
is `position: absolute; inset-block-start: 0; margin: auto` — pinned to
the very top of the page. Some browsers (confirmed: WebKit/Safari, not
reproducible under Chromium or Firefox) scroll a freshly shown dialog
into view as part of opening it, before positionNear() below gets a
chance to move it next to the actual hovered cell — so hovering a cell
far down the page jumped the whole page up to that top-pinned default.
Pinning it here instead keeps it inside the viewport (top-left corner)
from the instant it opens, so there's nothing left for that
scroll-into-view step to do; showModal()'s own default (viewport-centered,
fixed) never had this problem for the same reason. -->
<dialog
  bind:this={dialogEl}
  aria-label={selectedDay ? `Viewings on ${selectedDay}` : "Viewings"}
  class="fixed left-0 top-0 m-0 max-w-sm rounded-lg border border-slate-200 bg-white p-4 text-slate-900 shadow-lg backdrop:bg-slate-900/40 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
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
                ? ` · ${venueDisplay(viewing.venue, viewing.city)}`
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
