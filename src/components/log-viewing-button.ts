import { CREDENTIALS_CONNECTED_EVENT, getCredentialsStore } from "../lib/credentials/store";
import { OPEN_LOG_VIEWING_WIZARD_EVENT } from "../lib/movie-log/log-viewing";
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
// #603: a real <button>, not an <a href="/log"> — clicking it now opens
// LogViewingWizard.svelte's own <dialog> in place (via
// OPEN_LOG_VIEWING_WIZARD_EVENT) rather than navigating to a page, so a
// <button> is the correct semantic element now, not just the design's
// name for it. /log itself is unaffected and still reachable directly,
// for the Pathé-booking-email flow this wizard doesn't cover.
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

    const button = document.createElement("button");
    button.type = "button";
    button.className = BUTTON_PRIMARY;
    button.textContent = "Log a viewing";
    button.addEventListener("click", () => {
      window.dispatchEvent(new CustomEvent(OPEN_LOG_VIEWING_WIZARD_EVENT));
    });
    this.replaceChildren(button);
  }
}

customElements.define("log-viewing-button", LogViewingButton);
