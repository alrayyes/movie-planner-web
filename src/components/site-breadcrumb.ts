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
const PAGE_NAMES: Record<string, string> = {
  "/venues": "Venues",
  "/calendar": "Calendar",
  "/map": "Map",
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

  private render(liveFilterLabel: string | null) {
    const path = normalizePath(window.location.pathname);
    const label = path === "/" ? liveFilterLabel : PAGE_NAMES[path];
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
