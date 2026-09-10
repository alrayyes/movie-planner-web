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
    this.render(path === "/" ? activeFilterLabelFromUrl() : null);
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
    const label =
      pageLabel && liveFilterLabel
        ? `${pageLabel} / ${liveFilterLabel}`
        : (liveFilterLabel ?? pageLabel);
    if (!label) {
      this.replaceChildren();
      return;
    }

    const nav = document.createElement("nav");
    nav.setAttribute("aria-label", "Breadcrumb");
    const ol = document.createElement("ol");
    ol.className = BREADCRUMB_LIST;

    const homeItem = document.createElement("li");
    const homeLink = document.createElement("a");
    homeLink.href = "/";
    homeLink.className = BREADCRUMB_LINK;
    homeLink.textContent = "Home";
    homeItem.appendChild(homeLink);
    ol.appendChild(homeItem);

    const separator = document.createElement("li");
    separator.setAttribute("aria-hidden", "true");
    separator.className = BREADCRUMB_SEPARATOR;
    separator.textContent = "/";
    ol.appendChild(separator);

    const currentItem = document.createElement("li");
    currentItem.setAttribute("aria-current", "page");
    currentItem.className = BREADCRUMB_CURRENT;
    currentItem.textContent = label;
    ol.appendChild(currentItem);

    nav.appendChild(ol);
    this.replaceChildren(nav);
  }
}

customElements.define("site-breadcrumb", SiteBreadcrumb);
