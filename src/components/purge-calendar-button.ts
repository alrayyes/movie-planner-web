import { purgeCalendar } from "../lib/caldav/purge-calendar";
import type { CaldavConfig } from "../lib/caldav/types";
import { CREDENTIALS_CONNECTED_EVENT, getCredentialsStore } from "../lib/credentials/store";
import { BUTTON_DANGER, BUTTON_SECONDARY, INPUT, LABEL, STATUS_TEXT } from "../lib/ui/classes";

// #835: deletes every viewing on the visitor's CalDAV calendar. Unlike the
// local cache clear beside it, this destroys the visitor's own data, so it sits
// in its own "Danger zone" and doesn't use a native confirm dialog: the visitor
// types a word, and the delete button stays disabled until they have.
const CONFIRM_WORD = "DELETE";

export class PurgeCalendarButton extends HTMLElement {
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

    const explanation = document.createElement("p");
    explanation.className = STATUS_TEXT;
    explanation.textContent =
      "Deletes every viewing on your CalDAV calendar, on the server. This can't be undone, and it isn't the same as clearing the local cache. Your venue and medium lists are kept. Export your viewings first if you might want them back.";

    // No `role="status"` until there's a message, as in the other Data controls.
    const status = document.createElement("p");
    status.className = STATUS_TEXT;

    const open = document.createElement("button");
    open.type = "button";
    open.className = BUTTON_SECONDARY;
    open.textContent = "Purge calendar…";

    const panel = document.createElement("div");
    panel.hidden = true;
    panel.className =
      "flex flex-col gap-3 rounded-lg border border-red-300 bg-red-50 p-3 dark:border-red-700 dark:bg-red-950";

    const label = document.createElement("label");
    label.className = LABEL;
    label.htmlFor = "purge-confirm";
    label.textContent = `To delete every viewing, type ${CONFIRM_WORD} below.`;
    const input = document.createElement("input");
    input.id = "purge-confirm";
    input.type = "text";
    input.className = INPUT;
    input.autocomplete = "off";
    input.spellcheck = false;

    const confirm = document.createElement("button");
    confirm.type = "button";
    confirm.className = BUTTON_DANGER;
    confirm.textContent = "Permanently delete all viewings";
    confirm.disabled = true;

    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.className = BUTTON_SECONDARY;
    cancel.textContent = "Cancel";

    const progress = document.createElement("progress");
    progress.hidden = true;
    progress.className = "w-full";
    progress.setAttribute("aria-label", "Purge progress");

    const buttons = document.createElement("div");
    buttons.className = "flex flex-wrap items-center gap-3";
    buttons.append(confirm, cancel);
    panel.append(label, input, buttons, progress);

    const announce = (text: string) => {
      status.setAttribute("role", "status");
      status.textContent = text;
    };
    const close = () => {
      panel.hidden = true;
      input.value = "";
      confirm.disabled = true;
      open.hidden = false;
    };

    open.addEventListener("click", () => {
      status.removeAttribute("role");
      status.textContent = "";
      panel.hidden = false;
      open.hidden = true;
      input.focus();
    });
    input.addEventListener("input", () => {
      confirm.disabled = input.value.trim() !== CONFIRM_WORD;
    });
    cancel.addEventListener("click", () => {
      close();
      open.focus();
    });
    confirm.addEventListener("click", async () => {
      if (input.value.trim() !== CONFIRM_WORD) return;
      for (const control of [input, confirm, cancel]) control.disabled = true;
      progress.hidden = false;
      progress.removeAttribute("value");
      announce("Deleting…");
      try {
        const { deleted, failed, firstError } = await purgeCalendar(config, (done, total) => {
          progress.max = total;
          progress.value = done;
          status.textContent = `Deleting ${done} of ${total}…`;
        });
        const noun = (n: number) => `viewing${n === 1 ? "" : "s"}`;
        announce(
          failed === 0
            ? `Deleted ${deleted} ${noun(deleted)}.`
            : `Deleted ${deleted} ${noun(deleted)}. ${failed} could not be deleted (${firstError}); try again.`,
        );
      } catch (error) {
        announce(error instanceof Error ? error.message : "Failed to purge the calendar.");
      } finally {
        progress.hidden = true;
        input.disabled = false;
        cancel.disabled = false;
        close();
        open.focus();
      }
    });

    const wrapper = document.createElement("div");
    wrapper.className = "flex flex-col gap-2";
    wrapper.append(explanation, open, panel, status);
    this.replaceChildren(wrapper);
  }
}

customElements.define("purge-calendar-button", PurgeCalendarButton);
