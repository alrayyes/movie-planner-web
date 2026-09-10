import { CREDENTIALS_CONNECTED_EVENT, getCredentialsStore } from "../lib/credentials/store";
import { NAV, NAV_LINK } from "../lib/ui/classes";

// #161: Viewings first — it's the overview a visitor lands on after
// connecting, and the nav previously gave it no link at all once a
// visitor had navigated away (only the "Movie Planner" brand link did,
// with no indication that's what it led back to).
//
// #436: reduced to browsing destinations only. "Log a viewing" is now
// a persistent header button (<log-viewing-button>, mounted in
// Layout.astro alongside the theme toggle) rather than a nav-list
// item — it's the app's primary create action, not a page to browse
// to. Import and Activity are both inherently low-frequency (an
// occasional bulk operation, and a debugging aid respectively — see
// their own doc pages) and are reached from the Settings hub instead.
// This keeps the nav to 5 entries, fitting one row at real mobile
// widths instead of wrapping to two.
//
// #449: Map removed entirely — its one-pin-per-viewing whole-history
// view added no insight once the Venues page's own maps (one pin per
// venue, deduped, grouped by city) and the per-venue page's map exist,
// on top of the movie details page's own per-venue map. Down to 4
// entries.
const LINKS: [string, string][] = [
  ["/", "Viewings"],
  ["/venues", "Venues"],
  ["/calendar", "Calendar"],
  ["/settings", "Settings"],
];

// #127: mounted once in Layout.astro rather than built inside
// credentials-gate.ts's own renderConnected() (the old home — moved
// here, not duplicated) — that only ever rendered on the home page, so
// every other page (log/import/venues/settings/movie/privacy/
// disclaimer) had no way to reach any other page except by editing the
// URL or using the browser's own back button.
// #375: the static build serves each page as its own directory
// (/venues/index.html), so the resolved pathname carries a trailing
// slash ("/venues/") even though every link here is written without
// one — same normalization site-breadcrumb.ts already needs for the
// same reason.
function normalizePath(pathname: string): string {
  return pathname !== "/" && pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
}

export class SiteNav extends HTMLElement {
  private readonly handleConnected = () => void this.render();
  // #555: Astro's View Transitions keep this custom element's instance
  // alive across a soft, in-app navigation rather than remounting it
  // (confirmed live by site-breadcrumb.ts's own identical need) — so
  // which link is "current" has to be re-evaluated on every navigation,
  // not just the initial connect-triggered render.
  private readonly handleNavigate = () => void this.render();

  connectedCallback() {
    void this.render();
    // The initial check above runs once, at page load — before a
    // first-time visitor still on the credentials form has connected.
    // credentials-gate.ts fires this the moment it saves credentials,
    // so the nav appears immediately rather than only after the next
    // full page load.
    window.addEventListener(CREDENTIALS_CONNECTED_EVENT, this.handleConnected);
    document.addEventListener("astro:page-load", this.handleNavigate);
  }

  disconnectedCallback() {
    window.removeEventListener(CREDENTIALS_CONNECTED_EVENT, this.handleConnected);
    document.removeEventListener("astro:page-load", this.handleNavigate);
  }

  private async render() {
    const credentials = await getCredentialsStore().get();
    // Nothing meaningful to link to before a visitor has connected —
    // every one of these pages either requires credentials itself or,
    // for a page that doesn't (privacy/disclaimer), still has nowhere
    // useful for the links to lead yet.
    if (!credentials) {
      this.replaceChildren();
      return;
    }

    const currentPath = normalizePath(window.location.pathname);
    const nav = document.createElement("nav");
    nav.className = NAV;
    for (const [href, text] of LINKS) {
      const a = document.createElement("a");
      const isCurrent = href === currentPath;
      a.className = isCurrent ? `${NAV_LINK} underline underline-offset-4` : NAV_LINK;
      a.href = href;
      a.textContent = text;
      if (isCurrent) a.setAttribute("aria-current", "page");
      nav.appendChild(a);
    }
    this.replaceChildren(nav);
  }
}

customElements.define("site-nav", SiteNav);
