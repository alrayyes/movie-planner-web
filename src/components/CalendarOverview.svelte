<script lang="ts">
import { syncCaldavActivityLog } from "../lib/activity-log/sync";
import {
	deleteViewing,
	getPicklists,
	getViewing,
	listViewings,
	updateViewing,
} from "../lib/caldav/client";
import type { CaldavConfig, LoggedViewing } from "../lib/caldav/types";
import { importCheckRange } from "../lib/movie-log/run-import";
import { lookupByImdbId, lookupMovie, type OmdbCandidate, searchMovies } from "../lib/omdb/client";
// biome-ignore lint/correctness/noUnusedImports: used in the template below, which Biome does not parse for .svelte files
import { imdbUrl, letterboxdHref, rottenTomatoesSearchUrl } from "../lib/omdb/links";
import { hasOmdbMetadata } from "../lib/omdb/metadata";
import { splitMultiValue } from "../lib/omdb/multi-value";
import { buildOmdbPicker } from "../lib/omdb/picker";
import { parseReleasedDate } from "../lib/omdb/released-date";
import { enrichWithTmdb } from "../lib/tmdb/client";
import { ACTIVE_FILTER_LABEL_EVENT, activeFilterLabel } from "../lib/ui/active-filter";
import { reloadOnBfcacheRestore } from "../lib/ui/bfcache";
// biome-ignore lint/correctness/noUnusedImports: used in the template below, which Biome does not parse for .svelte files
import {
	BUTTON_PRIMARY,
	BUTTON_SECONDARY,
	BUTTON_SM,
	FIELD_WRAPPER,
	FILTER_CARD,
	INPUT,
	LABEL,
	STATUS_TEXT,
	TABLE,
	TABLE_WRAP,
	TD,
	TH,
	TR_BODY,
} from "../lib/ui/classes";
// biome-ignore lint/correctness/noUnusedImports: used in the template below, which Biome does not parse for .svelte files
import {
	computeBlockedTimeBar,
	formatPeriod,
	localDayBoundary,
	toDateInputValue,
} from "../lib/ui/datetime";
// biome-ignore lint/correctness/noUnusedImports: used in the template below, which Biome does not parse for .svelte files
import { computePageNumbers, PAGE_SIZE_OPTIONS } from "../lib/ui/pagination";
// biome-ignore lint/correctness/noUnusedImports: used in the template below, which Biome does not parse for .svelte files
import { venueDisplay } from "../lib/venue/display";
// biome-ignore lint/correctness/noUnusedImports: used in the template below, which Biome does not parse for .svelte files
import ErrorToast from "./ErrorToast.svelte";
// biome-ignore lint/correctness/noUnusedImports: used in the template below, which Biome does not parse for .svelte files
import IconImdb from "./icons/IconImdb.svelte";
// biome-ignore lint/correctness/noUnusedImports: used in the template below, which Biome does not parse for .svelte files
import IconLetterboxd from "./icons/IconLetterboxd.svelte";
// biome-ignore lint/correctness/noUnusedImports: used in the template below, which Biome does not parse for .svelte files
import IconRottenTomatoes from "./icons/IconRottenTomatoes.svelte";
// biome-ignore lint/correctness/noUnusedImports: used in the template below, which Biome does not parse for .svelte files
import PosterPlaceholder from "./PosterPlaceholder.svelte";
// biome-ignore lint/correctness/noUnusedImports: used in the template below, which Biome does not parse for .svelte files
import VenueMap, { type MapPin } from "./VenueMap.svelte";

// calendar-overview spec: the main screen — every logged viewing with full
// metadata, filterable by date range and medium, scoped to the visitor's
// own calendar (their own stored credentials are the only config this ever
// reads, so "whose data" falls out of the credentials capability rather
// than anything this element does itself).
//
// #102/#97: the first vanilla-to-Svelte conversion under this project's
// "touch it for real work, convert it" rule — this component's own
// manual `this.render()`-after-every-mutation bookkeeping (the vanilla
// version this replaced) is exactly the class of code Svelte's runes
// remove, and this PR's actual feature (a busy spinner while a refresh
// is in flight) needed that reactivity to not be its own tangle of
// manual DOM toggling on top of the manual re-rendering.
// #59: bounds how many rows render at once so the overview stays fast
// and scannable as the calendar grows, rather than rendering every
// viewing in the selected date range in one table.
// #300: a visitor's own choice now, not a fixed constant — a select
// with fixed options rather than a free-typed number, so there's no
// zero/negative/absurdly-large value to validate against. #448: the
// options themselves moved to lib/ui/pagination.ts, shared with the
// per-venue page.
let pageSize = $state(25);

// #169: Title/When/Venue are sortable columns — Poster and Refresh
// aren't real data to sort by.
type SortKey = "title" | "when" | "venue";
// biome-ignore lint/correctness/noUnusedVariables: used in the template below, which Biome does not parse for .svelte files
const SORTABLE_COLUMNS: [SortKey, string][] = [
	["title", "Title"],
	["when", "When"],
	["venue", "Venue"],
];

interface Props {
	config: CaldavConfig;
	omdbApiKey?: string;
	omdbPaused?: boolean;
	tmdbApiKey?: string;
}
const { config, omdbApiKey, omdbPaused = false, tmdbApiKey }: Props = $props();

// #80: a key alone isn't enough — a visitor can pause lookups to stay
// under OMDb's daily rate limit without clearing the stored key.
const omdbActive = $derived(Boolean(omdbApiKey) && !omdbPaused);

let allViewings = $state<LoggedViewing[]>([]);
// #140/#179: the location-management picklist alone misses a medium
// or venue that was only ever logged via the CLI, never typed into
// this app's own log form — same gap #116 fixed for the venues page's
// counts, here as autocomplete suggestions for every filter field.
// Actor and genre have no picklist of their own (OMDb-derived, not
// something a visitor types in) — their suggestions come entirely
// from the viewings already loaded.
let mediumPicklist = $state<string[]>([]);
let venuePicklist = $state<string[]>([]);
// biome-ignore lint/correctness/noUnusedVariables: read in the template below, which Biome does not parse for .svelte files
const mediumOptions = $derived.by(() => {
	const fromViewings = allViewings.map((v) => v.medium);
	return [...new Set([...mediumPicklist, ...fromViewings])].sort();
});
// #289: every other filter field already offers autocomplete from the
// visitor's own logged data — title had neither the field nor this.
// biome-ignore lint/correctness/noUnusedVariables: read in the template below, which Biome does not parse for .svelte files
const titleOptions = $derived.by(() => {
	return [...new Set(allViewings.map((v) => v.title))].sort();
});
// biome-ignore lint/correctness/noUnusedVariables: read in the template below, which Biome does not parse for .svelte files
const venueOptions = $derived.by(() => {
	const fromViewings = allViewings.map((v) => v.venue).filter((v): v is string => Boolean(v));
	return [...new Set([...venuePicklist, ...fromViewings])].sort();
});
// #498: a venue's city, for the datalist suggestion's trimmed display
// label only — matching/submission still key on the raw venue value in
// venueOptions above. Same "whichever viewing happens to carry it"
// lookup VenuesOverview.svelte already uses for its own city/country
// aggregation.
// biome-ignore lint/correctness/noUnusedVariables: read in the template below, which Biome does not parse for .svelte files
const venueCities = $derived.by(() => {
	const cities = new Map<string, string>();
	for (const v of allViewings) {
		if (v.venue && v.city && !cities.has(v.venue)) cities.set(v.venue, v.city);
	}
	return cities;
});
// biome-ignore lint/correctness/noUnusedVariables: read in the template below, which Biome does not parse for .svelte files
const directorOptions = $derived.by(() => {
	return [...new Set(allViewings.flatMap((v) => splitMultiValue(v.director)))].sort();
});
// biome-ignore lint/correctness/noUnusedVariables: read in the template below, which Biome does not parse for .svelte files
const actorOptions = $derived.by(() => {
	return [...new Set(allViewings.flatMap((v) => splitMultiValue(v.actors)))].sort();
});
// biome-ignore lint/correctness/noUnusedVariables: read in the template below, which Biome does not parse for .svelte files
const genreOptions = $derived.by(() => {
	return [...new Set(allViewings.flatMap((v) => splitMultiValue(v.genre)))].sort();
});
// #437: City no longer combines with Country (removed entirely, see
// below) — matches on city name alone.
// biome-ignore lint/correctness/noUnusedVariables: read in the template below, which Biome does not parse for .svelte files
const cityOptions = $derived.by(() => {
	return [...new Set(allViewings.map((v) => v.city).filter((v): v is string => Boolean(v)))].sort();
});
// #437: movieCountry/movieLanguage are comma-separated multi-value OMDb
// fields, same as director/actor/genre — splitMultiValue is what turns a
// co-production's "Australia, United States, China" into three separate,
// individually filterable options instead of one whole-string option.
// biome-ignore lint/correctness/noUnusedVariables: read in the template below, which Biome does not parse for .svelte files
const movieCountryOptions = $derived.by(() => {
	return [...new Set(allViewings.flatMap((v) => splitMultiValue(v.movieCountry)))].sort();
});
// biome-ignore lint/correctness/noUnusedVariables: read in the template below, which Biome does not parse for .svelte files
const movieLanguageOptions = $derived.by(() => {
	return [...new Set(allViewings.flatMap((v) => splitMultiValue(v.movieLanguage)))].sort();
});
// biome-ignore lint/correctness/noUnusedVariables: read in the template below, which Biome does not parse for .svelte files
const ratedOptions = $derived.by(() => {
	return [
		...new Set(allViewings.map((v) => v.rated).filter((v): v is string => Boolean(v))),
	].sort();
});
// #437: Released Year becomes a native <select> — its own known-value
// set is exactly the distinct years parseReleasedDate already extracts
// from loaded viewings, same bounded-set reasoning as Medium/Rated/City/
// Movie Country/Movie Language.
// biome-ignore lint/correctness/noUnusedVariables: read in the template below, which Biome does not parse for .svelte files
const releasedYearOptions = $derived.by(() => {
	return [
		...new Set(
			allViewings
				.map((v) => (v.released ? parseReleasedDate(v.released)?.year : undefined))
				.filter((v): v is string => Boolean(v)),
		),
	].sort();
});
// biome-ignore lint/correctness/noUnusedVariables: read in the template below, which Biome does not parse for .svelte files
let statusText = $state("");
// Separate from statusText (the result count, rewritten on every
// reload) so a "Saved."/"Refreshed." confirmation isn't clobbered the
// instant the post-write reload runs — see the omdb-refresh tests for
// why this used to disappear before anyone could read it.
// biome-ignore lint/correctness/noUnusedVariables: read in the template below, which Biome does not parse for .svelte files
let actionStatusText = $state("");
// #442: a genuine reload failure (a network error, a broken CalDAV
// server) gets the distinct error-toast treatment instead of blending
// into statusText's own quiet "Loading…"/count line.
// biome-ignore lint/correctness/noUnusedVariables: read in the template below, which Biome does not parse for .svelte files
let loadError = $state("");
// Same split for the per-row/bulk refresh, delete, and OMDb-picker
// actions that all share actionStatusText's own display line.
// biome-ignore lint/correctness/noUnusedVariables: read in the template below, which Biome does not parse for .svelte files
let actionError = $state("");
// #131/#146: pre-populated from `venue`/`from`/`to` query params so a
// link from the venues page (or anywhere else) lands here already
// filtered to the same viewings, with the values visible and editable
// like any other filter field rather than a silent, unexplained
// restriction. Without `from`/`to` too, a venue's count (drawn from
// whatever range was active on the venues page — its own wide default,
// or a narrower one a visitor picked there) wouldn't match what shows
// up here, which otherwise defaults to a much narrower ~3-month window.
const initialParams = new URLSearchParams(location.search);

// #292: this component remounts fresh (with a bare `location.search`)
// on any soft navigation away and back — a movie's own details page,
// say, followed by the browser's Back button — since it's a plain
// custom element imperatively mounting this island, not a persisted
// Astro island. A query param is the deliberate, shareable case (a
// link from the venues page); sessionStorage is what makes an
// *incidental* trip elsewhere and back not silently drop whatever a
// visitor had just filtered. Query params still win when both are
// present. Wrapped in try/catch like every other storage access in
// this app — private browsing, a full quota, or storage disabled
// outright shouldn't break the page, just skip the restore.
const FILTER_STORAGE_KEY = "movie-planner-web-overview-filters";
type StoredFilterKey =
	| "from"
	| "to"
	| "title"
	| "medium"
	| "venue"
	| "director"
	| "actor"
	| "genre"
	| "city"
	| "movieCountry"
	| "movieLanguage"
	| "rated"
	| "releasedYear"
	| "releasedMonth";
type StoredFilters = Partial<Record<StoredFilterKey, string>> & { open?: boolean };

const ALL_FILTER_KEYS: StoredFilterKey[] = [
	"from",
	"to",
	"title",
	"medium",
	"venue",
	"director",
	"actor",
	"genre",
	"city",
	"movieCountry",
	"movieLanguage",
	"rated",
	"releasedYear",
	"releasedMonth",
];

// #437: the everyday tier (From, To, Title, Medium, Venue) is always
// visible once Filters is expanded — everything else sits behind a
// nested "More filters" disclosure. Kept as its own list (rather than
// deriving "advanced" as ALL_FILTER_KEYS minus everyday) so the tier a
// key belongs to is legible at a glance here, not implied by exclusion.
const ADVANCED_FILTER_KEYS: StoredFilterKey[] = [
	"director",
	"actor",
	"genre",
	"city",
	"movieCountry",
	"movieLanguage",
	"rated",
	"releasedYear",
	"releasedMonth",
];

function readStoredFilters(): StoredFilters {
	try {
		const raw = sessionStorage.getItem(FILTER_STORAGE_KEY);
		return raw ? (JSON.parse(raw) as StoredFilters) : {};
	} catch {
		return {};
	}
}
const storedFilters = readStoredFilters();

// #374: a URL carrying any recognized filter param is the deliberate,
// single-filter case every chip link (Venues, movie details,
// heatmap) already produces — "cleared, only the clicked filter
// applies" was the confirmed design decision. Centralized here, in the
// one place every one of those entry points already funnels through
// (initialFilterValue, called once per field below), rather than each
// link site having to build its own "clear everything else" URL. A
// plain visit with no filter params at all still restores whatever was
// stored from an earlier visit, same as before this existed — only an
// explicit filter link overrides that instead of merging with it.
const hasAnyUrlFilter = ALL_FILTER_KEYS.some((key) => initialParams.get(key));

function initialFilterValue(key: StoredFilterKey): string {
	if (hasAnyUrlFilter) return initialParams.get(key) ?? "";
	return storedFilters[key] ?? "";
}

// #221: closed by default — seven fields plus buttons took up a lot of
// vertical space for something most visits don't touch. Starts open
// when a query param or a stored filter already carries an active
// filter (arriving from the venues page, or returning from elsewhere
// mid-filter), so a visitor who's clearly filtering doesn't have to
// reopen it to see what's applied. bind:open (not a one-way
// expression) — every reload() below touches other $state fields, and
// a one-way `open={...}` got re-applied on those unrelated updates,
// silently closing a visitor's own manually-opened filters right after
// they submitted one.
let filtersOpen = $state(hasAnyUrlFilter || Boolean(storedFilters.open));
// #437: the nested "More filters" tier starts open whenever an
// advanced-tier field already carries a value — a URL-carried chip
// filter (director, genre, ...) per the spec's own "still expands its
// own tier" scenario, or a restored stored filter, same reasoning as
// filtersOpen itself above.
// biome-ignore lint/correctness/noUnusedVariables: bound in the template below, which Biome does not parse for .svelte files
let moreFiltersOpen = $state(ADVANCED_FILTER_KEYS.some((key) => initialFilterValue(key)));
let fromValue = $state(initialFilterValue("from"));
let toValue = $state(initialFilterValue("to"));
// #289: unlike medium/venue (exact match against a short, categorical
// value), title is free text — a visitor typing "dune" expects it to
// match "Dune: Part Two", so this filters by substring, not equality.
let titleValue = $state(initialFilterValue("title"));
let mediumValue = $state(initialFilterValue("medium"));
let venueValue = $state(initialFilterValue("venue"));
// #163/#183: director/actor/genre are multi-value comma-separated OMDb
// fields, unlike venue/medium — matched against each individually
// split value, not the raw whole-string field, so a filter click
// always matches exactly the value a chip showed rather than a
// substring of the whole string.
let directorValue = $state(initialFilterValue("director"));
let actorValue = $state(initialFilterValue("actor"));
let genreValue = $state(initialFilterValue("genre"));
// #372: city/country are the venue's own geocoded location (#267) —
// a different concept from movieCountry/movieLanguage, the movie's own
// OMDb-derived fields. All five are exact-match, single-value, same as
// venue/medium above.
let cityValue = $state(initialFilterValue("city"));
let movieCountryValue = $state(initialFilterValue("movieCountry"));
let movieLanguageValue = $state(initialFilterValue("movieLanguage"));
let ratedValue = $state(initialFilterValue("rated"));
// #373/#437: the movie's own release date (parseReleasedDate, from
// OMDb's "DD MMM YYYY" Released field) — year and month, at their own
// independent granularities (releasedDate, the exact-day granularity,
// was removed outright: too granular a filter to justify the field).
let releasedYearValue = $state(initialFilterValue("releasedYear"));
let releasedMonthValue = $state(initialFilterValue("releasedMonth"));

// #376: a human-readable label for whichever single chip-driven filter
// (per #374) is active, shared with #375's breadcrumb — see
// lib/ui/active-filter.ts for why only some fields get shown here.
const activeFilterLabelValue = $derived(
	activeFilterLabel({
		medium: mediumValue,
		venue: venueValue,
		director: directorValue,
		actor: actorValue,
		genre: genreValue,
		city: cityValue,
		movieCountry: movieCountryValue,
		movieLanguage: movieLanguageValue,
		rated: ratedValue,
		releasedYear: releasedYearValue,
		releasedMonth: releasedMonthValue,
	}),
);

// The page <title> is set at build time (index.astro's Layout prop), but
// the filter state only exists client-side once this island reads the
// URL — so the active filter's own contribution has to be a client-side
// update on top of that build-time default, not a prop.
const DEFAULT_TITLE = document.title;
$effect(() => {
	document.title = activeFilterLabelValue
		? `${activeFilterLabelValue} — Movie Planner`
		: DEFAULT_TITLE;
	// #375: site-breadcrumb.ts is a plain custom element, not a Svelte
	// island, so it can't read activeFilterLabelValue directly — this is
	// what keeps its own "Home / <label>" trail in sync with every
	// filter change here, not just the one the page loaded with.
	window.dispatchEvent(
		new CustomEvent(ACTIVE_FILTER_LABEL_EVENT, { detail: activeFilterLabelValue }),
	);
});

// #169: defaults match the previous hardcoded "most recently watched
// first" behaviour — clicking a column header switches to sorting by
// it (ascending on first click), and clicking the same header again
// reverses direction.
let sortKey = $state<SortKey>("when");
let sortDirection = $state<"asc" | "desc">("desc");

// biome-ignore lint/correctness/noUnusedVariables: bound in the template below, which Biome does not parse for .svelte files
function handleSortClick(key: SortKey) {
	if (sortKey === key) {
		sortDirection = sortDirection === "asc" ? "desc" : "asc";
	} else {
		sortKey = key;
		sortDirection = "asc";
	}
}
let currentPage = $state(0);
// biome-ignore lint/correctness/noUnusedVariables: bound in the template below, which Biome does not parse for .svelte files
function handlePageSizeChange(event: Event) {
	pageSize = Number((event.target as HTMLSelectElement).value);
	currentPage = 0;
}
// #97: which row (by uid) or whether the bulk control is mid-request —
// drives the spinner in place of the refresh icon and disables the
// triggering control so it can't be double-clicked mid-flight.
// biome-ignore lint/correctness/noUnusedVariables: read in the template below, which Biome does not parse for .svelte files
let refreshingUid = $state<string | null>(null);
// biome-ignore lint/correctness/noUnusedVariables: read in the template below, which Biome does not parse for .svelte files
let refreshingAll = $state(false);
// #298: same busy-state pattern as refreshingUid — disables the
// triggering row's own Delete button so a double-click can't fire two
// delete requests for the same viewing.
// biome-ignore lint/correctness/noUnusedVariables: read in the template below, which Biome does not parse for .svelte files
let deletingUid = $state<string | null>(null);
let pickerArea = $state<HTMLDivElement | undefined>();

// Shared by currentPageItems and handleRefreshAll, so "refresh all"
// always acts on exactly what's currently on screen, not the
// unfiltered/unsorted full set.
const currentlyDisplayed = $derived.by(() => {
	const titleFilter = titleValue.trim().toLowerCase();
	const mediumFilter = mediumValue.trim().toLowerCase();
	const venueFilter = venueValue.trim().toLowerCase();
	const directorFilter = directorValue.trim().toLowerCase();
	const actorFilter = actorValue.trim().toLowerCase();
	const genreFilter = genreValue.trim().toLowerCase();
	const cityFilter = cityValue.trim().toLowerCase();
	const movieCountryFilter = movieCountryValue.trim().toLowerCase();
	const movieLanguageFilter = movieLanguageValue.trim().toLowerCase();
	const ratedFilter = ratedValue.trim().toLowerCase();
	const releasedYearFilter = releasedYearValue.trim();
	const releasedMonthFilter = releasedMonthValue.trim();
	const filtered = allViewings.filter((v) => {
		if (titleFilter && !v.title.toLowerCase().includes(titleFilter)) return false;
		if (mediumFilter && v.medium.toLowerCase() !== mediumFilter) return false;
		if (venueFilter && (v.venue ?? "").toLowerCase() !== venueFilter) return false;
		if (
			directorFilter &&
			!splitMultiValue(v.director).some((director) => director.toLowerCase() === directorFilter)
		)
			return false;
		if (
			actorFilter &&
			!splitMultiValue(v.actors).some((actor) => actor.toLowerCase() === actorFilter)
		)
			return false;
		if (
			genreFilter &&
			!splitMultiValue(v.genre).some((genre) => genre.toLowerCase() === genreFilter)
		)
			return false;
		if (cityFilter && (v.city ?? "").toLowerCase() !== cityFilter) return false;
		if (
			movieCountryFilter &&
			!splitMultiValue(v.movieCountry).some(
				(country) => country.toLowerCase() === movieCountryFilter,
			)
		)
			return false;
		if (
			movieLanguageFilter &&
			!splitMultiValue(v.movieLanguage).some(
				(language) => language.toLowerCase() === movieLanguageFilter,
			)
		)
			return false;
		if (ratedFilter && (v.rated ?? "").toLowerCase() !== ratedFilter) return false;
		if (releasedYearFilter || releasedMonthFilter) {
			const released = v.released ? parseReleasedDate(v.released) : null;
			if (!released) return false;
			if (releasedYearFilter && released.year !== releasedYearFilter) return false;
			if (releasedMonthFilter && released.month !== releasedMonthFilter) return false;
		}
		return true;
	});
	// Re-sorted fresh every time rather than relying on insertion order,
	// since a filtered subset can change shape after every reload.
	const direction = sortDirection === "asc" ? 1 : -1;
	return [...filtered].sort((a, b) => {
		if (sortKey === "title") return a.title.localeCompare(b.title) * direction;
		if (sortKey === "venue") return (a.venue ?? "").localeCompare(b.venue ?? "") * direction;
		return (new Date(a.start).getTime() - new Date(b.start).getTime()) * direction;
	});
});
const total = $derived(currentlyDisplayed.length);
const pages = $derived(Math.max(1, Math.ceil(total / pageSize)));
// #59: clamps a stale currentPage (a smaller reloaded set, or a larger
// page size, can leave it past the new last page) rather than
// rendering an empty page silently.
$effect(() => {
	if (currentPage > pages - 1) currentPage = pages - 1;
	if (currentPage < 0) currentPage = 0;
});
const currentPageItems = $derived.by(() => {
	const start = currentPage * pageSize;
	return currentlyDisplayed.slice(start, start + pageSize);
});
// #358: every viewing with known coordinates on the current page only —
// mirrors the table exactly, rather than the whole filtered set (#351's
// original scope), so the map never shows a pin for a viewing that
// isn't in the rows below it. The "see everything at once, across
// pages" view already has a home at Venues.
// biome-ignore lint/correctness/noUnusedVariables: read in the template below, which Biome does not parse for .svelte files
const mapPins = $derived.by((): MapPin[] =>
	currentPageItems
		.filter((v): v is LoggedViewing & { geo: { lat: number; lon: number } } => Boolean(v.geo))
		.map((v) => ({
			lat: v.geo.lat,
			lon: v.geo.lon,
			label: v.year ? `${v.title} (${v.year})` : v.title,
			href: `/movie?uid=${encodeURIComponent(v.uid)}`,
			posterUrl: v.posterUrl,
		})),
);
// #300/#448: Google-style windowed page numbers — first, last, and a
// small run around the current page, "…" filling any gap, rather than
// every page number when there are dozens of them. computePageNumbers
// itself lives in lib/ui/pagination.ts, shared with the per-venue page.
// biome-ignore lint/correctness/noUnusedVariables: read in the template below, which Biome does not parse for .svelte files
const pageNumbers = $derived(computePageNumbers(currentPage, pages));
// #89: nothing to bulk-refresh once every title on this page already
// has matched metadata — hide the control rather than offer an action
// that would call OMDb for nobody.
// biome-ignore lint/correctness/noUnusedVariables: read in the template below, which Biome does not parse for .svelte files
const showRefreshAll = $derived(omdbActive && currentPageItems.some((v) => !hasOmdbMetadata(v)));

// #188: no explicit From/To has never meant "no filter" in practice —
// it silently queried a fixed 3-months-back/1-year-forward window, so
// the fields looked blank while a hidden default was already narrowing
// what showed. Querying the same wide range bulk-import's own
// duplicate check uses (importCheckRange, 15 years back) instead, then
// letting reload() below fill fromValue/toValue in with the visitor's
// own actual first/last watched dates, makes the fields honestly show
// what's being applied instead of leaving them blank.
// #199: localDayBoundary/toDateInputValue moved to ../lib/ui/datetime —
// this feature's own heatmap needs the exact same local-day handling,
// and importing the fixed logic beats re-deriving it a third time.
function currentRange() {
	const wide = importCheckRange();
	const from = fromValue ? localDayBoundary(fromValue, false) : wide.from;
	const to = toValue ? localDayBoundary(toValue, true) : wide.to;
	return { from, to };
}

// #171: `silent` skips the "Loading…"/count-line updates — used by a
// single-row or bulk refresh's own post-write reload, which already
// has its own feedback (a per-row spinner, and "Refreshed."/"Already
// up to date." in actionStatusText) and doesn't need the aggregate
// count line to visibly flash for an action that never changes it.
// Errors still surface either way — that's new information, not
// routine flicker.
// A reload triggered while a previous one is still in flight (a fast
// double-click, a mount-time load overlapping a filter change, a
// browser back/forward fired in quick succession) aborts the older
// request rather than letting two REPORT requests race — the older
// one otherwise resolves into orphaned state nobody renders, and the
// visitor's own CalDAV server sees a wasted duplicate request for no
// reason.
let reloadController: AbortController | undefined;

async function reload(options: { silent?: boolean } = {}) {
	reloadController?.abort();
	const controller = new AbortController();
	reloadController = controller;
	loadError = "";
	if (!options.silent) statusText = "Loading…";
	const hadNoExplicitFrom = !fromValue;
	const hadNoExplicitTo = !toValue;
	try {
		allViewings = await listViewings(config, currentRange(), { signal: controller.signal });
		// #188: only when no explicit range was chosen — never overwrite a
		// visitor's own typed-in From/To, including on a silent
		// refresh-triggered reload that runs long after they set one.
		if ((hadNoExplicitFrom || hadNoExplicitTo) && allViewings.length > 0) {
			const starts = allViewings.map((v) => new Date(v.start).getTime());
			if (hadNoExplicitFrom)
				fromValue = toDateInputValue(new Date(Math.min(...starts)).toISOString());
			if (hadNoExplicitTo) toValue = toDateInputValue(new Date(Math.max(...starts)).toISOString());
		}
		// #435: the count has its own persistent element now (near the
		// page-size selector) rather than sharing this slot with
		// "Loading…" — clear it instead of writing the count here, so a
		// fresh load doesn't leave a second, redundant copy of the total
		// sitting in statusText too.
		if (!options.silent) statusText = "";
	} catch (error) {
		// Superseded by a newer reload — not a real failure, and the
		// newer call's own catch/success block is what should actually
		// update statusText now, not this stale one.
		if (error instanceof DOMException && error.name === "AbortError") return;
		if (!options.silent) statusText = "";
		loadError = error instanceof Error ? error.message : "Failed to load viewings.";
	}
}

// #292: mirrors the active filter into sessionStorage (see
// readStoredFilters above for why) — cleared outright once nothing is
// actually set, so a fully-cleared filter doesn't linger and silently
// reapply itself on the next incidental visit.
function syncFilterState() {
	const stored: StoredFilters = {};
	const entries: [StoredFilterKey, string][] = [
		["from", fromValue],
		["to", toValue],
		["title", titleValue],
		["medium", mediumValue],
		["venue", venueValue],
		["director", directorValue],
		["actor", actorValue],
		["genre", genreValue],
		["city", cityValue],
		["movieCountry", movieCountryValue],
		["movieLanguage", movieLanguageValue],
		["rated", ratedValue],
		["releasedYear", releasedYearValue],
		["releasedMonth", releasedMonthValue],
	];
	for (const [key, value] of entries) {
		if (value) stored[key] = value;
	}
	try {
		if (Object.keys(stored).length === 0) {
			sessionStorage.removeItem(FILTER_STORAGE_KEY);
		} else {
			stored.open = filtersOpen;
			sessionStorage.setItem(FILTER_STORAGE_KEY, JSON.stringify(stored));
		}
	} catch {
		// Private browsing, a full quota, storage disabled outright —
		// the filter still works for this visit, it just won't survive
		// a trip away and back.
	}
}

// #438: a browser only offers datalist suggestions that prefix-match the
// current text, so once a value is fully typed, switching to a *different*
// suggestion needs the field cleared first. Selecting the field's existing
// contents on focus means the next keystroke replaces it outright, landing
// on a fresh, unfiltered suggestion list instead of appending to stale
// text — shared across Title, Venue, Director, Actor and Genre rather than
// five one-off handlers.
// biome-ignore lint/correctness/noUnusedVariables: bound in the template below, which Biome does not parse for .svelte files
function handleFilterFieldFocus(event: FocusEvent) {
	const target = event.currentTarget;
	if (target instanceof HTMLInputElement) {
		target.select();
	}
}

// biome-ignore lint/correctness/noUnusedVariables: bound in the template below, which Biome does not parse for .svelte files
function handleFilterSubmit(event: SubmitEvent) {
	event.preventDefault();
	// #59: a new date range or medium filter is a new result set —
	// always reset to its first page rather than potentially landing
	// past its end.
	currentPage = 0;
	syncFilterState();
	void reload();
}

// biome-ignore lint/correctness/noUnusedVariables: bound in the template below, which Biome does not parse for .svelte files
function handleClearFilter() {
	fromValue = "";
	toValue = "";
	titleValue = "";
	mediumValue = "";
	venueValue = "";
	directorValue = "";
	actorValue = "";
	genreValue = "";
	cityValue = "";
	movieCountryValue = "";
	movieLanguageValue = "";
	ratedValue = "";
	releasedYearValue = "";
	releasedMonthValue = "";
	currentPage = 0;
	syncFilterState();
	void reload();
}

// #37: re-runs the best-effort OMDb lookup against the viewing's
// stored title and overwrites the stored director/actors/ratings/
// genre/year/poster/imdbId with the new result — the corrective action
// for stale or since-updated OMDb data, now that those fields aren't
// hand-editable.
// biome-ignore lint/correctness/noUnusedVariables: bound in the template below, which Biome does not parse for .svelte files
async function handleRefresh(viewing: LoggedViewing) {
	if (!omdbActive || !omdbApiKey) return;
	refreshingUid = viewing.uid;
	actionError = "";
	try {
		// #91: re-check the calendar entry itself first — it may have
		// been matched elsewhere (the CLI's own sync, another tab/device)
		// since this list was loaded, and only what's still actually
		// missing from it should ever reach OMDb. Everything below reads
		// and writes on top of this fresh copy, not the possibly-stale
		// `viewing` argument.
		const current = (await getViewing(config, viewing.uid)) ?? viewing;
		if (hasOmdbMetadata(current)) {
			await reload({ silent: true });
			actionStatusText = "Already up to date.";
			return;
		}
		const metadata = await lookupMovie(
			omdbApiKey,
			current.title,
			new Date(current.start).getFullYear().toString(),
		);
		if (metadata) {
			// #360/#400: TMDb only ever runs off an IMDb ID OMDb has just
			// resolved — never a title/year search of its own.
			const tmdbFields = await enrichWithTmdb(tmdbApiKey, metadata.imdbId);
			await updateViewing(config, current.uid, { ...current, ...metadata, ...tmdbFields });
			await reload({ silent: true });
			actionStatusText = "Refreshed.";
			return;
		}
		// #49: no single confident match — offer a disambiguation picker
		// if OMDb's search has candidates, rather than reporting no match
		// outright.
		const candidates = await searchMovies(omdbApiKey, current.title);
		if (candidates.length > 0) {
			showOmdbPicker(current, candidates);
			return;
		}
		actionStatusText = "OMDb had no match for this title.";
	} catch (error) {
		actionError = error instanceof Error ? error.message : "Failed to refresh metadata.";
	} finally {
		refreshingUid = null;
	}
}

// #298: Edit/Delete were deliberately dropped from this table in #93
// to declutter it, relocated to the details page — reversed directly
// on request, back to an icon-only Actions column (Edit links to the
// details page's own edit form; Delete acts inline, same confirm()
// prompt the details page already uses, so there's exactly one way
// this app ever confirms a delete).
// biome-ignore lint/correctness/noUnusedVariables: bound in the template below, which Biome does not parse for .svelte files
async function handleDelete(viewing: LoggedViewing) {
	if (!window.confirm(`Delete "${viewing.title}"? This can't be undone.`)) return;
	deletingUid = viewing.uid;
	actionError = "";
	try {
		await deleteViewing(config, viewing.uid);
		await reload({ silent: true });
		actionStatusText = "Deleted.";
	} catch (error) {
		actionError = error instanceof Error ? error.message : "Failed to delete.";
	} finally {
		deletingUid = null;
	}
}

function showOmdbPicker(viewing: LoggedViewing, candidates: OmdbCandidate[]) {
	if (!pickerArea || !omdbApiKey) return;
	pickerArea.replaceChildren(
		buildOmdbPicker(
			candidates,
			async (candidate) => {
				if (!omdbApiKey || !pickerArea) return;
				actionError = "";
				try {
					const metadata = await lookupByImdbId(omdbApiKey, candidate.imdbId);
					if (metadata) {
						// #360/#400: same TMDb enrichment step as the confident-match
						// branch above, since this is the same refresh action.
						const tmdbFields = await enrichWithTmdb(tmdbApiKey, metadata.imdbId);
						await updateViewing(config, viewing.uid, { ...viewing, ...metadata, ...tmdbFields });
					}
					await reload({ silent: true });
					actionStatusText = "Refreshed.";
				} catch (error) {
					actionError =
						error instanceof Error ? error.message : "Failed to attach the selected match.";
				} finally {
					pickerArea?.replaceChildren();
				}
			},
			() => {
				pickerArea?.replaceChildren();
				actionStatusText = "OMDb had no match for this title.";
			},
		),
	);
}

// Runs the same per-row refresh across every viewing currently on
// screen (#59: the current page of the filtered/sorted set, not the
// whole calendar or even the whole filtered result) — sequential
// rather than parallel, since it's hitting OMDb's own rate limits, not
// just this app's. #89: skips anything that already has matched
// metadata (an imdbId) — the calendar entry is the source of truth
// once it's been matched, so a bulk refresh doesn't spend quota
// re-confirming it.
// biome-ignore lint/correctness/noUnusedVariables: bound in the template below, which Biome does not parse for .svelte files
async function handleRefreshAll() {
	if (!omdbActive || !omdbApiKey) return;
	const targets = currentPageItems.filter((v) => !hasOmdbMetadata(v));
	if (targets.length === 0) return;

	refreshingAll = true;
	actionError = "";
	actionStatusText = `Refreshing 0 of ${targets.length}…`;
	let refreshed = 0;
	let misses = 0;
	try {
		for (const viewing of targets) {
			try {
				const metadata = await lookupMovie(
					omdbApiKey,
					viewing.title,
					new Date(viewing.start).getFullYear().toString(),
				);
				if (metadata) {
					// #360/#400: added to the same per-viewing sequential loop,
					// not parallelized — same rate-limit posture as the existing
					// OMDb bulk refresh.
					const tmdbFields = await enrichWithTmdb(tmdbApiKey, metadata.imdbId);
					await updateViewing(config, viewing.uid, { ...viewing, ...metadata, ...tmdbFields });
					refreshed++;
				} else {
					misses++;
				}
			} catch {
				misses++;
			}
			actionStatusText = `Refreshing ${refreshed + misses} of ${targets.length}…`;
		}

		await reload({ silent: true });
		actionStatusText =
			misses > 0
				? `Refreshed ${refreshed} of ${targets.length} (${misses} had no OMDb match or failed).`
				: `Refreshed ${refreshed} of ${targets.length}.`;
	} finally {
		refreshingAll = false;
	}
}

// #432: this page's own mount is "opening the app" — the natural place
// to run the diff-on-sync activity-log pass. Fire-and-forget and
// independent of reload() below: it fetches its own full, unfiltered
// range (see importCheckRange's own reasoning in sync.ts) rather than
// whatever currentRange() the visible table is scoped to, so it must
// never block, or be blocked by, the visible list loading.
//
// Astro's <ClientRouter/> keeps this page's own script running across
// a soft, client-side navigation (Layout.astro's own astro:before-swap
// handling deals with the same thing for dark mode) — without this
// abort, clicking through to a viewing's own details page moments
// after landing here would leave this sync's network/IndexedDB work
// still running underneath it. astro:before-swap fires once, right
// before that happens.
function syncActivityLogUntilNavigatedAway() {
	const controller = new AbortController();
	document.addEventListener("astro:before-swap", () => controller.abort(), { once: true });
	void syncCaldavActivityLog(config, { signal: controller.signal });
}

reload();
syncActivityLogUntilNavigatedAway();
// #223: a visitor deleting a viewing on the details page, then hitting
// Back, can land on this exact pre-delete DOM restored from the
// browser's bfcache rather than a fresh load — reload() never re-runs
// on its own in that case.
reloadOnBfcacheRestore(() => {
	reload({ silent: true });
	syncActivityLogUntilNavigatedAway();
});
getPicklists(config).then((picklists) => {
	mediumPicklist = picklists.media;
	venuePicklist = picklists.venues;
});
</script>

<div class="flex flex-col gap-4">
  <!-- #437: Filters + "Refresh all metadata" read as one visually
  distinct region (common-region/proximity), separate from the results
  table/pagination/map below. -->
  <div class={FILTER_CARD}>
    <details bind:open={filtersOpen}>
      <summary
        class="cursor-pointer text-sm font-medium text-slate-700 select-none dark:text-slate-300"
      >
        Filters
      </summary>
      <form
        class="mt-3 flex flex-wrap items-end gap-3"
        aria-label="Filter logged viewings"
        onsubmit={handleFilterSubmit}
      >
        <!-- #437: the everyday tier — From, To, Title, Medium, Venue —
        stays visible immediately once Filters is expanded. Everything
        else sits behind the nested "More filters" disclosure below,
        per the progressive-disclosure/filter-category-priority
        research cited on the issue. -->
        <label class={FIELD_WRAPPER} for="overview-from">
          <span class={LABEL}>From</span>
          <input class={INPUT} type="date" id="overview-from" bind:value={fromValue} />
        </label>
        <label class={FIELD_WRAPPER} for="overview-to">
          <span class={LABEL}>To</span>
          <input class={INPUT} type="date" id="overview-to" bind:value={toValue} />
        </label>
        <label class={FIELD_WRAPPER} for="overview-title">
          <span class={LABEL}>Title</span>
          <input
            class={INPUT}
            type="text"
            id="overview-title"
            placeholder="e.g. Dune"
            list="overview-title-choices"
            bind:value={titleValue}
            onfocus={handleFilterFieldFocus}
          />
          <datalist id="overview-title-choices">
            {#each titleOptions as title (title)}
              <option value={title}></option>
            {/each}
          </datalist>
        </label>
        <label class={FIELD_WRAPPER} for="overview-medium">
          <span class={LABEL}>Medium</span>
          <!-- #437: a closed set fully known at render time (the
          location-management picklist union loaded viewings) — a
          native select rather than free-text + datalist, which has a
          real reselect-without-clearing bug (#438) a select doesn't. -->
          <select class={INPUT} id="overview-medium" bind:value={mediumValue}>
            <option value="">Any</option>
            {#each mediumOptions as medium (medium)}
              <option value={medium}>{medium}</option>
            {/each}
          </select>
        </label>
        <label class={FIELD_WRAPPER} for="overview-venue">
          <span class={LABEL}>Venue</span>
          <input
            class={INPUT}
            type="text"
            id="overview-venue"
            placeholder="e.g. Grand Vista Cinema"
            list="overview-venue-choices"
            bind:value={venueValue}
            onfocus={handleFilterFieldFocus}
          />
          <datalist id="overview-venue-choices">
            {#each venueOptions as venue (venue)}
              <option value={venue}>{venueDisplay(venue, venueCities.get(venue))}</option>
            {/each}
          </datalist>
        </label>

        <details bind:open={moreFiltersOpen} class="w-full">
          <summary
            class="cursor-pointer text-sm font-medium text-slate-700 select-none dark:text-slate-300"
          >
            More filters
          </summary>
          <div class="mt-3 flex flex-wrap items-end gap-3">
            <label class={FIELD_WRAPPER} for="overview-director">
              <span class={LABEL}>Director</span>
              <input
                class={INPUT}
                type="text"
                id="overview-director"
                placeholder="e.g. Denis Villeneuve"
                list="overview-director-choices"
                bind:value={directorValue}
                onfocus={handleFilterFieldFocus}
              />
              <datalist id="overview-director-choices">
                {#each directorOptions as director (director)}
                  <option value={director}></option>
                {/each}
              </datalist>
            </label>
            <label class={FIELD_WRAPPER} for="overview-actor">
              <span class={LABEL}>Actor</span>
              <input
                class={INPUT}
                type="text"
                id="overview-actor"
                placeholder="e.g. Zendaya"
                list="overview-actor-choices"
                bind:value={actorValue}
                onfocus={handleFilterFieldFocus}
              />
              <datalist id="overview-actor-choices">
                {#each actorOptions as actor (actor)}
                  <option value={actor}></option>
                {/each}
              </datalist>
            </label>
            <label class={FIELD_WRAPPER} for="overview-genre">
              <span class={LABEL}>Genre</span>
              <input
                class={INPUT}
                type="text"
                id="overview-genre"
                placeholder="e.g. Drama"
                list="overview-genre-choices"
                bind:value={genreValue}
                onfocus={handleFilterFieldFocus}
              />
              <datalist id="overview-genre-choices">
                {#each genreOptions as genre (genre)}
                  <option value={genre}></option>
                {/each}
              </datalist>
            </label>
            <!-- #437: Country (the venue's own geocoded field, distinct
            from Movie Country below) removed entirely — two distinct
            real-world cities sharing a name in different countries is a
            negligible risk for a personal viewing log, so City now
            matches on city name alone. -->
            <label class={FIELD_WRAPPER} for="overview-city">
              <span class={LABEL}>City</span>
              <select class={INPUT} id="overview-city" bind:value={cityValue}>
                <option value="">Any</option>
                {#each cityOptions as city (city)}
                  <option value={city}>{city}</option>
                {/each}
              </select>
            </label>
            <label class={FIELD_WRAPPER} for="overview-movie-country">
              <span class={LABEL}>Movie country</span>
              <select class={INPUT} id="overview-movie-country" bind:value={movieCountryValue}>
                <option value="">Any</option>
                {#each movieCountryOptions as movieCountry (movieCountry)}
                  <option value={movieCountry}>{movieCountry}</option>
                {/each}
              </select>
            </label>
            <label class={FIELD_WRAPPER} for="overview-movie-language">
              <span class={LABEL}>Movie language</span>
              <select class={INPUT} id="overview-movie-language" bind:value={movieLanguageValue}>
                <option value="">Any</option>
                {#each movieLanguageOptions as movieLanguage (movieLanguage)}
                  <option value={movieLanguage}>{movieLanguage}</option>
                {/each}
              </select>
            </label>
            <label class={FIELD_WRAPPER} for="overview-rated">
              <span class={LABEL}>Rated</span>
              <select class={INPUT} id="overview-rated" bind:value={ratedValue}>
                <option value="">Any</option>
                {#each ratedOptions as rated (rated)}
                  <option value={rated}>{rated}</option>
                {/each}
              </select>
            </label>
            <!-- #437: Released Date (exact-day granularity) removed
            outright — too granular a filter to justify the field.
            Released Month keeps its native month picker; Released Year
            becomes a select, same bounded-set reasoning as the fields
            above. -->
            <label class={FIELD_WRAPPER} for="overview-released-year">
              <span class={LABEL}>Released year</span>
              <select class={INPUT} id="overview-released-year" bind:value={releasedYearValue}>
                <option value="">Any</option>
                {#each releasedYearOptions as year (year)}
                  <option value={year}>{year}</option>
                {/each}
              </select>
            </label>
            <label class={FIELD_WRAPPER} for="overview-released-month">
              <span class={LABEL}>Released month</span>
              <input
                class={INPUT}
                type="month"
                id="overview-released-month"
                bind:value={releasedMonthValue}
              />
            </label>
          </div>
        </details>

        <button type="submit" class={BUTTON_PRIMARY}>Filter</button>
        <button type="button" class={BUTTON_SECONDARY} onclick={handleClearFilter}>
          Clear filter
        </button>
      </form>
    </details>

    {#if showRefreshAll}
      <button
        type="button"
        class={BUTTON_SECONDARY}
        disabled={refreshingAll}
        aria-busy={refreshingAll}
        onclick={handleRefreshAll}
      >
        {#if refreshingAll}
          <svg
            class="mr-2 h-4 w-4 animate-spin"
            viewBox="0 0 20 20"
            fill="none"
            stroke="currentColor"
            stroke-width="1.5"
            aria-hidden="true"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              d="M15.5 4.5A7 7 0 1 0 17 10M17 10V5M17 10h-5"
            />
          </svg>
        {/if}
        Refresh all metadata
      </button>
      <p class={STATUS_TEXT}>
        Only touches titles missing metadata — the calendar entry is the source of truth once a
        title's matched.
      </p>
    {/if}
  </div>

  <p class={STATUS_TEXT} role="status">{statusText}</p>
  <p class={STATUS_TEXT} role="status">{actionStatusText}</p>
  {#if loadError}
    <ErrorToast message={loadError} onDismiss={() => (loadError = "")} />
  {/if}
  {#if actionError}
    <ErrorToast message={actionError} onDismiss={() => (actionError = "")} />
  {/if}
  <div bind:this={pickerArea}></div>

  {#if total > 0}
    <div class={TABLE_WRAP}>
      <table class={TABLE}>
        <thead class="bg-slate-50 dark:bg-slate-900/40">
          <tr>
            <!-- #93 dropped Medium and merged Start/End into one "When"
            column — both still true. #298 reversed #93's own removal
            of Edit/Delete from this table (directly requested), so
            "Actions" is back to Edit/Delete/Refresh together. #169:
            Title/When/Venue are sortable — Poster and Actions aren't
            real data columns to sort by. -->
            <th class={TH} scope="col">Poster</th>
            {#each SORTABLE_COLUMNS as [key, heading] (key)}
              <!-- #217: Venue is also shown under the title on narrow
              screens (see the Title cell below) — this column itself
              is hidden there rather than shown twice, one of several
              changes that keep the table's own required width under
              what a real phone viewport has to give it. -->
              <th class={key === "venue" ? `${TH} hidden sm:table-cell` : TH} scope="col">
                <button
                  type="button"
                  class="flex items-center gap-1 font-semibold"
                  onclick={() => handleSortClick(key)}
                >
                  {heading}
                  {#if sortKey === key}
                    <span aria-hidden="true">{sortDirection === "asc" ? "▲" : "▼"}</span>
                  {/if}
                </button>
              </th>
            {/each}
            <th class={TH} scope="col">Actions</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-200 dark:divide-slate-700">
          {#each currentPageItems as viewing (viewing.uid)}
            {@const links = [
              viewing.imdbId
                ? { label: 'IMDb', href: imdbUrl(viewing.imdbId), icon: IconImdb }
                : null,
              { label: 'RT', href: rottenTomatoesSearchUrl(viewing.title), icon: IconRottenTomatoes },
              { label: 'Letterboxd', href: letterboxdHref(viewing), icon: IconLetterboxd },
            ].filter((l) => l !== null)}
            {@const isRefreshing = refreshingUid === viewing.uid}
            {@const isDeleting = deletingUid === viewing.uid}
            {@const blockedTimeBar = computeBlockedTimeBar(viewing.start, viewing.end)}
            <tr class={TR_BODY} aria-busy={isRefreshing}>
              <td class={TD}>
                {#if viewing.posterUrl}
                  <!-- #64: a UX audit flagged the previous h-16 (64px)
                  thumbnail as too small to recognize a poster by — this
                  is double that at the sm breakpoint and up. #217: back
                  down near that original h-16 below sm — a real,
                  ordinary row's own table needed more width than a real
                  phone viewport could give it without its own
                  overflow-x-auto wrapper kicking in, and the poster was
                  the single biggest fixed contributor. #76: an explicit
                  fixed width plus max-w-none — w-auto or aspect-* alone
                  still leave the image's effective width capped by
                  Tailwind Preflight's `img { max-width: 100% }` against
                  whatever the table's own column layout assigns. #133:
                  wrapped in the same details-page link the title uses —
                  the image's own alt text ("<title> poster") gives this
                  link a distinct accessible name from the title link
                  right next to it. -->
                  <a href={`/movie?uid=${encodeURIComponent(viewing.uid)}`}>
                    <img
                      src={viewing.posterUrl}
                      alt={`${viewing.title} poster`}
                      class="h-24 w-16 max-w-none rounded object-cover shadow-sm sm:h-40 sm:w-24"
                      loading="lazy"
                    />
                  </a>
                {:else}
                  <!-- #236: same slot/size a real poster would occupy,
                  so a movie OMDb had no poster for doesn't leave a gap. -->
                  <a href={`/movie?uid=${encodeURIComponent(viewing.uid)}`}>
                    <PosterPlaceholder class="h-24 w-16 rounded shadow-sm sm:h-40 sm:w-24" />
                  </a>
                {/if}
              </td>
              <td class={TD}>
                <!-- #38: the details page — a query-string ?uid=, not a
                dynamic /movie/[uid] route, since this build is fully
                static (no getStaticPaths could ever know a visitor's
                own private CalDAV UIDs at build time). -->
                <a
                  href={`/movie?uid=${encodeURIComponent(viewing.uid)}`}
                  class="font-medium text-indigo-600 hover:underline dark:text-indigo-400"
                >
                  {viewing.year ? `${viewing.title} (${viewing.year})` : viewing.title}
                </a>
                {#if viewing.venue}
                  <!-- #217: the Venue column itself is hidden below sm
                  (see the header row above) — shown here instead, so
                  the information stays reachable rather than dropped,
                  just relocated under the title the same way the
                  cross-link icons already are. #440: trimmed to name +
                  known city, same as the Venue column itself. -->
                  <p class="text-xs text-slate-500 sm:hidden dark:text-slate-400">
                    {venueDisplay(viewing.venue, viewing.city)}
                  </p>
                {/if}
                {#if links.length > 0}
                  <div class="mt-1 flex gap-2">
                    {#each links as link (link.label)}
                      {@const Icon = link.icon}
                      <!-- #193: the brand mark stands in for the label
                      visually, but the link's accessible name stays the
                      plain text (via sr-only, not the icon's own decorative
                      title) — nothing here depends on being able to see
                      or recognize a logo. -->
                      <a
                        href={link.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        title={link.label}
                        class="text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300"
                      >
                        <Icon class="h-4 w-4" />
                        <span class="sr-only">{link.label}</span>
                      </a>
                    {/each}
                  </div>
                {/if}
              </td>
              <!-- #93: Medium dropped, and Start/End merged into one
              "When" cell — director/actors/genre/ratings already live
              on the details page (#38, one click away via the title
              link) rather than as their own columns here; keeping this
              table to a fixed, narrow column count is what lets it fit
              a phone screen without horizontal scroll. -->
              <td class={TD}>
                {formatPeriod(viewing.start, viewing.end)}
                <!-- #305: same purely-decorative 24-hour bar the details
                page already shows under Start/End — the text above it
                is already the real, complete accessible description of
                the timing, so this carries nothing a screen reader
                needs to hear a second time. #444: hidden entirely (not
                just zero-width) when the viewing has no meaningful
                duration — there's nothing to visualize. -->
                {#if blockedTimeBar.widthPercent > 0}
                  <div
                    class="relative mt-1 h-1.5 w-full max-w-32 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700"
                    aria-hidden="true"
                  >
                    <div
                      class="absolute inset-y-0 rounded-full bg-indigo-500 dark:bg-indigo-400"
                      style={`left: ${blockedTimeBar.positionPercent}%; width: ${blockedTimeBar.widthPercent}%;`}
                    ></div>
                  </div>
                {/if}
              </td>
              <td class={`${TD} hidden sm:table-cell`}>
                <!-- #440: trimmed to name + known city — the sort key
                below and the filter/link elsewhere on this page still
                use the full raw venue value untouched. -->
                <span class="inline-flex items-center gap-1">
                  {venueDisplay(viewing.venue, viewing.city)}
                  {#if viewing.geo}
                    <!-- #268: a lightweight location cue right on the
                    row, rather than a full map per row (heavy on a
                    dense, paginated table) — links to this viewing's
                    own details page, which already has the real map
                    (#8/#203). -->
                    <a
                      href={`/movie?uid=${encodeURIComponent(viewing.uid)}`}
                      class="inline-flex text-slate-400 hover:text-indigo-600 dark:text-slate-500 dark:hover:text-indigo-400"
                      title="View on map"
                      aria-label={`View ${viewing.title} on the map`}
                    >
                      <svg class="h-4 w-4" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                        <path
                          d="M12.5 8.75a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0Z"
                          stroke="currentColor"
                          stroke-width="1.5"
                        />
                        <path
                          d="M16.25 8.75c0 5.95-6.25 9.375-6.25 9.375S3.75 14.7 3.75 8.75a6.25 6.25 0 1 1 12.5 0Z"
                          stroke="currentColor"
                          stroke-width="1.5"
                          stroke-linecap="round"
                          stroke-linejoin="round"
                        />
                      </svg>
                    </a>
                  {/if}
                </span>
              </td>
              <!-- #298: Edit links to the details page's own edit form
              (?edit=1, read there on load) rather than duplicating that
              whole form inline here. Delete acts inline — a single
              irreversible action, the same confirm() prompt the
              details page already uses. Refresh stays icon-only, empty
              when it isn't offered (#37: only once an OMDb key is
              active — #89's "skip already matched" rule is deliberately
              scoped to bulk refresh only, not this single-row control,
              which stays the way to correct a title whose match went
              stale or wrong). -->
              <td class={TD}>
                <div class="flex gap-1">
                  <a
                    href={`/movie?uid=${encodeURIComponent(viewing.uid)}&edit=1`}
                    class="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-300 bg-white text-slate-600 shadow-sm hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-1 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                    title="Edit"
                    aria-label={`Edit ${viewing.title}`}
                  >
                    <svg class="h-4 w-4" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                      <path
                        d="M13.5 3.5a1.5 1.5 0 0 1 2.12 0l.88.88a1.5 1.5 0 0 1 0 2.12L7.5 15.5l-3.5 1 1-3.5 8.5-8.5Z"
                        stroke="currentColor"
                        stroke-width="1.5"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                      />
                    </svg>
                  </a>
                  <button
                    type="button"
                    class="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-300 bg-white text-slate-600 shadow-sm hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-1 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                    title="Delete"
                    aria-label={`Delete ${viewing.title}`}
                    disabled={isDeleting}
                    aria-busy={isDeleting}
                    onclick={() => handleDelete(viewing)}
                  >
                    <svg class="h-4 w-4" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                      <path
                        d="M4.5 5.5h11m-9 0V4a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v1.5m-6.5 0 .6 9.4a1 1 0 0 0 1 .6h5.8a1 1 0 0 0 1-.6l.6-9.4"
                        stroke="currentColor"
                        stroke-width="1.5"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                      />
                    </svg>
                  </button>
                </div>
                {#if omdbActive}
                  <button
                    type="button"
                    class="mt-1 inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-300 bg-white text-slate-600 shadow-sm hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-1 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                    title="Refresh metadata"
                    aria-label="Refresh metadata"
                    disabled={isRefreshing}
                    aria-busy={isRefreshing}
                    onclick={() => handleRefresh(viewing)}
                  >
                    {#if isRefreshing}
                      <svg
                        class="h-4 w-4 animate-spin"
                        viewBox="0 0 20 20"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="1.5"
                        aria-hidden="true"
                      >
                        <path
                          stroke-linecap="round"
                          stroke-linejoin="round"
                          d="M12 4v2m0 8v2m8-6h-2M6 10H4m11.3-5.3-1.4 1.4M8.1 13.9l-1.4 1.4m9.6 0-1.4-1.4M8.1 6.1 6.7 4.7"
                        />
                      </svg>
                    {:else}
                      <svg
                        class="h-4 w-4"
                        viewBox="0 0 20 20"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="1.5"
                        aria-hidden="true"
                      >
                        <path
                          stroke-linecap="round"
                          stroke-linejoin="round"
                          d="M15.5 4.5A7 7 0 1 0 17 10M17 10V5M17 10h-5"
                        />
                      </svg>
                    {/if}
                  </button>
                {/if}
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>

    <!-- #435: the total's own persistent home — near the page-size
    selector because that selector, unlike the pagination block below,
    already renders unconditionally once there's at least one result,
    regardless of page count. Deliberately not statusText: that slot
    is transient ("Loading…", then cleared) and used to also carry the
    count, which meant a reload briefly clobbered it. -->
    <p class={STATUS_TEXT}>{total} logged viewing{total === 1 ? "" : "s"}.</p>

    <!-- #300: a visitor's own choice of how many rows a page holds —
    always offered once there's at least one result, not just once
    there's a second page, since raising it is exactly how a visitor
    with more than one page gets back down to one. -->
    <div class="mt-2 flex items-center justify-end gap-2">
      <label
        class="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400"
        for="overview-page-size"
      >
        Results per page
        <select
          id="overview-page-size"
          class={INPUT}
          value={pageSize}
          onchange={handlePageSizeChange}
        >
          {#each PAGE_SIZE_OPTIONS as option (option)}
            <option value={option}>{option}</option>
          {/each}
        </select>
      </label>
    </div>

    <!-- #59: only rendered once there's a second page to reach — a
    single page needs no "Page 1 of 1" chrome. #300: First/Last and
    clickable page numbers alongside Previous/Next, Google-search-
    results style, for a jump straight to a specific page. -->
    {#if pages > 1}
      <div class="mt-2 flex flex-wrap items-center justify-center gap-2" aria-label="Pagination">
        <button
          type="button"
          class={BUTTON_SM}
          disabled={currentPage === 0}
          onclick={() => (currentPage = 0)}
        >
          First
        </button>
        <button
          type="button"
          class={BUTTON_SM}
          disabled={currentPage === 0}
          onclick={() => (currentPage -= 1)}
        >
          Previous page
        </button>
        {#each pageNumbers as pageNumber, i (i)}
          {#if pageNumber === "…"}
            <span aria-hidden="true" class="px-1 text-slate-400 dark:text-slate-500">…</span>
          {:else}
            <button
              type="button"
              class={pageNumber === currentPage + 1
                ? "inline-flex h-8 w-8 items-center justify-center rounded-md bg-indigo-600 text-sm font-medium text-white"
                : "inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-300 text-sm text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700"}
              aria-current={pageNumber === currentPage + 1 ? "page" : undefined}
              aria-label={`Go to page ${pageNumber}`}
              onclick={() => (currentPage = pageNumber - 1)}
            >
              {pageNumber}
            </button>
          {/if}
        {/each}
        <button
          type="button"
          class={BUTTON_SM}
          disabled={currentPage >= pages - 1}
          onclick={() => (currentPage += 1)}
        >
          Next page
        </button>
        <button
          type="button"
          class={BUTTON_SM}
          disabled={currentPage >= pages - 1}
          onclick={() => (currentPage = pages - 1)}
        >
          Last
        </button>
        <span class={STATUS_TEXT}>Page {currentPage + 1} of {pages}</span>
      </div>
    {/if}
  {/if}

  {#if mapPins.length > 0}
    <!-- #351/#437: every currently-filtered viewing with known
    coordinates — same "no map, not a broken one" rule /map and Venues
    already follow for a filter that matches nothing located. Reuses
    VenueMap directly rather than re-querying CalDAV the way the
    standalone /map page does, so this always matches whatever's
    actually filtered here. Rendered after the table/pagination (in
    source order, not just visually) so the primary list is reachable
    without scrolling past — or tabbing past, for a keyboard-only
    visitor — a secondary visualization. -->
    <div class="mb-4">
      <h2 class="mb-2 text-sm font-semibold text-slate-700 dark:text-slate-300">Map</h2>
      <VenueMap pins={mapPins} />
    </div>
  {/if}
</div>
