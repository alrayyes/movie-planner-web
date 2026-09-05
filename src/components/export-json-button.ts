import { listViewings } from "../lib/caldav/client";
import type { CaldavConfig } from "../lib/caldav/types";
import { CREDENTIALS_CONNECTED_EVENT, getCredentialsStore } from "../lib/credentials/store";
import { exportFilename, exportViewingsToJson } from "../lib/movie-log/export-viewings";
import { importCheckRange } from "../lib/movie-log/run-import";
import { BUTTON_SECONDARY, STATUS_TEXT } from "../lib/ui/classes";

// #174: previously lived only on the overview itself (CalendarOverview.svelte),
// so exporting from any other page meant navigating to "/" first. Mounted
// once in Layout.astro, same pattern as site-nav.ts — reads the visitor's
// own stored credentials directly rather than depending on a prop only the
// overview island received.
export class ExportJsonButton extends HTMLElement {
  private readonly handleConnected = () => void this.render();

  connectedCallback() {
    void this.render();
    window.addEventListener(CREDENTIALS_CONNECTED_EVENT, this.handleConnected);
  }

  disconnectedCallback() {
    window.removeEventListener(CREDENTIALS_CONNECTED_EVENT, this.handleConnected);
  }

  private async render() {
    const credentials = await getCredentialsStore().get();
    if (!credentials) {
      this.replaceChildren();
      return;
    }
    const config: CaldavConfig = {
      baseUrl: credentials.caldavUrl,
      username: credentials.caldavUsername,
      password: credentials.caldavPassword,
    };

    // #174: no `role="status"` until there's actually a message — this
    // element is mounted on every connected page, unlike every other
    // status region in this app (each scoped to its own page's own
    // island), so an always-present empty one made `getByRole("status")`
    // ambiguous everywhere else in the app, not just here.
    const status = document.createElement("span");
    status.className = STATUS_TEXT;

    const button = document.createElement("button");
    button.type = "button";
    button.className = BUTTON_SECONDARY;
    button.textContent = "Export as JSON";
    // #69: the whole history, not whatever's currently filtered/shown —
    // the calendar is the source of truth, so "export" means everything,
    // the same wide range bulk-import's own duplicate check already
    // queries.
    button.addEventListener("click", async () => {
      status.setAttribute("role", "status");
      status.textContent = "Preparing export…";
      try {
        const all = await listViewings(config, importCheckRange());
        const blob = new Blob([exportViewingsToJson(all)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = exportFilename(new Date());
        link.click();
        URL.revokeObjectURL(url);
        status.textContent = `Exported ${all.length} viewing${all.length === 1 ? "" : "s"}.`;
      } catch (error) {
        status.textContent = error instanceof Error ? error.message : "Failed to export.";
      }
    });

    const explanation = document.createElement("p");
    explanation.className = STATUS_TEXT;
    explanation.textContent =
      "Downloads your whole watch history, including poster, ratings and every other OMDb-derived field — not just what's filtered or shown on the current page.";

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

customElements.define("export-json-button", ExportJsonButton);
