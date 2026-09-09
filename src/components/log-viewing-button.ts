import { CREDENTIALS_CONNECTED_EVENT, getCredentialsStore } from "../lib/credentials/store";
import { BUTTON_PRIMARY } from "../lib/ui/classes";

// #436: the app's primary "create" action, promoted from a nav-list item
// to a persistent header button — mounted once in Layout.astro's
// header-actions group, alongside keyboard-nav/theme-toggle, so it's
// reachable from every page rather than only from the nav's own list
// (logging while browsing Venues/Calendar/Map is a real flow this app
// exists to support). Styled with BUTTON_PRIMARY, not NAV_LINK, to read
// as a distinct call-to-action rather than one more browsing
// destination — same split site-nav.ts's own links no longer carry.
//
// Still a plain <a href="/log">, not a real <button>: it navigates to a
// page rather than performing an in-place action, so an anchor is the
// correct semantic element even though the design calls it a "button".
export class LogViewingButton extends HTMLElement {
  private readonly handleConnected = () => void this.render();

  connectedCallback() {
    void this.render();
    // Mirrors site-nav.ts: credentials-gate.ts fires this the moment a
    // visitor first connects, so the button appears immediately rather
    // than only after the next full page load.
    window.addEventListener(CREDENTIALS_CONNECTED_EVENT, this.handleConnected);
  }

  disconnectedCallback() {
    window.removeEventListener(CREDENTIALS_CONNECTED_EVENT, this.handleConnected);
  }

  private async render() {
    const credentials = await getCredentialsStore().get();
    // Nothing to log yet without a connected calendar to log it into.
    if (!credentials) {
      this.replaceChildren();
      return;
    }

    const link = document.createElement("a");
    link.href = "/log";
    link.className = BUTTON_PRIMARY;
    link.textContent = "Log a viewing";
    this.replaceChildren(link);
  }
}

customElements.define("log-viewing-button", LogViewingButton);
