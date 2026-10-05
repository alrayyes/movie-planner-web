import { purgeLocalCache } from "../lib/cache/purge";
import { BUTTON_SECONDARY, STATUS_TEXT } from "../lib/ui/classes";

// #765: for a device that shows stale or missing viewings. Clears this
// browser's local copy of the server's data and nothing else (see
// lib/cache/purge.ts for what that is and what it leaves). Sits in Settings'
// Data section beside the export, since it's the same kind of control: a
// low-frequency data tool, not something to put in every page's chrome.
export class PurgeCacheButton extends HTMLElement {
  connectedCallback() {
    // No `role="status"` until there's a message, for the same reason the
    // export button's own waits: an always-present empty status region makes
    // `getByRole("status")` ambiguous for anything else on the page.
    const status = document.createElement("span");
    status.className = STATUS_TEXT;

    const button = document.createElement("button");
    button.type = "button";
    button.className = BUTTON_SECONDARY;
    button.textContent = "Clear local cache";
    button.addEventListener("click", async () => {
      if (
        !window.confirm(
          "Clear this browser's local copy of your viewings? They'll load again from your calendar.",
        )
      ) {
        return;
      }
      status.setAttribute("role", "status");
      status.textContent = "Clearing…";
      button.disabled = true;
      try {
        await purgeLocalCache();
        status.textContent =
          "Local cache cleared. Your viewings load fresh from your calendar from now on.";
      } catch (error) {
        status.textContent = error instanceof Error ? error.message : "Failed to clear the cache.";
      } finally {
        button.disabled = false;
      }
    });

    const explanation = document.createElement("p");
    explanation.className = STATUS_TEXT;
    explanation.textContent =
      "Use this if a device shows old or missing viewings and another doesn't. It clears the copy of your viewings and the pages this browser keeps for speed. Your sign-in, your activity log and your calendar itself are not touched.";

    const wrapper = document.createElement("div");
    wrapper.className = "mb-6 flex flex-col gap-2";
    const row = document.createElement("div");
    row.className = "flex flex-wrap items-center gap-3";
    row.appendChild(button);
    row.appendChild(status);
    wrapper.appendChild(row);
    wrapper.appendChild(explanation);
    this.replaceChildren(wrapper);
  }
}

customElements.define("purge-cache-button", PurgeCacheButton);
