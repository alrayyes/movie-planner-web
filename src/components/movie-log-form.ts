import { getCredentialsStore } from "../lib/credentials/store";
import type { Credentials } from "../lib/credentials/types";
import { logManualViewing, logPatheBooking } from "../lib/movie-log/log-viewing";
import { type PatheBooking, parsePatheEmail } from "../lib/movie-log/pathe-email";

// movie-log spec: logging a viewing, via the manual form or by parsing a
// Pathé booking email, with best-effort OMDb enrichment. See
// log-viewing.ts for the shared write path both entry points use.
export class MovieLogForm extends HTMLElement {
  private credentials: Credentials | null | undefined;
  private statusEl: HTMLElement | undefined;

  async connectedCallback() {
    this.credentials = await getCredentialsStore().get();
    if (!this.credentials) {
      throw new Error("<movie-log-form> requires stored credentials");
    }

    this.innerHTML = "";
    this.statusEl = document.createElement("p");
    this.statusEl.setAttribute("role", "status");

    this.append(this.buildManualForm(), this.buildPatheEmailSection(), this.statusEl);
  }

  private buildManualForm(): HTMLFormElement {
    const form = document.createElement("form");
    form.setAttribute("aria-label", "Log a viewing manually");

    const fields: [string, string, string, boolean][] = [
      ["log-title", "Title", "text", true],
      ["log-start", "Start", "datetime-local", true],
      ["log-end", "End", "datetime-local", true],
      ["log-medium", "Medium", "text", true],
      ["log-venue", "Venue", "text", false],
    ];
    for (const [id, labelText, type, required] of fields) {
      const wrapper = document.createElement("div");
      const label = document.createElement("label");
      label.htmlFor = id;
      label.textContent = labelText;
      const input = document.createElement("input");
      input.id = id;
      input.name = id;
      input.type = type;
      input.required = required;
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
      try {
        await logManualViewing(this.credentials, {
          title: String(data.get("log-title")),
          start: new Date(start).toISOString(),
          end: new Date(end).toISOString(),
          medium: String(data.get("log-medium")),
          venue: String(data.get("log-venue") || "") || undefined,
        });
        this.statusEl.textContent = "Logged.";
        form.reset();
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
