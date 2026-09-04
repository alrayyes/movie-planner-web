import { getPicklists, updatePicklists } from "../lib/caldav/client";
import type { CaldavConfig, Picklists } from "../lib/caldav/types";
import { getCredentialsStore } from "../lib/credentials/store";
import type { Credentials } from "../lib/credentials/types";
import { logManualViewing, logPatheBooking } from "../lib/movie-log/log-viewing";
import { type PatheBooking, parsePatheEmail } from "../lib/movie-log/pathe-email";

// movie-log spec: logging a viewing, via the manual form or by parsing a
// Pathé booking email, with best-effort OMDb enrichment. See
// log-viewing.ts for the shared write path both entry points use.
//
// location-management spec: the medium/venue picklists (a sidecar CalDAV
// object, see src/lib/caldav/client.ts) are offered as <datalist>
// suggestions rather than a closed dropdown, so logging with a new
// medium/venue still works — it's just not offered as a choice until
// this same form's own submission adds it, per "First venue added".
export class MovieLogForm extends HTMLElement {
  private credentials: Credentials | null | undefined;
  private statusEl: HTMLElement | undefined;
  private picklists: Picklists = { media: [], venues: [] };
  private mediumList: HTMLDataListElement | undefined;
  private venueList: HTMLDataListElement | undefined;

  private get caldavConfig(): CaldavConfig {
    if (!this.credentials) throw new Error("<movie-log-form> requires stored credentials");
    return {
      baseUrl: this.credentials.caldavUrl,
      username: this.credentials.caldavUsername,
      password: this.credentials.caldavPassword,
    };
  }

  async connectedCallback() {
    this.credentials = await getCredentialsStore().get();
    if (!this.credentials) {
      throw new Error("<movie-log-form> requires stored credentials");
    }

    this.innerHTML = "";
    this.statusEl = document.createElement("p");
    this.statusEl.setAttribute("role", "status");
    this.mediumList = document.createElement("datalist");
    this.mediumList.id = "log-medium-choices";
    this.venueList = document.createElement("datalist");
    this.venueList.id = "log-venue-choices";

    this.append(
      this.buildManualForm(),
      this.buildPatheEmailSection(),
      this.mediumList,
      this.venueList,
      this.statusEl,
    );

    // Best-effort — a picklist fetch failure shouldn't block logging, same
    // spirit as OMDb enrichment failing soft elsewhere in this form.
    try {
      this.picklists = await getPicklists(this.caldavConfig);
      this.renderPicklistOptions();
    } catch {
      // Suggestions just stay empty; free-text entry still works.
    }
  }

  private renderPicklistOptions() {
    const toOption = (value: string) => {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = value;
      return option;
    };
    this.mediumList?.replaceChildren(...this.picklists.media.map(toOption));
    this.venueList?.replaceChildren(...this.picklists.venues.map(toOption));
  }

  // location-management spec, "First venue added": logging with a
  // medium/venue not already in the picklist adds it — auto-learned from
  // what visitors actually type, no separate management screen needed.
  private async learnFromViewing(medium: string, venue: string | undefined) {
    let changed = false;
    if (medium && !this.picklists.media.includes(medium)) {
      this.picklists.media = [...this.picklists.media, medium];
      changed = true;
    }
    if (venue && !this.picklists.venues.includes(venue)) {
      this.picklists.venues = [...this.picklists.venues, venue];
      changed = true;
    }
    if (!changed) return;
    this.renderPicklistOptions();
    try {
      await updatePicklists(this.caldavConfig, this.picklists);
    } catch {
      // The next log attempt just re-learns it; not worth failing on.
    }
  }

  private buildManualForm(): HTMLFormElement {
    const form = document.createElement("form");
    form.setAttribute("aria-label", "Log a viewing manually");

    const fields: [string, string, string, boolean, string?][] = [
      ["log-title", "Title", "text", true],
      ["log-start", "Start", "datetime-local", true],
      ["log-end", "End", "datetime-local", true],
      ["log-medium", "Medium", "text", true, "log-medium-choices"],
      ["log-venue", "Venue", "text", false, "log-venue-choices"],
    ];
    for (const [id, labelText, type, required, listId] of fields) {
      const wrapper = document.createElement("div");
      const label = document.createElement("label");
      label.htmlFor = id;
      label.textContent = labelText;
      const input = document.createElement("input");
      input.id = id;
      input.name = id;
      input.type = type;
      input.required = required;
      if (listId) input.setAttribute("list", listId);
      wrapper.append(label, input);
      form.appendChild(wrapper);
    }

    const submit = document.createElement("button");
    submit.type = "submit";
    submit.textContent = "Log viewing";
    form.appendChild(submit);

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (!this.credentials || !this.statusEl) return;
      const data = new FormData(form);
      const start = String(data.get("log-start"));
      const end = String(data.get("log-end"));
      const medium = String(data.get("log-medium"));
      const venue = String(data.get("log-venue") || "") || undefined;
      try {
        await logManualViewing(this.credentials, {
          title: String(data.get("log-title")),
          start: new Date(start).toISOString(),
          end: new Date(end).toISOString(),
          medium,
          venue,
        });
        this.statusEl.textContent = "Logged.";
        form.reset();
        await this.learnFromViewing(medium, venue);
      } catch (error) {
        this.statusEl.textContent =
          error instanceof Error ? error.message : "Failed to log viewing.";
      }
    });

    return form;
  }

  private buildPatheEmailSection(): HTMLElement {
    const section = document.createElement("section");
    section.setAttribute("aria-label", "Log from a Pathé booking email");

    const label = document.createElement("label");
    label.htmlFor = "pathe-email-text";
    label.textContent = "Paste the booking confirmation email, or upload the .eml file";
    const textarea = document.createElement("textarea");
    textarea.id = "pathe-email-text";
    const fileInput = document.createElement("input");
    fileInput.type = "file";
    fileInput.accept = ".eml,message/rfc822";
    fileInput.setAttribute("aria-label", "Upload a Pathé booking confirmation .eml file");
    fileInput.addEventListener("change", async () => {
      const file = fileInput.files?.[0];
      if (file) textarea.value = await file.text();
    });

    const parseButton = document.createElement("button");
    parseButton.type = "button";
    parseButton.textContent = "Parse";

    const confirmArea = document.createElement("div");
    confirmArea.hidden = true;

    let parsedBooking: PatheBooking | undefined;

    parseButton.addEventListener("click", async () => {
      if (!this.statusEl) return;
      try {
        parsedBooking = await parsePatheEmail(textarea.value);
        this.renderConfirmArea(confirmArea, parsedBooking);
        confirmArea.hidden = false;
        this.statusEl.textContent = "";
      } catch (error) {
        confirmArea.hidden = true;
        this.statusEl.textContent =
          error instanceof Error ? error.message : "Could not parse this email.";
      }
    });

    const confirmButton = document.createElement("button");
    confirmButton.type = "button";
    confirmButton.textContent = "Confirm and log";
    confirmButton.addEventListener("click", async () => {
      if (!parsedBooking || !this.credentials || !this.statusEl) return;
      try {
        const { wasUpdate } = await logPatheBooking(this.credentials, parsedBooking);
        this.statusEl.textContent = wasUpdate ? "Updated the existing entry." : "Logged.";
        confirmArea.hidden = true;
        await this.learnFromViewing("cinema", parsedBooking.cinema);
        textarea.value = "";
        parsedBooking = undefined;
      } catch (error) {
        this.statusEl.textContent =
          error instanceof Error ? error.message : "Failed to log viewing.";
      }
    });
    confirmArea.appendChild(confirmButton);

    section.append(label, textarea, fileInput, parseButton, confirmArea);
    return section;
  }

  private renderConfirmArea(confirmArea: HTMLElement, booking: PatheBooking) {
    const existingButton = confirmArea.querySelector("button");
    confirmArea.innerHTML = "";
    const summary = document.createElement("dl");
    for (const [term, value] of [
      ["Title", booking.title],
      ["Start", new Date(booking.start).toLocaleString()],
      ["End", new Date(booking.end).toLocaleString()],
      ["Cinema", booking.cinema],
      ["Booking number", booking.bookingRef],
    ]) {
      const dt = document.createElement("dt");
      dt.textContent = term;
      const dd = document.createElement("dd");
      dd.textContent = value;
      summary.append(dt, dd);
    }
    confirmArea.appendChild(summary);
    if (existingButton) confirmArea.appendChild(existingButton);
  }
}

customElements.define("movie-log-form", MovieLogForm);
