import { ATTRIBUTES } from "../lib/attribute/attributes";
import {
  ACTIVE_FILTER_LABEL_EVENT,
  type ActiveFilterValues,
  activeFilterLabel,
  FILTER_KEYS,
} from "../lib/ui/active-filter";
import {
  BREADCRUMB_CURRENT,
  BREADCRUMB_LINK,
  BREADCRUMB_LIST,
  BREADCRUMB_SEPARATOR,
} from "../lib/ui/classes";

// #375: every page except "/" itself (the connect gate lives there, and
// an unfiltered "/" is already the root — a single "Home" crumb linking
// to itself carries nothing worth showing) gets a fixed "Home / <name>"
// trail. "/" gets one too, but only once a chip-driven filter (#374) is
// active — see activeFilterLabelFor below.
// #375: the static build serves each page as its own directory
// (/venues/index.html), so the browser's resolved pathname carries a
// trailing slash ("/venues/") even though every internal link in this
// app is written without one — normalizePath (below) is what makes
// this table match either form.
// #448: "/venue" deliberately shares the "Venues" label with "/venues"
// itself — see render() below, which appends a live label (broadcast
// over ACTIVE_FILTER_LABEL_EVENT) onto this base label rather than
// this table growing a second, per-venue-specific entry of its own.
const PAGE_NAMES: Record<string, string> = {
  "/venues": "Venues",
  "/venue": "Venues",
  "/calendar": "Calendar",
  "/log": "Log a viewing",
  "/import": "Import",
  "/activity": "Activity",
  "/settings": "Settings",
  "/movie": "Movie details",
  "/changelog": "Changelog",
  "/privacy": "Privacy",
  "/disclaimer": "Disclaimer",
  "/about": "About",
  "/shared": "Shared viewing",
};

// #450: director/actor/genre/movie-country/movie-language each get the
// same "listing and detail page share one label" shape "/venue" already
// has with "/venues" above — filled in from lib/attribute/attributes.ts's
// own config table rather than five more hand-typed pairs here, so a
// sixth attribute (were one ever added) wouldn't need a matching edit in
// two places.
for (const config of Object.values(ATTRIBUTES)) {
  PAGE_NAMES[config.listingPath] = config.plural;
  PAGE_NAMES[config.detailPath] = config.plural;
}

// #534: a detail page's own middle crumb is a real link back to its
// listing page ("Home / Venues / De Munt", "Venues" clickable), keyed
// by the *detail* path only — a listing page itself never has a live
// filter label to combine with, so it never reaches the branch below
// that reads this map.
const LISTING_HREFS: Record<string, string> = { "/venue": "/venues" };
for (const config of Object.values(ATTRIBUTES)) {
  LISTING_HREFS[config.detailPath] = config.listingPath;
}

// #534/#543: a detail page's own value lives right in its URL (the same
// query param VenueOverview.svelte/AttributeDetail.svelte themselves
// read on mount) — this is what lets handleNavigate render the correct
// middle+current crumb *synchronously*, on first paint, rather than
// starting from nothing and waiting on that island's own
// ACTIVE_FILTER_LABEL_EVENT broadcast. Without this, a detail page's
// breadcrumb depended entirely on winning a race against
// astro:page-load's own render — genuinely non-deterministic (confirmed
// live: reproducibly missing the middle link on some runs, present on
// others, same test, same data, no code path difference except timing)
// since nothing orders "the island's effect has broadcast" ahead of
// "the next astro:page-load fires" the other way. The broadcast event
// still exists and still matters for venue specifically — this URL
// value is the *raw* venue string, whereas the trimmed name + city the
// breadcrumb ultimately wants only exists once CalDAV data has loaded.
const DETAIL_PARAM_NAMES: Record<string, string> = { "/venue": "venue" };
for (const config of Object.values(ATTRIBUTES)) {
  DETAIL_PARAM_NAMES[config.detailPath] = config.paramName;
}

function detailPageValueFromUrl(path: string): string | null {
  const paramName = DETAIL_PARAM_NAMES[path];
  if (!paramName) return null;
  return new URLSearchParams(window.location.search).get(paramName);
}

function normalizePath(pathname: string): string {
  return pathname !== "/" && pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
}

// Reads whatever recognized filter params are on the URL right now —
// used only for the very first render, before CalendarOverview.svelte's
// own island has mounted and broadcast a live value over
// ACTIVE_FILTER_LABEL_EVENT. Kept in sync with the same URL a chip link
// itself always carries, so there's no flash of a missing breadcrumb on
// first paint.
function activeFilterLabelFromUrl(): string | null {
  const params = new URLSearchParams(window.location.search);
  const values: ActiveFilterValues = {};
  for (const key of FILTER_KEYS) {
    const value = params.get(key);
    if (value) values[key] = value;
  }
  return activeFilterLabel(values);
}

export class SiteBreadcrumb extends HTMLElement {
  private readonly handleFilterLabel = (event: Event) => {
    this.render((event as CustomEvent<string | null>).detail);
  };
  // #375: Astro's View Transitions morph the DOM rather than replacing
  // it wholesale — this element itself survives a soft navigation
  // (confirmed live: connectedCallback alone left the breadcrumb frozen
  // on whatever page it first rendered for), so its own trail needs an
  // explicit re-render on every navigation, not just its first mount.
  // astro:page-load fires after both the very first load and every
  // subsequent soft navigation, so this alone covers first paint too —
  // no separate connectedCallback-time render needed.
  private readonly handleNavigate = () => {
    const path = normalizePath(window.location.pathname);
    if (path === "/") {
      this.render(activeFilterLabelFromUrl());
      return;
    }
    this.render(detailPageValueFromUrl(path));
  };

  connectedCallback() {
    document.addEventListener("astro:page-load", this.handleNavigate);
    window.addEventListener(ACTIVE_FILTER_LABEL_EVENT, this.handleFilterLabel);
  }

  disconnectedCallback() {
    document.removeEventListener("astro:page-load", this.handleNavigate);
    window.removeEventListener(ACTIVE_FILTER_LABEL_EVENT, this.handleFilterLabel);
  }

  // #448: a live label (broadcast over ACTIVE_FILTER_LABEL_EVENT) is
  // appended onto this page's own static PAGE_NAMES label when both
  // exist — "/venue" reads "Venues / <trimmed venue name>" this way,
  // without this table or this method growing any per-venue awareness
  // of its own. "/" has no PAGE_NAMES entry at all, so there the live
  // label stands alone (or is absent entirely, same as before this
  // existed) — unchanged from the original chip-driven-filter
  // behaviour (#374/#375/#376).
  private render(liveFilterLabel: string | null) {
    const path = normalizePath(window.location.pathname);
    const pageLabel = PAGE_NAMES[path];
    const listingHref = LISTING_HREFS[path];
    // #534: a detail page (pageLabel + liveFilterLabel both present, and
    // this path has a listing page distinct from itself) gets a real
    // three-level trail — "/" filtered by a chip-driven query param has
    // liveFilterLabel with no pageLabel at all, so it never reaches this
    // branch and keeps its own plain two-item "Home / <label>" shape.
    const middleLabel = pageLabel && liveFilterLabel ? pageLabel : null;
    const currentLabel = middleLabel ? liveFilterLabel : (liveFilterLabel ?? pageLabel);
    if (!currentLabel) {
      this.replaceChildren();
      return;
    }

    const nav = document.createElement("nav");
    nav.setAttribute("aria-label", "Breadcrumb");
    const ol = document.createElement("ol");
    ol.className = BREADCRUMB_LIST;

    const appendSeparator = () => {
      const separator = document.createElement("li");
      separator.setAttribute("aria-hidden", "true");
      separator.className = BREADCRUMB_SEPARATOR;
      separator.textContent = "/";
      ol.appendChild(separator);
    };

    const homeItem = document.createElement("li");
    const homeLink = document.createElement("a");
    homeLink.href = "/";
    homeLink.className = BREADCRUMB_LINK;
    homeLink.textContent = "Home";
    homeItem.appendChild(homeLink);
    ol.appendChild(homeItem);
    appendSeparator();

    if (middleLabel) {
      const middleItem = document.createElement("li");
      if (listingHref) {
        const middleLink = document.createElement("a");
        middleLink.href = listingHref;
        middleLink.className = BREADCRUMB_LINK;
        middleLink.textContent = middleLabel;
        middleItem.appendChild(middleLink);
      } else {
        middleItem.textContent = middleLabel;
      }
      ol.appendChild(middleItem);
      appendSeparator();
    }

    const currentItem = document.createElement("li");
    currentItem.setAttribute("aria-current", "page");
    currentItem.className = BREADCRUMB_CURRENT;
    currentItem.textContent = currentLabel;
    ol.appendChild(currentItem);

    nav.appendChild(ol);
    this.replaceChildren(nav);
  }
}

customElements.define("site-breadcrumb", SiteBreadcrumb);
