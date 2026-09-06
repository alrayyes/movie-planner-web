import { CREDENTIALS_CONNECTED_EVENT, getCredentialsStore } from "../lib/credentials/store";
import { NAV, NAV_LINK } from "../lib/ui/classes";

// #161: Viewings first — it's the overview a visitor lands on after
// connecting, and the nav previously gave it no link at all once a
// visitor had navigated away (only the "Movie Planner" brand link did,
// with no indication that's what it led back to).
const LINKS: [string, string][] = [
  ["/", "Viewings"],
  ["/venues", "Venues"],
  ["/calendar", "Calendar"],
  // #8/#203: placed with the other read-only views.
  ["/map", "Map"],
  ["/log", "Log a viewing"],
  ["/import", "Import"],
  ["/settings", "Settings"],
];

// #127: mounted once in Layout.astro rather than built inside
// credentials-gate.ts's own renderConnected() (the old home — moved
// here, not duplicated) — that only ever rendered on the home page, so
// every other page (log/import/venues/settings/movie/privacy/
// disclaimer) had no way to reach any other page except by editing the
// URL or using the browser's own back button.
export class SiteNav extends HTMLElement {
  private readonly handleConnected = () => void this.render();

  connectedCallback() {
    void this.render();
    // The initial check above runs once, at page load — before a
    // first-time visitor still on the credentials form has connected.
    // credentials-gate.ts fires this the moment it saves credentials,
    // so the nav appears immediately rather than only after the next
    // full page load.
    window.addEventListener(CREDENTIALS_CONNECTED_EVENT, this.handleConnected);
  }

  disconnectedCallback() {
    window.removeEventListener(CREDENTIALS_CONNECTED_EVENT, this.handleConnected);
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

    const nav = document.createElement("nav");
    nav.className = NAV;
    for (const [href, text] of LINKS) {
      const a = document.createElement("a");
      a.className = NAV_LINK;
      a.href = href;
      a.textContent = text;
      nav.appendChild(a);
    }
    this.replaceChildren(nav);
  }
}

customElements.define("site-nav", SiteNav);
